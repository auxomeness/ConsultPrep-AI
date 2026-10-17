import { describe, expect, it } from "vitest";
import { confirmPatientBrief, recordPatientCorrection } from "../src/workflow.js";
import { nextRequiredInterviewQuestion } from "../src/service.js";
import type { IntakeState } from "../src/contracts.js";

const state: IntakeState = {
  schemaVersion: "1.0",
  concern: "My eyes are sore",
  responses: [
    { id: "r1", text: "My eyes are sore", sequence: 0 },
    { id: "r2", text: "It started today", sequence: 1, questionId: "When did these symptoms start?" },
  ],
  fields: [
    { fieldId: "eye_soreness", value: "Eye soreness", status: "reported", sourceResponseIds: ["r1"] },
    { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
  ],
  questionsAsked: ["When did these symptoms start?"],
  completion: "ready_for_review",
  patientConfirmed: false,
};

describe("patient correction and completion transitions", () => {
  it("keeps the original correction source and applies the corrected onset with its own source", () => {
    const corrected = recordPatientCorrection(state, "Correction: it started yesterday, not today");
    expect(corrected.responses[2]).toMatchObject({ correctsResponseId: "r2", text: "Correction: it started yesterday, not today" });
    expect(corrected.responses[1]?.text).toBe("It started today");
    expect(corrected.fields.find((field) => field.fieldId === "onset")).toMatchObject({ value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["response-3"] });
  });

  it("corrects the timeline for the named symptom without rewriting another symptom's onset", () => {
    const symptomState: IntakeState = {
      ...state,
      fields: [
        ...state.fields,
        { fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_eye_soreness", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "symptom_onset_visual_changes", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
      ],
    };
    const corrected = recordPatientCorrection(symptomState, "Correction: blurry vision started yesterday, not today");
    expect(corrected.fields.find((field) => field.fieldId === "symptom_onset_visual_changes")).toMatchObject({ value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["response-3"] });
    expect(corrected.fields.find((field) => field.fieldId === "symptom_onset_eye_soreness")).toMatchObject({ value: "Today", status: "reported", sourceResponseIds: ["r1"] });
  });

  it("records patient confirmation locally and keeps repeated completion idempotent", () => {
    const confirmed = confirmPatientBrief(state);
    expect(confirmed).toMatchObject({ completion: "completed", patientConfirmed: true });
    expect(confirmPatientBrief(confirmed)).toEqual(confirmed);
    expect(nextRequiredInterviewQuestion(confirmed)).toBeNull();
  });
});
