import { describe, expect, it, vi } from "vitest";
import { InMemoryRetriever, type Embedder } from "../src/rag.js";
import { createAiService, deduplicateQuestionCandidates, nextRequiredInterviewQuestion, planNextQuestion } from "../src/service.js";
import type { ChatCompleter } from "../src/amd-client.js";
import type { IntakeState } from "../src/contracts.js";

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
    await expect(service.continueIntake({ state })).resolves.toMatchObject({
      assistantMessage: expect.stringContaining("Where do you feel the headache, and does it stay there or move?"),
      fieldUpdates: [
        { fieldId: "headache", value: "Headache", sourceResponseIds: ["r1"] },
        { fieldId: "onset", value: "Yesterday", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_headache", value: "Yesterday", sourceResponseIds: ["r1"] },
      ],
    });
  });

  it("keeps the intake moving with a safe question when mocked model JSON is invalid", async () => {
    const { service } = await serviceWith("not-json");
    const before = structuredClone(state);
    await expect(service.continueIntake({ state })).resolves.toMatchObject({
      askedQuestion: "Where do you feel the headache, and does it stay there or move?",
      fieldUpdates: [
        { fieldId: "headache", value: "Headache", sourceResponseIds: ["r1"] },
        { fieldId: "onset", value: "Yesterday", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_headache", value: "Yesterday", sourceResponseIds: ["r1"] },
      ],
    });
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

  it("records a contextual none answer and advances without another provider request", async () => {
    const { service, client } = await serviceWith("{}");
    const stateWithQuestion = {
      ...state,
      concern: "I feel cold since I woke up today",
      responses: [
        { id: "r1", text: "I feel cold since I woke up today", sequence: 0 },
        { id: "r2", text: "None", sequence: 1, questionId: "Have you noticed any other symptoms along with these?" },
      ],
      questionsAsked: ["What have you been feeling?", "Have you noticed any other symptoms along with these?"],
    };
    const result = await service.continueIntake({ state: stateWithQuestion, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result).toMatchObject({
      askedQuestion: "Have you measured your temperature? If so, what was the reading and when did you take it?",
      fieldUpdates: [{ fieldId: "additional_symptoms", status: "patient_denied", sourceResponseIds: ["r2"] }],
    });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("stores none to a temperature-measurement question as unknown, not a denial", async () => {
    const { service } = await serviceWith("{}");
    const stateWithQuestion = {
      ...state,
      responses: [
        { id: "r1", text: "I feel cold since I woke up today", sequence: 0 },
        { id: "r2", text: "None", sequence: 1, questionId: "Have you checked your temperature today?" },
      ],
      questionsAsked: ["What have you been feeling?", "Have you checked your temperature today?"],
    };
    const result = await service.continueIntake({ state: stateWithQuestion, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected routine follow-up, received safety route");
    expect(result.fieldUpdates).toContainEqual({
      fieldId: "temperature_measurement",
      value: null,
      status: "unknown",
      sourceResponseIds: ["r2"],
    });
  });

  it("treats none in response to the opening symptom question as no symptoms, not an unknown onset", async () => {
    const { service, client } = await serviceWith("{}");
    const openingState = {
      ...state,
      concern: "None",
      responses: [{ id: "r1", text: "None", sequence: 0, questionId: "Hi. What have you been feeling?" }],
      questionsAsked: ["Hi. What have you been feeling?"],
    };
    const result = await service.continueIntake({ state: openingState, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected routine completion question, received safety route");
    expect(result).toMatchObject({
      askedQuestion: "Is that everything you’re feeling today, or would you like to add anything else?",
      fieldUpdates: [{ fieldId: "current_symptoms", value: "No symptoms reported", status: "patient_denied", sourceResponseIds: ["r1"] }],
    });
    expect(client.complete).not.toHaveBeenCalled();
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
    expect(result.assistantMessage).toBe("Thanks for sharing. When did the eye soreness begin?");
    expect(result.assistantMessage.match(/when did/gi)).toHaveLength(1);
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
    expect(result.assistantMessage.match(/how much/gi)).toBeNull();
    expect(result.assistantMessage).not.toMatch(/usual activities.*usual activities/i);
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
