import { describe, expect, it, vi } from "vitest";
import { buildStructuredBrief } from "../src/brief.js";
import { type IntakeState } from "../src/contracts.js";
import { extractPatientFacts, mergeFieldUpdates } from "../src/intake-facts.js";
import { InMemoryRetriever, type Embedder } from "../src/rag.js";
import { assessPromptAssessmentNeed, assessSafety } from "../src/safety.js";
import { AiServiceError } from "../src/errors.js";
import { createAiService, planNextQuestion } from "../src/service.js";
import { applyIntakeTurn, recordPatientAnswer } from "../src/workflow.js";
import type { ChatCompleter } from "../src/amd-client.js";

const embedder: Embedder = async (texts) => texts.map(() => [1, 0]);
const guidance = async () => InMemoryRetriever.create([], embedder);

function makeState(messages: string[], targetIds?: string[]) {
  const base = createAiService({ complete: vi.fn() } as unknown as ChatCompleter, {} as InMemoryRetriever).startIntake().state;
  const responses = messages.map((text, index) => ({ id: `r${index + 1}`, text, sequence: index }));
  const fields = responses.reduce((current, response, index) => mergeFieldUpdates(current, extractPatientFacts(
    response,
    targetIds?.[index] === "daily_impact" ? "How has this affected your usual activities?" : "",
    targetIds?.[index] ?? (index === 0 ? "main_concern" : "other"),
  )), [] as ReturnType<typeof extractPatientFacts>);
  return {
    ...base,
    concern: messages[0] ?? "",
    responses,
    fields,
  } as IntakeState;
}

