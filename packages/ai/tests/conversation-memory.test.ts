import { describe, expect, it, vi } from "vitest";
import { createAiService, planNextQuestion } from "../src/service.js";
import { InMemoryRetriever } from "../src/rag.js";
import { recordPatientAnswer, applyIntakeTurn } from "../src/workflow.js";
import { extractPatientFacts, extractReportedTemperature } from "../src/intake-facts.js";
import { recallConversation } from "../src/conversation-memory.js";

const opening = "i have headaches, colds, and 37.5 degrees fever i think, and also i felt this around 3 hours ago";
async function setup() {
  const complete = vi.fn().mockResolvedValue(JSON.stringify({ assistantMessage: "I found the temperature and felt fine." }));
  const service = createAiService({ complete }, await InMemoryRetriever.create([], async () => []));
  return { service, complete };
}

describe("conversation memory regression", () => {
  it("records temperature, character, and location volunteered together, and excludes their repeat questions", async () => {
    const { service } = await setup();
    let state = recordPatientAnswer(service.startIntake().state, opening).state;
    state = { ...state, activeQuestionId: "headache_location", questionsAsked: [...state.questionsAsked, "Where do you feel the headache, and does it stay there or move?"] };
    state = recordPatientAnswer(state, "i felt the headache on the front of my head, it does not move, it feels like crushing").state;
    expect(state.fields.find(f => f.fieldId === "temperature_measurement")?.value).toContain("37.5 degrees (unit not specified)");
    expect(state.fields.find(f => f.fieldId === "headache_character")?.value).toBe("Crushing");
    expect(state.fields.find(f => f.fieldId === "headache_location")?.value).toMatch(/Front of my head; Does not move/);
    expect(["headache_location", "headache_character", "general_temperature", "respiratory_temperature"]).not.toContain(planNextQuestion(state)?.questionId);
  });

  it("does not ask symptom onset again when the opening message already says 'it started'", async () => {
    const { service } = await setup();
    const state = recordPatientAnswer(service.startIntake().state,
      "I have a headache, chills, a temperature of 37.5 C, and it started about 3 hours ago.").state;
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "About 3 hours ago" }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_chills", value: "About 3 hours ago" }));
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it("keeps an uncertain temperature reading explicitly uncertain in the reply", async () => {
    const { service, complete } = await setup();
    const recorded = recordPatientAnswer(service.startIntake().state,
      "I have headaches, cold symptoms, and a temperature of 37.5 degrees, I think; I felt this around 3 hours ago.");
    complete.mockResolvedValue(JSON.stringify({ assistantMessage: "I have a temperature reading of 37.5 degrees." }));

    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });

    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.assistantMessage).toMatch(/estimate|estimated/i);
    expect(result.assistantMessage).not.toMatch(/37\.5 degrees (?:is|was) your temperature/i);
  });

  it("keeps split location answers, volunteered details, and later corrections across the full conversation", async () => {
    const { service, complete } = await setup();
    let state = service.startIntake().state;
    let recorded = recordPatientAnswer(state, "hi");
    let result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    state = applyIntakeTurn(recorded.state, result);

    recorded = recordPatientAnswer(state, "i have headaches, colds, and 37.5 degrees fever i think, and also i felt this around 3 hours ago");
    result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.askedQuestionId).toBe("headache_location");
    state = applyIntakeTurn(recorded.state, result);

    recorded = recordPatientAnswer(state, "it stays there, it feels weird tho, it is like tingling");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({ fieldId: "headache_location", value: expect.stringMatching(/stays there/i), status: "unclear" }));
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({ fieldId: "headache_character", value: "Tingling", status: "reported" }));
    result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.askedQuestion).toBe("Where do you feel the headache?");
    state = applyIntakeTurn(recorded.state, result);

    recorded = recordPatientAnswer(state, "on my head of course towards my eyes");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({ fieldId: "headache_location", value: expect.stringMatching(/stays there.*toward.*eyes/i), status: "reported" }));
    result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.askedQuestionId).not.toBe("headache_location");
    expect(result.askedQuestionId).not.toBe("headache_character");
    state = applyIntakeTurn(recorded.state, result);

    // Even if the next prompt is off-target, a correction goes to the detail
    // named by the patient instead of overwriting the active location field.
    state = { ...state, activeQuestionId: "headache_location", questionsAsked: [...state.questionsAsked, "Where do you feel the headache?"] };
    recorded = recordPatientAnswer(state, "I already said it felt crushing");
    expect(recorded.state.fields).toContainEqual(expect.objectContaining({ fieldId: "headache_character", value: "Crushing", status: "patient_corrected" }));
    expect(recorded.state.fields.find((field) => field.fieldId === "headache_location")?.value).not.toMatch(/crushing/i);

    const recall = recordPatientAnswer(recorded.state, "tell me the numbers");
    result = await service.continueIntake({ state: recall.state, latestResponseId: recall.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.assistantMessage).toContain("37.5 degrees");
    expect(result.assistantMessage).toContain("unit not specified");
    expect(result.assistantMessage).toMatch(/weren’t sure|wasn’t sure/i);
    expect(result.assistantMessage).not.toMatch(/felt fine|felt well|normal/i);
    expect(complete).toHaveBeenCalledTimes(4); // Recall is answered from stored evidence without inference.
    expect(complete.mock.calls[0]?.[1]).toMatchObject({ maxTokens: 18 });
  });

  it("answers the user's exact recall sequence without losing the reading or advancing the interview", async () => {
    const { service, complete } = await setup();
    let state = recordPatientAnswer(service.startIntake().state, opening).state;
    state = { ...state, activeQuestionId: "general_temperature" };
    const pending = state.activeQuestionId;
    for (const text of ["i already said my temperature, guess what", "WHAT IS IT", "tell me the numbers"]) {
      const recorded = recordPatientAnswer(state, text);
      const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
      if ("safety" in result) throw new Error("Unexpected safety route");
      expect(result.assistantMessage).toContain("37.5");
      expect(result.assistantMessage).toContain("unit not specified");
      expect(result.assistantMessage).not.toContain("°C");
      expect(result.askedQuestion).toBeNull();
      state = applyIntakeTurn(recorded.state, result);
      expect(state.activeQuestionId).toBe(pending);
      expect(state.completion).toBe("in_progress");
      expect(state.fields.find(f => f.fieldId === "temperature_measurement")?.value).toContain("37.5");
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it("replaces note-style local-model output with a patient-facing acknowledgment", async () => {
    const { service, complete } = await setup();
    let state = recordPatientAnswer(service.startIntake().state, "I have a headache").state;
    state = { ...state, activeQuestionId: "headache_location", questionsAsked: [...state.questionsAsked, "Where do you feel the headache, and does it stay there or move?"] };
    const recorded = recordPatientAnswer(state, "It stays at the front of my head");
    complete.mockResolvedValue(JSON.stringify({ assistantMessage: "- **Headache**: Stays at the front. **Asks:**" }));
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.assistantMessage).not.toMatch(/\*\*|\bAsks?:|Symptom Onset/i);
    expect(result.assistantMessage).toMatch(/headache location|headache’s location|headache detail/i);
  });

  it("recovers a reading from an older conversation with missing extracted fields", async () => {
    const { service } = await setup();
    let state = recordPatientAnswer(service.startIntake().state, opening).state;
    state.fields = [];
    state = recordPatientAnswer(state, "what was my temperature?").state;
    expect(state.fields.find(f => f.fieldId === "temperature_measurement")?.value).toContain("37.5");
    expect(recallConversation(state)).toContain("37.5");
  });

  it("repeats the patient's full earlier message history on request", async () => {
    const { service } = await setup();
    const started = service.startIntake();
    let state = recordPatientAnswer(started.state, "I have a crushing headache and cramping.").state;
    state = recordPatientAnswer(state, "It began around midnight.").state;
    state = recordPatientAnswer(state, "Tell me everything I said.").state;
    const recalled = recallConversation(state);
    expect(recalled).toContain("I have a crushing headache and cramping.");
    expect(recalled).toContain("It began around midnight.");
    expect(recalled).not.toMatch(/response-\d+/i);
  });

  it("does not attach an answer to a different prompt using the patient-response index", async () => {
    const { service } = await setup();
    const state = {
      ...service.startIntake().state,
      responses: [
        { id: "r1", text: "I have a headache", sequence: 0 },
        { id: "r2", text: "37.5", sequence: 1, questionBankId: "symptom_onset__headache" },
        { id: "r3", text: "What was my temperature?", sequence: 2 },
      ],
      // The second assistant prompt is not necessarily the prompt answered by
      // response-2; the two arrays have different lengths and ordering.
      questionsAsked: ["What have you been feeling?", "Have you measured your temperature?"],
      fields: [],
    };
    expect(recallConversation(state)).toContain("haven’t given me a temperature reading");
  });

  it("rejects invented temperature units in a routine model acknowledgement", async () => {
    const { service, complete } = await setup();
    let state = recordPatientAnswer(service.startIntake().state, opening).state;
    state = { ...state, activeQuestionId: "headache_location" };
    const recorded = recordPatientAnswer(state, "front of my head, crushing");
    complete.mockResolvedValue(JSON.stringify({ assistantMessage: "Your headache feels crushing with a temperature of 37.5°C." }));
    const result = await service.continueIntake({ state: recorded.state, latestResponseId: recorded.responseId });
    if ("safety" in result) throw new Error("Unexpected safety route");
    expect(result.assistantMessage).not.toContain("°C");
  });

  it("does not record recall requests as clinical answers", () => {
    expect(extractPatientFacts({ id: "r", text: "i already said my temperature, guess what", sequence: 1 }, "What was the temperature?", "general_temperature")).toEqual([]);
    expect(extractReportedTemperature("I am 37 years old and symptoms began 15 hours ago")).toBeNull();
    expect(extractReportedTemperature("my temperature was 99.5 F")).toContain("99.5 °F");
  });
});
