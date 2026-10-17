import { describe, expect, it, vi } from "vitest";
import { InMemoryRetriever, type Embedder } from "../src/rag.js";
import { createAiService, deduplicateQuestionCandidates, nextRequiredInterviewQuestion, planNextQuestion } from "../src/service.js";
import type { ChatCompleter } from "../src/amd-client.js";
import type { IntakeState } from "../src/contracts.js";
import { applyIntakeTurn, recordPatientAnswer } from "../src/workflow.js";

const state = {
  schemaVersion: "1.0",
  concern: "Mild headache since yesterday",
  responses: [{ id: "r1", text: "I have had a mild headache since yesterday.", sequence: 0 }],
  fields: [],
  questionsAsked: [],
  completion: "in_progress",
};

const embedder: Embedder = async (texts) => texts.map(() => [1, 0]);

async function serviceWith(content: string) {
  const retriever = await InMemoryRetriever.create([{ sourceId: "guidance", markdown: "# Intake\nAsk one question at a time." }], embedder);
  const client: ChatCompleter = { complete: vi.fn().mockResolvedValue(content) };
  return { service: createAiService(client, retriever), client };
}

describe("AI service behavior with mocked inference", () => {
  it("starts an intake without calling the provider", async () => {
    const { service, client } = await serviceWith("{}");
    const result = service.startIntake();
    expect(result.state.responses).toEqual([]);
    expect(result.assistantMessage).toMatch(/what have you been feeling/i);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("returns a useful in-chat clinician draft when the patient asks to organize the consultation", async () => {
    const { service, client } = await serviceWith("{}");
    const started = service.startIntake();
    const first = recordPatientAnswer(started.state, "I have a crushing headache, cramping I can't describe well, no other symptoms, and I think my temperature is 37.5 degrees.");
    const adviceQuestion = recordPatientAnswer(first.state, "What can I do instead to ease the pain?");
    expect(adviceQuestion.state.fields.some((field) => field.fieldId === "headache_location" && field.sourceResponseIds.includes(adviceQuestion.responseId))).toBe(false);
    const visitTips = recordPatientAnswer(adviceQuestion.state, "Do you have any tips before I go to the doctor?");
    const nextStepQuestion = recordPatientAnswer(visitTips.state, "What’s next then?");
    const summaryRequest = recordPatientAnswer(nextStepQuestion.state, "Organize now");
    const result = await service.continueIntake({ state: summaryRequest.state, latestResponseId: summaryRequest.responseId });
    if ("safety" in result) throw new Error("Expected a summary, received a safety route");
    expect(result.assistantMessage).toMatch(/draft summary to review and share with your doctor/i);
    expect(result.assistantMessage).toMatch(/headache/i);
    expect(result.assistantMessage).toMatch(/crushing/i);
    expect(result.assistantMessage).toMatch(/cramping/i);
    expect(result.assistantMessage).toMatch(/37\.5/);
    expect(result.assistantMessage).toMatch(/no other symptoms/i);
    expect(result.assistantMessage).toMatch(/what can i do instead to ease the pain/i);
    expect(result.assistantMessage).toMatch(/tips before i go to the doctor/i);
    expect(result.assistantMessage).not.toMatch(/what's next then/i);
    expect(result.assistantMessage).not.toMatch(/about I have/i);
    expect(result.assistantMessage).not.toMatch(/also experiencing a headache/i);
    expect(result.assistantMessage).toMatch(/not a diagnosis/i);
    expect(result.assistantMessage).not.toMatch(/response-\d+/i);
    expect(result.assistantMessage).not.toMatch(/Conflicting patient reports/i);
    expect(result.assistantMessage).not.toMatch(/describe the temperature measurement/i);
    expect(result.askedQuestion).toBeNull();
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("explains the next step directly instead of returning a notes-style fallback", async () => {
    const { service, client } = await serviceWith("{}");
    const started = service.startIntake();
    const first = recordPatientAnswer(started.state, "I have a crushing headache.");
    const nextStepRequest = recordPatientAnswer(first.state, "What’s next then?");
    const result = await service.continueIntake({ state: nextStepRequest.state, latestResponseId: nextStepRequest.responseId });
    if ("safety" in result) throw new Error("Expected a workflow answer, received a safety route");
    expect(result.assistantMessage).toMatch(/draft consultation summary/i);
    expect(result.assistantMessage).toMatch(/review and correct it/i);
    expect(result.askedQuestion).toBeNull();
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("uses local-model output for an opening greeting without recording it as a health answer", async () => {
    const { service, client } = await serviceWith(JSON.stringify({
      assistantMessage: "Hi! What would you like help preparing to discuss today?",
      askedQuestion: "What would you like help preparing to discuss today?",
    }));
    const greetingState: IntakeState = {
      schemaVersion: "1.0",
      concern: "",
      responses: [{ id: "r1", text: "hi", sequence: 0 }],
      fields: [],
      questionsAsked: ["What have you been feeling?"],
      activeQuestionId: "main_concern",
      completion: "in_progress",
    };
    const result = await service.continueIntake({ state: greetingState });
    if ("safety" in result) throw new Error("Expected greeting response, received safety route");
    expect(result.assistantMessage).toMatch(/^Hi!/);
    expect(result.assistantMessage).toMatch(/what would you like help preparing to discuss/i);
    expect(result.fieldUpdates).toEqual([]);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(result.askedQuestionId).toBe("main_concern");
  });

  it("keeps the assistant from echoing the patient's symptoms in first person", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "I’m feeling a headache with chills and a temperature of 39.2 degrees. When did each symptom begin?",
    }));
    const patientText = "I have a headache with chills and fever of 39.2 degrees. I felt this around 3 hours ago.";
    const result = await service.continueIntake({
      state: {
        schemaVersion: "1.0",
        concern: patientText,
        responses: [{ id: "r1", text: patientText, sequence: 0 }],
        fields: [],
        questionsAsked: ["What have you been feeling?"],
        activeQuestionId: "main_concern",
        completion: "in_progress",
      },
    });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result.assistantMessage).not.toMatch(/I’m feeling/i);
    expect(result.assistantMessage).toContain("headache");
    expect(result.assistantMessage).toContain("39.2");
    expect(result.askedQuestion).not.toMatch(/when did .* begin/i);
  });

  it("acknowledges a full echoed symptom message without repeating it back", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "I have headache in your notes, with 37.5 recorded as your estimate. When did the cramping begin?",
    }));
    const start = service.startIntake().state;
    const recorded = recordPatientAnswer(start, "I have a crushing headache and cramping I can't describe well. I think my temperature is 37.5 degrees, but I'm not sure; it began around midnight. I have no other symptoms.");
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected a routine response, received a safety route");
    expect(result.assistantMessage).toMatch(/headache and cramping/i);
    expect(result.assistantMessage).toMatch(/37\.5 degrees/i);
    expect(result.assistantMessage).toMatch(/estimate/i);
    expect(result.assistantMessage).toMatch(/no other symptoms/i);
    expect(result.assistantMessage).not.toMatch(/I have a crushing headache and cramping sensation/i);
    expect(result.askedQuestion).not.toMatch(/when did .* begin/i);
  });

  it("never displays a nested or truncated JSON object as a patient-facing response", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: '{"assistantMessage":"I have a crushing headache and cramping, and my temperature is 37.5 degrees. It started around midnight, and there are.',
    }));
    const start = service.startIntake().state;
    const recorded = recordPatientAnswer(start, "I have a crushing headache and cramping I can't describe well. I think my temperature is 37.5 degrees, but I'm not sure. It started around midnight. I have no other symptoms.");
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected a routine response, received a safety route");

    expect(result.assistantMessage).not.toMatch(/^\s*\{/);
    expect(result.assistantMessage).toMatch(/headache and cramping/i);
    expect(result.assistantMessage).toMatch(/no other symptoms/i);
    expect(result.askedQuestion).toMatch(/where do you feel the headache/i);
  });

  it("replaces a model echo of the whole symptom message with a brief contextual acknowledgment", async () => {
    const { service } = await serviceWith(JSON.stringify({ assistantMessage: "I have a crushing headache and cramping I can't describe well. My temperature is 37.5 degrees, but I'm not sure. It started around midnight." }));
    const start = service.startIntake().state;
    const recorded = recordPatientAnswer(start, "I have a crushing headache and cramping I can't describe well. I think my temperature is 37.5 degrees, but I'm not sure. It started around midnight. I have no other symptoms.");
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected a routine response, received a safety route");

    expect(result.assistantMessage).toMatch(/^I’ve noted|^I have|^Okay/i);
    expect(result.assistantMessage).toMatch(/no other symptoms/i);
    expect(result.assistantMessage).toMatch(/estimate/i);
    expect(result.assistantMessage).not.toMatch(/I have a crushing headache/i);
    expect(result.askedQuestion).toMatch(/where do you feel the headache/i);
  });

  it("handles a patient correcting an assistant misattribution without inventing a fact or asking again", async () => {
    const { service, client } = await serviceWith("not-json");
    const start = service.startIntake().state;
    const first = recordPatientAnswer(start, "I have a headache.");
    const correction = recordPatientAnswer(first.state, "never said that");
    const result = await service.continueIntake({ state: correction.state, latestResponseId: correction.responseId });
    if ("safety" in result) throw new Error("Expected a correction response, received a safety route");
    expect(result.assistantMessage).toMatch(/shouldn’t have attributed that to you/i);
    expect(result.askedQuestion).toBeNull();
    expect(correction.state.fields.some((field) => field.value?.toLowerCase().includes("never said that"))).toBe(false);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("uses the configured model for vague or confusing patient turns instead of canned acknowledgements", async () => {
    const { service, client } = await serviceWith(JSON.stringify({
      assistantMessage: "I’m sorry my question wasn’t clear. When you say unwell, what feels most noticeable right now?",
      askedQuestion: "When you say unwell, what feels most noticeable right now?",
    }));
    const vagueState: IntakeState = {
      schemaVersion: "1.0",
      concern: "",
      responses: [{ id: "r1", text: "unwell", sequence: 0 }],
      fields: [],
      questionsAsked: ["What have you been feeling?"],
      activeQuestionId: "main_concern",
      completion: "in_progress",
    };

    const result = await service.continueIntake({ state: vagueState, latestResponseId: "r1" });

    if ("safety" in result) throw new Error("Expected a conversational response, received safety route");
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.complete).mock.calls[0]?.[0]?.[1]?.content).toContain('"text":"unwell"');
    expect(result.assistantMessage).toContain("I’m sorry my question wasn’t clear.");
  });

  it("does not turn a short no to an open description question into a claim of no symptoms", async () => {
    const { service } = await serviceWith(JSON.stringify({ assistantMessage: "I’ve noted your reply." }));
    const start = service.startIntake().state;
    const asked = applyIntakeTurn(start, {
      askedQuestion: "How would you describe the concern in your own words?",
      askedQuestionId: "main_concern",
      askedQuestionIds: ["main_concern"],
      fieldUpdates: [],
    });
    const recorded = recordPatientAnswer(asked, "no");
    expect(recorded.state.fields.some((field) => field.fieldId === "current_symptoms" && field.status === "patient_denied")).toBe(false);
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected a clarification, received safety route");
    expect(result.askedQuestion).toContain("When you say “no,”");
    expect(result.askedQuestion).toContain("or did you mean something else?");
  });

  it("surfaces model unavailability instead of pretending a canned intake reply came from AI", async () => {
    const retriever = await InMemoryRetriever.create([], embedder);
    const client: ChatCompleter = {
      complete: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const service = createAiService(client, retriever);

    await expect(service.continueIntake({ state })).rejects.toThrow("provider unavailable");
  });

  it("keeps completed intakes closed without asking or calling the provider again", async () => {
    const { service, client } = await serviceWith("{}");
    const result = await service.continueIntake({ state: { ...state, completion: "completed", patientConfirmed: true } });
    expect(result).toEqual({ assistantMessage: "This intake is complete.", askedQuestion: null, askedQuestionId: null, fieldUpdates: [] });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("declines clearly unrelated chat topics without calling the provider", async () => {
    const { service, client } = await serviceWith("{}");
    const result = await service.answerQuestion({ question: "Who won the football match?" });
    expect(result).toMatchObject({ scope: "out_of_scope" });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("blocks personal diagnosis and medication requests before inference", async () => {
    const { service, client } = await serviceWith("{}");
    const diagnosis = await service.answerQuestion({ question: "What condition do I have?" });
    const medication = await service.answerQuestion({ question: "Can I take this medication for my headache?" });
    expect(diagnosis.answer).toMatch(/can't diagnose/i);
    expect(medication.answer).toMatch(/can't diagnose/i);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("returns urgent guidance before inference for a configured trigger", async () => {
    const { service, client } = await serviceWith("{}");
    const result = await service.answerQuestion({ question: "I have severe chest pain" });
    expect(result.answer).toMatch(/contact local emergency services/i);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("routes a personal possible heart attack concern to urgent guidance", async () => {
    const { service, client } = await serviceWith("{}");
    const result = await service.answerQuestion({ question: "Am I having a heart attack?" });
    expect(result.answer).toMatch(/contact local emergency services/i);
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("answers general health questions through the model in educational mode", async () => {
    const { service, client } = await serviceWith(JSON.stringify({ answer: "A fever is a temporary rise in body temperature." }));
    const result = await service.answerQuestion({ question: "What is a fever?" });
    expect(result).toEqual({ scope: "medical", answer: "A fever is a temporary rise in body temperature." });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it("carries short in-scope follow-ups with bounded conversation context", async () => {
    const retriever = await InMemoryRetriever.create([{ sourceId: "guidance", markdown: "# Intake\nAsk one question at a time." }], embedder);
    const client: ChatCompleter = { complete: vi.fn().mockResolvedValue(JSON.stringify({ answer: "It is one way the body responds to illness." })) };
    const service = createAiService(client, retriever);
    const history = [{ question: "What is a fever?", answer: "A temporary rise in body temperature." }];
    const result = await service.answerQuestion({ question: "Why?", conversationHistory: history });
    expect(result.scope).toBe("medical");
    expect(vi.mocked(client.complete).mock.calls[0]?.[0]?.[1]?.content).toContain("A temporary rise in body temperature.");
  });

  it("answers system questions with retrieved project context", async () => {
    const { service, client } = await serviceWith(JSON.stringify({ answer: "It keeps patient statements linked to their original response IDs." }));
    const result = await service.answerQuestion({ question: "How does ConsultPrep preserve patient response sources?" });
    expect(result.scope).toBe("system");
    const messages = vi.mocked(client.complete).mock.calls[0]?.[0] ?? [];
    expect(messages[1]?.content).toContain("Ask one question at a time");
  });

  it("returns a validated follow-up and sourced field update", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Where do you feel the headache?",
      askedQuestion: "Where do you feel the headache?",
      fieldUpdates: [{ fieldId: "timeline", value: "Since yesterday", status: "reported", sourceResponseIds: ["r1"] }],
    }));
    const result = await service.continueIntake({ state });
    expect(result).toMatchObject({ askedQuestion: "Where do you feel the headache, and does it stay there or move?", askedQuestionId: "headache_location" });
  });

  it("answers a direct question without appending the next intake question", async () => {
    const { service, client } = await serviceWith(JSON.stringify({
      assistantMessage: "I can’t determine the cause from chat. Please contact a qualified healthcare professional for advice.",
      askedQuestion: null,
    }));
    const activeState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [{ id: "r1", text: "What can I do today?", sequence: 0, questionBankId: "headache_associated" }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      questionsAsked: ["Have you noticed any other changes along with the headache?"],
      activeQuestionId: "headache_associated",
    };
    const result = await service.continueIntake({ state: activeState, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected a direct answer, received a safety route");
    expect(result.askedQuestion).toBeNull();
    expect(result.assistantMessage).not.toMatch(/have you noticed|when did/i);
    expect(client.complete).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ maxTokens: 36, reasoningEffort: "none" }));
  });

  it("recovers a direct guidance request with an actionable answer when the model only recaps symptoms", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "I have a headache at the front of my head, which feels crushing, and I have cold-like symptoms. My temperature is 37.5 degrees. Let me know what you need!",
      askedQuestion: null,
    }));
    const activeState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [
        { id: "r1", text: "I have a headache and cold symptoms.", sequence: 0 },
        { id: "r5", text: "What can I do today?", sequence: 4 },
      ],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      currentIntent: "guidance_request",
    };
    const result = await service.continueIntake({ state: activeState, latestResponseId: "r5" });
    if ("safety" in result) throw new Error("Expected a direct answer, received a safety route");
    expect(result.assistantMessage).toMatch(/contact a qualified healthcare professional/i);
    expect(result.assistantMessage).toMatch(/rest(?:ing)? (?:somewhere|in a) quiet, (?:dark|dim) room/i);
    expect(result.assistantMessage).toMatch(/water/i);
    expect(result.askedQuestion).toBeNull();
  });

  it("replaces an incomplete notes-style reply to a direct action question with safe, relevant steps", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "I have that detail in your notes. I can help organize what you’ve shared.",
      askedQuestion: null,
    }));
    const activeState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [
        { id: "r1", text: "I have a headache.", sequence: 0 },
        { id: "r2", text: "What can I do instead to ease the pain?", sequence: 1 },
      ],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      currentIntent: "guidance_request",
    };
    const result = await service.continueIntake({ state: activeState, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected a safe direct answer, received a safety route");
    expect(result.assistantMessage).toMatch(/rest(?:ing)? (?:somewhere|in a) quiet, (?:dark|dim) room/i);
    expect(result.assistantMessage).toMatch(/water/i);
    expect(result.assistantMessage).toMatch(/can’t tell what’s causing the headache/i);
    expect(result.askedQuestion).toBeNull();
    expect(result.guidanceProvided?.sourceResponseIds).toEqual(["r2"]);
  });

  it.each([
    "To ease the pain, consider resting, taking over-the-counter pain relievers (like ibuprofen), and consulting a healthcare provider.",
    "Taking paracetamol may help ease the pain.",
    "Try an OTC pain reliever and ask a clinician if it is right for you.",
  ])("replaces model medication suggestions with non-medication comfort guidance: %s", async (unsafeReply) => {
    const { service } = await serviceWith(JSON.stringify({ assistantMessage: unsafeReply, askedQuestion: null }));
    const activeState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [{ id: "r1", text: "What can I do to ease the pain?", sequence: 0 }],
      fields: [{ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] }],
      currentIntent: "guidance_request",
    };

    const result = await service.continueIntake({ state: activeState, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected a safe direct answer, received a safety route");
    expect(result.assistantMessage).toMatch(/rest|quiet|dim|water|clinician/i);
    expect(result.assistantMessage).not.toMatch(/ibuprofen|paracetamol|pain reliever|OTC|medication/i);
    expect(result.askedQuestion).toBeNull();
  });

  it("answers a typo-ridden question before resuming the intake and avoids repeating its last advice verbatim", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "I’ve noted that. I can’t determine the cause from this conversation. A qualified healthcare professional can assess what may be going on.",
      askedQuestion: null,
    }));
    const activeState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [
        { id: "r1", text: "I have a crushing headache and cramping.", sequence: 0 },
        { id: "r2", text: "What can I do instead to ease the pain?", sequence: 1 },
        { id: "r3", text: "dont you have any tips before i go to the doctr?", sequence: 2 },
      ],
      fields: [
        { fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "headache_character", value: "Crushing", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "cramping", value: "Cramping", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "patient_question", value: "What can I do instead to ease the pain", status: "reported", sourceResponseIds: ["r2"] },
      ],
      currentIntent: "guidance_request",
      recentAssistantMessages: ["That sounds uncomfortable. I can’t tell what’s causing the headache from chat. For general comfort, try resting in a quiet, dim room and sipping water if you’re able. A qualified healthcare professional can advise based on your situation."],
    };
    const result = await service.continueIntake({ state: activeState, latestResponseId: "r3" });
    if ("safety" in result) throw new Error("Expected practical guidance, received a safety route");
    expect(result.assistantMessage).toMatch(/before the visit|for the appointment/i);
    expect(result.assistantMessage).toMatch(/rest|water/i);
    expect(result.assistantMessage).toMatch(/can't tell|can’t tell|can't determine|can’t determine/i);
    expect(result.assistantMessage).not.toMatch(/migraine/i);
    expect(result.askedQuestion).toBeNull();
  });

  it("recovers unsupported emergency directions with a safe direct answer", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Call 911 now and go to the emergency department.",
      askedQuestion: null,
    }));
    const directState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [{ id: "r1", text: "What can I do today?", sequence: 0 }],
    };
    const result = await service.continueIntake({ state: directState, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected a safe direct answer, received a safety route");
    expect(result.assistantMessage).toMatch(/contact a qualified healthcare professional/i);
    expect(result.assistantMessage).not.toMatch(/call 911|emergency department/i);
    expect(result.askedQuestion).toBeNull();
  });

  it("answers a direct guidance question safely when the model returns malformed output", async () => {
    const { service, client } = await serviceWith("not-json");
    const directState: IntakeState = {
      ...state,
      schemaVersion: "1.0",
      completion: "in_progress",
      responses: [{ id: "r1", text: "What can I do today?", sequence: 0 }],
      currentIntent: "guidance_request",
    };
    const result = await service.continueIntake({ state: directState, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected a safe direct answer, received a safety route");
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(result.assistantMessage).toMatch(/contact a qualified healthcare professional/i);
    expect(result.guidanceProvided?.sourceResponseIds).toEqual(["r1"]);
    expect(result.askedQuestion).toBeNull();
  });

  it("routes urgent synthetic input without calling the model", async () => {
    const { service, client } = await serviceWith("{}");
    const result = await service.continueIntake({ state: { ...state, responses: [{ id: "urgent", text: "I have severe chest pain", sequence: 0 }] } });
    expect(result).toMatchObject({
      safety: { routed: true, matchedResponseIds: ["urgent"] },
      state: { completion: "emergency_interrupted", safety: { routed: true, matchedResponseIds: ["urgent"] } },
    });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("discards model-proposed fields with unknown source IDs but preserves the interview turn", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "When did the headache begin?",
      askedQuestion: "When did the headache begin?",
      fieldUpdates: [{ fieldId: "dizziness", value: "Dizziness", status: "reported", sourceResponseIds: ["fabricated"] }],
    }));
    const recorded = recordPatientAnswer(service.startIntake().state, "I have had a mild headache since yesterday.");
    await expect(service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId })).resolves.toMatchObject({
      assistantMessage: expect.stringContaining("Where do you feel the headache, and does it stay there or move?"),
      fieldUpdates: [
        { fieldId: "primary_concern", value: "I have had a mild headache since yesterday", sourceResponseIds: ["response-1"] },
        { fieldId: "headache", value: "Headache", sourceResponseIds: ["response-1"] },
        { fieldId: "onset", value: "Yesterday", sourceResponseIds: ["response-1"] },
        { fieldId: "symptom_onset_headache", value: "Yesterday", sourceResponseIds: ["response-1"] },
      ],
    });
  });

  it("surfaces malformed model output instead of substituting a canned intake reply", async () => {
    const { service } = await serviceWith("not-json");
    const before = structuredClone(state);
    await expect(service.continueIntake({ state })).rejects.toMatchObject({ code: "invalid_response" });
    expect(state).toEqual(before);
  });

  it("does not ask again for onset, progression, or impact already in the patient's own words", () => {
    const conversationState = {
      ...state,
      concern: "I feel cold and feverish, and I cough. All these symptoms started today when I woke up.",
      responses: [
        { id: "r1", text: "I feel cold and feverish, and I cough. All these symptoms started today when I woke up.", sequence: 0 },
        { id: "r2", text: "No other symptoms", sequence: 1, questionId: "Have you noticed any other symptoms along with these?" },
        { id: "r3", text: "Getting worse", sequence: 2, questionId: "Since they started, have the symptoms been getting better, worse, or staying about the same?" },
        { id: "r4", text: "I feel weak and need to lie down; I cannot do my usual activities", sequence: 3 },
      ],
      questionsAsked: [
        "What have you been feeling?",
        "Have you noticed any other symptoms along with these?",
        "Since they started, have the symptoms been getting better, worse, or staying about the same?",
      ],
    } as IntakeState;
    expect(nextRequiredInterviewQuestion(conversationState)).toBe("Are you having any difficulty breathing right now?");
  });

  it("deduplicates semantically equivalent candidates by their typed information target", () => {
    const candidates = [
      { targetField: "daily_impact" as const, targetConcept: "activity_impact" as const, questionPurpose: "establish_impact" as const, priority: 40, status: "needed" as const, question: "How much are your sore eyes affecting your usual activities?" },
      { targetField: "daily_impact" as const, targetConcept: "activity_impact" as const, questionPurpose: "establish_impact" as const, priority: 41, status: "needed" as const, question: "Are these symptoms interfering with your normal routine?" },
    ];
    expect(deduplicateQuestionCandidates(candidates)).toHaveLength(1);
  });

  it("selects only the one missing required target from current structured state", () => {
    const planned = planNextQuestion({
      ...state,
      fields: [
        { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: ["r1"] },
        { fieldId: "progression", value: "Worsening", status: "reported", sourceResponseIds: ["r1"] },
      ],
    } as IntakeState);
    expect(planned).toMatchObject({ questionId: "headache_location", status: "needed" });
  });

  it("does not equate blurry vision with functional impact and clarifies an unclear impact answer once", () => {
    const base = {
      ...state,
      concern: "I have an unclear health concern",
      responses: [{ id: "r1", text: "My vision is blurry", sequence: 0 }],
      fields: [
        { fieldId: "primary_concern", value: "Unclear health concern", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_character", value: "General concern", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_visual_changes", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "onset_pattern", value: "Gradual", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "previous_episodes", value: "First time", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "episode_pattern", value: "Continuous", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: ["r1"] },
        { fieldId: "progression", value: "Worsening", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "affected_eyes", value: "Both eyes", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "visual_change_description", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "visual_change_timing", value: "Gradual and constant", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "triggers_relief", value: "No change noticed", status: "reported", sourceResponseIds: ["r1"] },
      ],
    } as IntakeState;
    expect(base.fields.some((field) => field.fieldId === "daily_impact")).toBe(false);
    expect(planNextQuestion(base)?.targetConcept).toBe("daily_impact");
    const unclear = { ...base, fields: [...base.fields, { fieldId: "daily_impact", value: null, status: "unclear" as const, sourceResponseIds: ["r1"] }] };
    expect(planNextQuestion(unclear)).toMatchObject({ status: "clarification_needed", questionPurpose: "clarify_impact" });
    expect(planNextQuestion({ ...unclear, questionHistory: [{ questionId: "daily_impact", targetField: "daily_impact", status: "requires_clarification", sourceResponseIds: ["r1"] }], questionsAsked: [...unclear.questionsAsked, "Could you tell me which usual activities, if any, have been harder because of this?"] })?.targetField).not.toBe("daily_impact");
  });

  it("records a contextual none answer and advances through the configured model", async () => {
    const { service, client } = await serviceWith(JSON.stringify({ assistantMessage: "I’ve noted that." }));
    const first = recordPatientAnswer(service.startIntake().state, "I feel cold since I woke up today");
    const withQuestion = applyIntakeTurn(first.state, {
      askedQuestion: "Have you noticed any other symptoms along with this?",
      askedQuestionId: "additional_symptoms",
      askedQuestionIds: ["additional_symptoms"],
      fieldUpdates: [],
    });
    const recorded = recordPatientAnswer(withQuestion, "None");
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result).toMatchObject({
      askedQuestion: "Have you measured your temperature? If so, what was the reading and when did you take it?",
      fieldUpdates: [{ fieldId: "additional_symptoms", status: "patient_denied", sourceResponseIds: ["response-2"] }],
    });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it("stores none to a temperature-measurement question as unknown, not a denial", async () => {
    const { service, client } = await serviceWith(JSON.stringify({ assistantMessage: "I’ve noted that." }));
    const first = recordPatientAnswer(service.startIntake().state, "I feel cold since I woke up today");
    const withQuestion = applyIntakeTurn(first.state, {
      askedQuestion: "Have you measured your temperature? If so, what was the reading and when did you take it?",
      askedQuestionId: "general_temperature",
      askedQuestionIds: ["general_temperature"],
      fieldUpdates: [],
    });
    const recorded = recordPatientAnswer(withQuestion, "None");
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result.fieldUpdates).toContainEqual({
      fieldId: "temperature_measurement",
      value: null,
      status: "unknown",
      sourceResponseIds: ["response-2"],
    });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it("uses model output while recording none at the opening as no symptoms, not an unknown onset", async () => {
    const { service, client } = await serviceWith(JSON.stringify({
      assistantMessage: "Understood. Is that everything you’re feeling today, or would you like to add anything else?",
      askedQuestion: "Is that everything you’re feeling today, or would you like to add anything else?",
    }));
    const opening = recordPatientAnswer(service.startIntake().state, "None");
    const result = await service.continueIntake({ state: opening.state, latestResponseId: opening.responseId });
    if ("safety" in result) throw new Error("Expected routine completion question, received safety route");
    expect(result).toMatchObject({
      askedQuestion: "Is that everything you’re feeling today, or would you like to add anything else?",
      fieldUpdates: [{ fieldId: "current_symptoms", value: "No symptoms reported", status: "patient_denied", sourceResponseIds: ["response-1"] }],
    });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it("keeps only one follow-up question and replaces a question already answered in free text", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Have you noticed any cough? How much are these symptoms affecting your activities? Is that everything?",
      askedQuestion: "How much are these symptoms affecting your activities?",
      fieldUpdates: [],
    }));
    const conversationState = {
      ...state,
      concern: "I have a headache. All these symptoms started today and are getting worse. I need to lie down and cannot do my usual activities.",
      responses: [
        { id: "r1", text: "I have a headache. All these symptoms started today and are getting worse. I need to lie down and cannot do my usual activities.", sequence: 0 },
        { id: "r2", text: "None", sequence: 1, questionId: "Have you noticed any other symptoms along with these?" },
      ],
      questionsAsked: ["What have you been feeling?", "Have you noticed any other symptoms along with these?", "Since they started, have the symptoms been getting better, worse, or staying about the same?"],
    } as IntakeState;
    const result = await service.continueIntake({ state: conversationState, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(nextRequiredInterviewQuestion(conversationState)).toBe("Where do you feel the headache, and does it stay there or move?");
    expect(result.askedQuestion).toBe("Where do you feel the headache, and does it stay there or move?");
    expect(result.assistantMessage.match(/\?/g)).toHaveLength(1);
  });

  it("removes question-like text without question marks before adding the required follow-up", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Thanks for sharing. Could you tell me when the soreness started and whether it has changed since then. When did these symptoms start. When did these symptoms start?",
      askedQuestion: "When did these symptoms start?",
      fieldUpdates: [],
    }));
    const eyeState = {
      ...state,
      concern: "My eyes are sore",
      responses: [{ id: "r1", text: "My eyes are sore", sequence: 0 }],
    } as IntakeState;
    const result = await service.continueIntake({ state: eyeState });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result.askedQuestion).toBe("When did the eye soreness begin?");
    expect(result.assistantMessage).toContain("When did the eye soreness begin?");
    expect(result.assistantMessage).not.toMatch(/^thanks for sharing/i);
    expect(result.assistantMessage.match(/when did/gi)).toHaveLength(1);
  });

  it("varies a generic thank-you opener while preserving the planned question", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Thanks, I have that information. When did the headache begin?",
      askedQuestion: "When did the headache begin?",
      fieldUpdates: [],
    }));
    const result = await service.continueIntake({ state });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result.assistantMessage).not.toMatch(/^thanks/i);
    expect(result.assistantMessage).toContain("Where do you feel the headache, and does it stay there or move?");
  });

  it("removes overlapping activity-impact questions from the model reply and emits one planned question", async () => {
    const { service } = await serviceWith(JSON.stringify({
      assistantMessage: "Thanks for letting me know they are getting worse. How much are your sore eyes affecting your usual activities today. How much are these symptoms affecting your daily activities today?",
      askedQuestion: "How much are these symptoms affecting your daily activities today?",
      fieldUpdates: [],
    }));
    const eyeState = {
      ...state,
      concern: "My eyes are sore",
      responses: [
        { id: "r1", text: "My eyes are sore", sequence: 0 },
        { id: "r2", text: "Today", sequence: 1, questionId: "When did these symptoms start?" },
        { id: "r3", text: "None", sequence: 2, questionId: "Have you noticed any other symptoms along with these?" },
        { id: "r4", text: "Worse", sequence: 3, questionId: "Since they started, have the symptoms been getting better, worse, or staying about the same?" },
      ],
      fields: [
        { fieldId: "eye_soreness", value: "Eye soreness", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_eye_soreness", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
        { fieldId: "symptom_onset_visual_changes", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
        { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
        { fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: ["r3"] },
        { fieldId: "progression", value: "Worsening", status: "reported", sourceResponseIds: ["r4"] },
      ],
      questionsAsked: [
        "What have you been feeling?",
        "When did these symptoms start?",
        "Have you noticed any other symptoms along with these?",
        "Since they started, have the symptoms been getting better, worse, or staying about the same?",
      ],
    } as IntakeState;
    const result = await service.continueIntake({ state: eyeState });
    if ("safety" in result) throw new Error("Expected routine planner output, received safety route");
    expect(result.askedQuestion).toBe("Does this affect one eye or both?");
    expect(result.assistantMessage.match(/\?/g)).toHaveLength(1);
    expect(result.assistantMessage).not.toMatch(/^thanks for sharing/i);
    expect(result.assistantMessage.match(/how much/gi)).toBeNull();
    expect(result.assistantMessage).not.toMatch(/usual activities.*usual activities/i);
    expect(result.assistantMessage).not.toMatch(/^thanks for letting me know/i);
  });

  it("generates a source-validated brief locally without model-generated claims", async () => {
    const { service, client } = await serviceWith("{}");
    await expect(service.generateBrief({ state })).resolves.toMatchObject({ status: "ai_generated_draft", sourceTraceability: [{ responseId: "r1" }] });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("stops brief generation when deterministic safety routing applies", async () => {
    const { service, client } = await serviceWith("{}");
    await expect(service.generateBrief({ state: { ...state, responses: [{ id: "u", text: "I cannot breathe", sequence: 0 }] } })).rejects.toMatchObject({ code: "safety_routed" });
    expect(client.complete).not.toHaveBeenCalled();
  });
});