describe("patient-centered orchestration regression cases", () => {
  it("A: records worsening weakness and chooses onset before generic activity impact", () => {
    const state = makeState(["I feel weak and it is worsening."]);
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "weakness", status: "reported" }));
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "progression", value: "Worsening" }));
    expect(assessSafety(state).routed).toBe(false);
    expect(planNextQuestion(state)?.targetField).not.toBe("daily_impact");
    expect(assessPromptAssessmentNeed(state)).toBe(false);
  });

  it("B: records lost energy without asserting muscle weakness", () => {
    const response = { id: "r1", text: "I just lost energy.", sequence: 0 };
    const fields = extractPatientFacts(response, "How has this affected your usual activities?", "daily_impact");
    expect(fields).toContainEqual(expect.objectContaining({ fieldId: "energy_level", value: "Lost energy" }));
    expect(fields.some((field) => field.fieldId === "weakness" && field.status === "reported")).toBe(false);
  });

  it("C: records chores as functional impact and does not schedule impact again", () => {
    const state = makeState(["I feel weak.", "Doing chores has become harder."], ["main_concern", "daily_impact"]);
    expect(state.fields).toContainEqual(expect.objectContaining({ fieldId: "daily_impact", value: "Doing chores has become harder" }));
    expect(planNextQuestion(state)?.targetField).not.toBe("daily_impact");
  });

  it("D: answers a direct guidance request and preserves the answer and its source in the brief", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      assistantMessage: "I hear you want to know what to do. I can’t assess the cause or determine treatment here. Is there anything else you want the clinician to know?",
      askedQuestion: "Is there anything else you want the clinician to know?",
    }));
    const service = createAiService({ complete } as ChatCompleter, await guidance());
    const state = makeState([
      "I feel weak and it is worsening.",
      "Doing chores has become harder.",
      "What should I do? What can I do to ease what I’m feeling?",
    ], ["main_concern", "daily_impact", "other"]);
    const result = await service.continueIntake({ state, latestResponseId: "r3" });
    if ("safety" in result) throw new Error("Expected a response to the patient's question.");
    expect(result.assistantMessage).toMatch(/contact a qualified healthcare professional promptly/i);
    expect(result.assistantMessage).toMatch(/can.t determine the cause/i);
    expect(result.assistantMessage).not.toMatch(/thanks, i.ve noted that/i);
    expect(result.askedQuestion).toBeNull();
    expect(result.guidanceProvided?.sourceResponseIds).toEqual(["r3"]);
    const updated = applyIntakeTurn(state, result);
    const brief = buildStructuredBrief(updated);
    expect(brief.patientConcernsAndQuestions.some((item) => item.originalText.includes(state.responses[2]!.text))).toBe(true);
    expect(brief.guidanceProvided[0]?.sourceResponseIds).toEqual(["r3"]);
  });

  it("E: a barely-standing mixed-intent message triggers safety before inference", async () => {
    const complete = vi.fn();
    const service = createAiService({ complete } as ChatCompleter, await guidance());
    const state = makeState(["My weakness is getting worse. What should I do? I can barely stand."]);
    const result = await service.continueIntake({ state, latestResponseId: "r1" });
    expect("safety" in result).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    expect(assessSafety(state).matchedResponseIds).toEqual(["r1"]);
  });

  it("F: semantic duplicate targets collapse while separate symptom targets remain", () => {
    const state = makeState(["I have a cough and a sore throat."]);
    const plan = planNextQuestion(state);
    expect(plan).not.toBeNull();
    expect(plan?.targetConcept).toBeTruthy();
    expect(plan?.question).toMatch(/breathing|throat|symptoms/i);
  });

  it("G: a patient finish request moves to review without another question", async () => {
    const service = createAiService({ complete: vi.fn() } as ChatCompleter, await guidance());
    const state = makeState(["I have a cough.", "That's all. Please finish."], ["main_concern", "other"]);
    const result = await service.continueIntake({ state, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected completion handling.");
    expect(result.askedQuestion).toBeNull();
    expect(result.assistantMessage).toMatch(/stop the intake questions/i);
    expect(applyIntakeTurn(state, result).completion).toBe("ready_for_review");
  });

  it("H: unclear opening text is not accepted as a health fact", () => {
    const started = createAiService({ complete: vi.fn() } as unknown as ChatCompleter, {} as InMemoryRetriever).startIntake().state;
    const recorded = recordPatientAnswer(started, "clear");
    expect(recorded.state.fields).toEqual([]);
    expect(recorded.state.concern).toBe("");
  });

  it("I: preserves unknown details and source text rather than inventing facts", () => {
    const state = makeState(["I have a cough."]);
    const brief = buildStructuredBrief(state);
    expect(brief.sourceTraceability).toEqual([{ responseId: "r1", originalText: "I have a cough." }]);
    expect(brief.currentSymptoms.some((fact) => fact.text === "Cough" && fact.sourceResponseIds.includes("r1"))).toBe(true);
    expect(brief.intakeCompleteness.reviewStatus).toBe("provisional_requires_clinician_review");
  });

  it("J: a provider timeout surfaces an explicit failure without fabricating an answer", async () => {
    const complete = vi.fn().mockRejectedValue(new AiServiceError("timeout", "Synthetic timeout"));
    const service = createAiService({ complete } as ChatCompleter, await guidance());
    const state = makeState(["I have a cough.", "What should I do?"], ["main_concern", "other"]);
    await expect(service.continueIntake({ state, latestResponseId: "r2" })).rejects.toMatchObject({ code: "timeout" });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(state.responses[0]?.text).toBe("I have a cough.");
  });

  it("K: patient-specific concerns select different question targets", () => {
    const eye = planNextQuestion(makeState(["My eyes are sore."]));
    const cough = planNextQuestion(makeState(["I have a cough."]));
    expect(eye?.targetField).not.toBe(cough?.targetField);
  });

  it("records a provider-finding request without implying a directory or booking integration", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({
      assistantMessage: "I can’t search for or book a clinician in this demo. You can contact a local clinic or your usual healthcare provider.",
      askedQuestion: null,
    }));
    const service = createAiService({ complete } as ChatCompleter, await guidance());
    const state = makeState(["Please find me a cardiologist."], ["main_concern"]);
    const result = await service.continueIntake({ state, latestResponseId: "r1" });
    if ("safety" in result) throw new Error("Expected a workflow response.");
    expect(result.assistantMessage).toMatch(/can’t search for or book a clinician/i);
    expect(result.fieldUpdates).toContainEqual(expect.objectContaining({ fieldId: "patient_goal", sourceResponseIds: ["r1"] }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("moves a typed /summary request to review instead of treating it as a symptom answer", async () => {
    const service = createAiService({ complete: vi.fn() } as ChatCompleter, await guidance());
    const state = makeState(["I have a cough.", "/summary"], ["main_concern", "other"]);
    const result = await service.continueIntake({ state, latestResponseId: "r2" });
    if ("safety" in result) throw new Error("Expected review handling.");
    expect(result.assistantMessage).toMatch(/draft summary to review and share with your doctor/i);
    expect(result.assistantMessage).toMatch(/cough/i);
    expect(result.askedQuestion).toBeNull();
  });

  it("routes a correction through the linked correction workflow and preserves its original source", () => {
    const started = createAiService({ complete: vi.fn() } as unknown as ChatCompleter, {} as InMemoryRetriever).startIntake().state;
    const first = recordPatientAnswer(started, "I have a headache that began today.");
    const correction = recordPatientAnswer(first.state, "Correction: my headache began yesterday, not today.");
    const onset = correction.state.fields.find((field) => field.fieldId === "symptom_onset_headache");
    expect(correction.responseId).toBe("response-2");
    expect(correction.state.responses[1]?.correctsResponseId).toBe("response-1");
    expect(onset).toMatchObject({ value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["response-2"] });
  });
});
