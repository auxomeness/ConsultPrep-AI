import { describe, expect, it } from "vitest";
import { assessIntakeCompleteness } from "../src/completeness.js";
import { buildStructuredBrief, formatStructuredBrief } from "../src/brief.js";
import { planNextQuestion } from "../src/service.js";
import type { IntakeState } from "../src/contracts.js";

function stateFrom(text: string, fields: IntakeState["fields"], questionHistory: IntakeState["questionHistory"] = []): IntakeState {
  return {
    schemaVersion: "1.0",
    concern: text,
    responses: [{ id: "r1", text, sequence: 0 }],
    fields,
    questionsAsked: [],
    questionHistory,
    completion: "in_progress",
  };
}

describe("provisional intake completeness engine", () => {
  it("tracks vision-specific timeline and relevant unknown details before urgent symptoms are reported", () => {
    const state = stateFrom("My vision is blurry", [
      { fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
    ]);
    const coverage = assessIntakeCompleteness(state);
    expect(coverage).toMatchObject({ status: "unknown", reviewStatus: "provisional_requires_clinician_review" });
    expect(coverage.openRequiredQuestionIds).toContain("eye_side");
    expect(coverage.openRequiredQuestionIds).toContain("eye_visual_timing");
    expect(coverage.openRequiredQuestionIds).toContain("symptom_onset__visual_changes");
    expect(coverage.concerns.find((concern) => concern.symptomId === "visual_changes")?.status).toBe("unknown");
    expect(planNextQuestion(state)?.questionId).toMatch(/^symptom_onset__/);
    expect(formatStructuredBrief(buildStructuredBrief(state)).replace(/\s+/g, " ")).toMatch(/not a measure of clinical completeness/i);
  });

  it("prioritizes breathing context for cough and recognizes a documented unknown without calling it denied", () => {
    const state = stateFrom("I have had a cough for five days and it is getting worse", [
      { fieldId: "cough", value: "Cough", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "symptom_onset_cough", value: "Five days", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "breathing_concern", value: null, status: "unknown", sourceResponseIds: ["r1"] },
    ], [{ questionId: "respiratory_breathing", targetField: "breathing_concern", status: "answered", sourceResponseIds: ["r1"] }]);
    const coverage = assessIntakeCompleteness(state);
    expect(coverage.status).toBe("sufficiently_covered");
    const breathing = coverage.concerns.find((concern) => concern.symptomId === "cough")?.criteria.find((criterion) => criterion.questionId === "respiratory_breathing");
    expect(breathing).toMatchObject({ status: "unknown", informationStatus: "unknown", asked: true });
    expect(planNextQuestion(state)?.questionId).not.toBe("respiratory_breathing");
  });

  it("keeps unclear/conflicting required details open and gives safety routing precedence", () => {
    const unclear = stateFrom("My vision is blurry", [
      { fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "symptom_onset_visual_changes", value: "Conflicting patient reports", status: "conflicting", sourceResponseIds: ["r1"] },
    ], [{ questionId: "symptom_onset__visual_changes", targetField: "symptom_onset", status: "answered", sourceResponseIds: ["r1"] }]);
    expect(assessIntakeCompleteness(unclear)).toMatchObject({ status: "clarification_needed" });
    expect(planNextQuestion(unclear)).toMatchObject({ status: "clarification_needed", questionId: "symptom_onset__visual_changes" });

    const urgent = stateFrom("I suddenly lost my vision", [
      { fieldId: "visual_changes", value: "Sudden vision loss", status: "reported", sourceResponseIds: ["r1"] },
    ]);
    expect(assessIntakeCompleteness(urgent)).toMatchObject({ status: "potentially_urgent", urgentRuleId: "emergency_eye_warning_sign" });
    expect(planNextQuestion(urgent)).toBeNull();
  });
});
