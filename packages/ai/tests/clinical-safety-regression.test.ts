import { describe, expect, it, vi } from "vitest";
import { buildStructuredBrief } from "../src/brief.js";
import { createAiService, planNextQuestion } from "../src/service.js";
import { assessSafety, emergencyContactFromEnvironment } from "../src/safety.js";
import { AiServiceError } from "../src/errors.js";
import { InMemoryRetriever } from "../src/rag.js";
import { applyIntakeTurn, interruptIntakeForSafety, recordPatientAnswer } from "../src/workflow.js";
import type { IntakeState } from "../src/contracts.js";
import type { ChatCompleter } from "../src/amd-client.js";

const retriever = await InMemoryRetriever.create([], async (texts) => texts.map(() => [1, 0]));

function startState(): IntakeState {
  return createAiService({ complete: vi.fn() } as unknown as ChatCompleter, retriever).startIntake().state;
}

function answer(state: IntakeState, text: string, questionId?: string, question?: string) {
  const prepared = questionId ? {
    ...state,
    activeQuestionId: questionId,
    questionsAsked: question ? [...state.questionsAsked, question] : state.questionsAsked,
  } : state;
  return recordPatientAnswer(prepared, text).state;
}

function referenceEmergencyState(): IntakeState {
  let state = answer(startState(), "Just 30mins ago, it felt like migraine");
  state = answer(state, "On the right side", "headache_location", "Where do you feel the headache, and does it stay there or move?");
  state = answer(state, "It is the worst headache I have ever had", "headache_character", "How would you describe the headache in your own words?");
  return answer(state, "Yes, I feel weak and I have vomited several times", "additional_symptoms", "Have you noticed any other symptoms along with this?");
}

