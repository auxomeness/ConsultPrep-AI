import { describe, expect, it } from "vitest";
import { validateBrief, validateIntakeState } from "../src/contracts.js";

const validState = {
  schemaVersion: "1.0",
  concern: "Mild headache since yesterday",
  responses: [
    { id: "r1", text: "I have a mild headache since yesterday.", sequence: 0 },
    { id: "r2", text: "I meant Thursday, not Tuesday.", sequence: 1, correctsResponseId: "r1" },
  ],
  fields: [
    { fieldId: "timeline", value: "Since yesterday", status: "reported", sourceResponseIds: ["r1"] },
    { fieldId: "allergies", value: null, status: "not_asked", sourceResponseIds: [] },
  ],
  questionsAsked: ["When did it start?"],
  completion: "in_progress",
};

describe("intake contracts", () => {
  it("accepts a valid intake and retains correction provenance", () => {
    expect(validateIntakeState(validState).responses[1]?.correctsResponseId).toBe("r1");
  });

  it("validates question history status and source links", () => {
    expect(() => validateIntakeState({ ...validState, questionHistory: [{ questionId: "onset", targetField: "onset", status: "answered", sourceResponseIds: ["r1"] }] })).not.toThrow();
    expect(() => validateIntakeState({ ...validState, questionHistory: [{ questionId: "onset", targetField: "onset", status: "answered", sourceResponseIds: ["missing"] }] })).toThrow(/references unknown response/);
    expect(() => validateIntakeState({ ...validState, questionHistory: [{ questionId: "onset", targetField: "onset", status: "declined", sourceResponseIds: [] }] })).toThrow(/requires a response source/);
  });

  it("rejects a reported field without a source", () => {
    expect(() => validateIntakeState({ ...validState, fields: [{ fieldId: "timeline", value: "Yesterday", status: "reported", sourceResponseIds: [] }] })).toThrow(/requires a patient source/);
  });

  it("rejects a source ID that does not exist", () => {
    expect(() => validateIntakeState({ ...validState, fields: [{ fieldId: "timeline", value: "Yesterday", status: "reported", sourceResponseIds: ["missing"] }] })).toThrow(/unknown response/);
  });

  it("rejects a duplicate sequence and invalid correction reference", () => {
    expect(() => validateIntakeState({ ...validState, responses: [{ id: "a", text: "x", sequence: 0 }, { id: "b", text: "y", sequence: 0 }] })).toThrow(/Duplicate response sequence/);
    expect(() => validateIntakeState({ ...validState, responses: [{ id: "a", text: "x", sequence: 0, correctsResponseId: "missing" }] })).toThrow(/Correction references missing/);
  });

  it("requires corrections to point backward and preserves distinct missing-information states", () => {
    expect(() => validateIntakeState({ ...validState, responses: [{ id: "a", text: "x", sequence: 0 }, { id: "b", text: "y", sequence: 1, correctsResponseId: "a" }], fields: [] })).not.toThrow();
    expect(() => validateIntakeState({ ...validState, responses: [{ id: "a", text: "x", sequence: 0, correctsResponseId: "b" }, { id: "b", text: "y", sequence: 1 }], fields: [] })).toThrow(/must follow/);
    const missingStates = ["unknown", "not_answered", "not_asked", "patient_denied"] as const;
    for (const status of missingStates) {
      const field = status === "patient_denied"
        ? { fieldId: status, value: "Patient denied this symptom", status, sourceResponseIds: ["r1"] }
        : { fieldId: status, value: null, status, sourceResponseIds: [] };
      expect(() => validateIntakeState({ ...validState, fields: [field] })).not.toThrow();
    }
    expect(() => validateIntakeState({ ...validState, fields: [{ fieldId: "skipped", value: "No", status: "not_answered", sourceResponseIds: [] }] })).toThrow(/must have a null value/);
  });

  it("validates the generated brief against patient response IDs", () => {
    const brief = {
      schemaVersion: "1.0",
      status: "ai_generated_draft",
      primaryConcern: { fieldId: "primary_concern", value: "Mild headache", status: "reported", sourceResponseIds: ["r1"] },
      fields: [{ fieldId: "timeline", value: "Since yesterday", status: "reported", sourceResponseIds: ["r1"] }],
      unansweredOrUnclear: [],
      contradictions: [],
    };
    expect(validateBrief(brief, validateIntakeState(validState)).status).toBe("ai_generated_draft");
    expect(() => validateBrief({ ...brief, fields: [{ ...brief.fields[0], sourceResponseIds: ["invented"] }] }, validateIntakeState(validState))).toThrow(/unknown response/);
  });
});