describe("contextual conversation and emergency regression scenarios", () => {
  it("A: retains an onset volunteered with the initial headache report and does not ask for it again", () => {
    const state = answer(startState(), "My headache started 30 minutes ago.");
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "About 30 minutes ago" }));
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it.each([
    ["midnight", "Midnight"],
    ["around midnight", "Around midnight"],
    ["earlier in the morning", "Earlier in the morning"],
    ["30 minutes ago", "About 30 minutes ago"],
    ["for 3 days", "For 3 days"],
  ])("accepts the onset answer '%s' and advances past the onset question", (onsetAnswer, expected) => {
    let state = answer(startState(), "I have a headache.");
    state = answer(state, onsetAnswer, "symptom_onset__headache", "When did the headache begin?");
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: expected }));
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it("B: treats an informal already-answered onset message as a correction", () => {
    let state = answer(startState(), "Just 30mins ago, it felt like migraine");
    state = answer(state, "It began 30 mins ago, bro what do you mean?", "symptom_onset__headache,weakness,vomiting", "When did each of these symptoms begin?");
    expect(state.currentIntent).toBe("correction");
    expect(state.responses.at(-1)?.correctsResponseId).toBeTruthy();
    expect(state.fields.find((field) => field.fieldId === "symptom_onset_headache")?.value).toBe("About 30 minutes ago");
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it("B: checks existing state when the patient says they already answered without repeating the fact", () => {
    let state = answer(startState(), "My headache began 30 minutes ago.");
    state = answer(state, "I already answered that.", "symptom_onset__headache", "When did the headache begin?");
    expect(state.currentIntent).toBe("repetition_complaint");
    expect(state.fields.find((field) => field.fieldId === "symptom_onset_headache")?.value).toBe("About 30 minutes ago");
    expect(state.questionHistory?.at(-1)).toMatchObject({ status: "answered", sourceResponseIds: ["response-1"] });
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it("C: tracks weakness and vomiting as separate sourced facts without inventing their onset", () => {
    const state = answer(startState(), "I feel weak and I vomit.");
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "weakness", sourceResponseIds: ["response-1"] }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "vomiting", sourceResponseIds: ["response-1"] }));
    expect(state.fields.some((field) => field.fieldId === "symptom_onset_weakness" || field.fieldId === "symptom_onset_vomiting")).toBe(false);
  });

  it("keeps a crushing headache with one vomiting report in routine intake and captures informal onset wording", () => {
    let state = answer(startState(), "headache");
    state = answer(state, "earlier in the morning", "symptom_onset__headache", "When did the headache begin?");
    state = answer(state, "yes", "headache_location", "Where do you feel the headache, and does it stay there or move?");
    state = answer(state, "crushing in my head", "headache_character", "How would you describe the headache?");
    state = answer(state, "yes vomiting and bodyache", "additional_symptoms", "Have you noticed any other symptoms along with this?");
    state = answer(state, "just a while a go", "symptom_onset__vomiting", "When did the vomiting begin?");

    expect(assessSafety(state).routed).toBe(false);
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "headache_location", value: null, status: "unclear" }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_vomiting", value: "A little while ago" }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "body_aches", status: "reported" }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "additional_symptoms", value: expect.stringMatching(/Vomiting.*Body aches|Body aches.*Vomiting/), status: "reported" }));
    expect(state.fields.some((field) => field.fieldId === "onset" && field.status === "conflicting")).toBe(false);
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^(?:headache_associated|additional_symptoms)$/);

    const brief = buildStructuredBrief(state);
    expect(brief.importantUnansweredQuestions.some((item) => item.fieldId === "symptom_onset_vomiting")).toBe(false);
    expect(brief.patientReportedNarrative?.text).toMatch(/headache/i);
    expect(brief.patientReportedNarrative?.text).toMatch(/vomiting/i);
  });

  it("D: records a shared onset only when the patient says the symptoms began together", () => {
    const state = answer(startState(), "My headache, weakness, and vomiting all began at the same time 30 minutes ago.");
    for (const id of ["headache", "weakness", "vomiting"]) {
      expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: `symptom_onset_${id}`, value: "About 30 minutes ago" }));
    }
  });

  it("E: interrupts the complete severe-headache scenario before model inference", async () => {
    const complete = vi.fn();
    const service = createAiService({ complete } as ChatCompleter, retriever);
    const state = referenceEmergencyState();
    const result = await service.continueIntake({ state, latestResponseId: state.responses.at(-1)?.id });
    expect("safety" in result).toBe(true);
    if (!("safety" in result)) return;
    expect(result.safety.ruleId).toBe("severe_headache_with_repeated_vomiting");
    expect(result.safety.guidance).toContain("call 911 in the Philippines now");
    expect(result.safety.guidance).toContain("nearest hospital emergency department");
    expect(complete).not.toHaveBeenCalled();
  });

  it("F: returns the urgent message without relying on a successful model", () => {
    const safety = assessSafety(referenceEmergencyState());
    expect(safety.routed).toBe(true);
    expect(safety.guidance).toMatch(/Please don’t wait to finish this questionnaire/i);
  });

  it("F: still interrupts when the configured model would time out", async () => {
    const complete = vi.fn().mockRejectedValue(new AiServiceError("timeout", "Synthetic timeout"));
    const state = referenceEmergencyState();
    const result = await createAiService({ complete } as ChatCompleter, retriever).continueIntake({ state });
    expect("safety" in result).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it("G: a stale routine turn cannot change an interrupted state", () => {
    const safety = assessSafety(referenceEmergencyState());
    const state = interruptIntakeForSafety(referenceEmergencyState(), safety);
    const after = applyIntakeTurn(state, { askedQuestion: "When did this begin?", askedQuestionId: "onset", fieldUpdates: [] });
    expect(after).toEqual(state);
    expect(planNextQuestion(after)).toBeNull();
  });

  it("H: a what-should-I-do message with the emergency pattern gets urgent guidance first", async () => {
    const complete = vi.fn();
    let state = referenceEmergencyState();
    state = answer(state, "What should I do?", "completion_check", "Is that everything you’re feeling today?");
    const result = await createAiService({ complete } as ChatCompleter, retriever).continueIntake({ state });
    expect("safety" in result && result.safety.guidance).toMatch(/urgent medical assessment/i);
    expect(complete).not.toHaveBeenCalled();
  });

  it("I: suppresses semantically duplicate onset prompts after a reported onset", () => {
    const state = answer(startState(), "My headache began 30 minutes ago.");
    expect(planNextQuestion(state)?.questionId).not.toMatch(/^symptom_onset__/);
  });

  it("J: the draft retains source-linked location, character, timing, weakness, and vomiting", () => {
    const state = referenceEmergencyState();
    const brief = buildStructuredBrief({ ...state, safety: assessSafety(state), completion: "emergency_interrupted" });
    expect(brief.symptomTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining("About 30 minutes ago"), sourceResponseIds: ["response-1"] }),
    ]));
    expect(brief.relevantBackground).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining("Right side"), sourceResponseIds: ["response-2"] }),
      expect.objectContaining({ text: expect.stringContaining("worst headache I have ever had"), sourceResponseIds: ["response-3"] }),
    ]));
    expect(brief.currentSymptoms.map((fact) => fact.text)).toEqual(expect.arrayContaining(["Weakness", "Vomiting"]));
    expect(brief.automatedSafetyFlags[0]?.ruleId).toBe("severe_headache_with_repeated_vomiting");
    expect(brief.sourceTraceability).toHaveLength(4);
  });

  it("K: service calls remain interrupted after the first urgent response", async () => {
    const state = referenceEmergencyState();
    const safety = assessSafety(state);
    const interrupted = interruptIntakeForSafety(state, safety);
    const complete = vi.fn();
    const result = await createAiService({ complete } as ChatCompleter, retriever).continueIntake({ state: interrupted });
    expect("safety" in result && result.state.completion).toBe("emergency_interrupted");
    expect(complete).not.toHaveBeenCalled();
  });

  it("L: emergency wording never says that emergency services were contacted", () => {
    const guidance = assessSafety(referenceEmergencyState()).guidance ?? "";
    expect(guidance).not.toMatch(/(?:we|i|consultprep).{0,30}(?:called|contacted|notified)\b/i);
  });

  it("M: a benign headache remains in routine intake", () => {
    const state = answer(startState(), "Mild headache since yesterday.");
    expect(assessSafety(state).routed).toBe(false);
    expect(planNextQuestion(state)).not.toBeNull();
  });

  it("does not route a severe headache with generalized weakness or one vomiting report as an automatic emergency", () => {
    const state = answer(startState(), "I have a severe headache and I feel weak.");
    const withOneVomitingReport = answer(state, "I vomited once", "additional_symptoms", "Have you noticed any other symptoms?");
    expect(assessSafety(withOneVomitingReport).routed).toBe(false);
  });

  it("does not combine unrelated or negated symptoms into the headache emergency rule", () => {
    const state = answer(startState(), "I have a headache. I do not feel weak and I have not vomited. I have a severe sore throat.");
    expect(assessSafety(state).routed).toBe(false);
  });

  it("uses the configurable Philippine demo contact defaults and supports deployment overrides", () => {
    expect(emergencyContactFromEnvironment({})).toEqual({ number: "911", region: "in the Philippines" });
    expect(emergencyContactFromEnvironment({ CONSULTPREP_EMERGENCY_NUMBER: "112", CONSULTPREP_EMERGENCY_REGION: "in Exampleland" }))
      .toEqual({ number: "112", region: "in Exampleland" });
    expect(assessSafety(referenceEmergencyState(), { number: "112", region: "in Exampleland" }).guidance).toContain("call 112 in Exampleland now");
  });
});
