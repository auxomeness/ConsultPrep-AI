import { describe, expect, it } from "vitest";
import { QUESTION_BANK, detectSymptomCategories, isQuestionApplicable, questionIsRelevant } from "../src/question-bank.js";
import { planNextQuestion } from "../src/service.js";
import { extractPatientFacts } from "../src/intake-facts.js";
import type { IntakeState } from "../src/contracts.js";

const empty: IntakeState = {
  schemaVersion: "1.0", concern: "", responses: [], fields: [], questionsAsked: [], completion: "in_progress",
};

describe("adaptive question bank", () => {
  it.each([
    ["eyes are sore and vision is blurry", "eye_vision"],
    ["I have a cough and trouble breathing", "respiratory"],
    ["my throat hurts and my nose is runny", "throat_nose_ear"],
    ["I feel feverish, cold, and weak", "general"],
    ["I feel hot", "general"],
    ["I have cold symptoms", "throat_nose_ear"],
    ["I have a headache", "headache_neurological"],
    ["I feel nauseous and my stomach hurts", "digestive"],
    ["I have an itchy rash", "skin"],
    ["my back and muscles ache", "musculoskeletal"],
    ["it hurts when I urinate", "urinary"],
    ["I have an unusual concern", "other"],
  ] as const)("detects the %s category", (text, category) => {
    expect(detectSymptomCategories(text)).toContain(category);
  });

  it("keeps every bank entry typed and marked for clinical review", () => {
    expect(QUESTION_BANK.length).toBeGreaterThan(30);
    expect(QUESTION_BANK.every((question) => question.id && question.targetField && question.purpose && question.answerType && question.clinicalReview === "prototype_wording_requires_clinician_review")).toBe(true);
  });

  it("selects one relevant respiratory follow-up and skips other category questions", () => {
    const first = planNextQuestion({ ...empty, concern: "I have a cough" });
    expect(first?.questionId).toBe("respiratory_breathing");
    const second = planNextQuestion({ ...empty, concern: "I have a cough", fields: [
      { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "symptom_onset_cough", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "breathing_concern", value: "Patient reports no breathing difficulty", status: "patient_denied", sourceResponseIds: ["r1"] },
    ] });
    expect(second?.category).toBe("respiratory");
    expect(second?.questionId).toBe("respiratory_cough");
    expect(QUESTION_BANK.filter((question) => questionIsRelevant(question, ["respiratory"])).some((question) => question.id === "eye_side")).toBe(false);
  });

  it("treats a casual greeting plus feeling hot as a reported concern, not an unknown category", () => {
    const response = { id: "r1", text: "hi i feel hot", sequence: 0 };
    const fields = extractPatientFacts(response, "What have you been feeling?");
    const next = planNextQuestion({
      ...empty,
      concern: response.text,
      responses: [response],
      fields,
    });
    expect(fields.some((field) => field.fieldId === "fever")).toBe(true);
    expect(next?.questionId).toBe("symptom_onset__fever");
    expect(next?.questionId).not.toBe("other_description");
  });

  it("keeps a missed timeline open when the patient adds cold-like symptoms", () => {
    const state: IntakeState = {
      ...empty,
      concern: "hi i feel hot",
      responses: [
        { id: "r1", text: "hi i feel hot", sequence: 0 },
        { id: "r2", text: "fever, colds", sequence: 1, questionBankId: "symptom_onset__fever" },
      ],
      fields: [
        { fieldId: "fever", value: "Feeling hot or feverish (patient-reported; no measurement stated)", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "cold_like_symptoms", value: "Cold-like symptoms (patient-described)", status: "reported", sourceResponseIds: ["r2"] },
      ],
      questionsAsked: ["When did you first start feeling hot or feverish?"],
      questionHistory: [{ questionId: "symptom_onset__fever", targetField: "symptom_onset", status: "requires_clarification", sourceResponseIds: ["r2"] }],
    };
    expect(planNextQuestion(state)).toMatchObject({
      questionId: "symptom_onset__fever,cold_like_symptoms",
      question: "When did each of these symptoms begin? If they began at different times, you can tell me separately.",
    });
  });

  it("selects different first questions for different concerns and adapts when another symptom is added", () => {
    const eye = planNextQuestion({ ...empty, concern: "My eyes are sore and my vision is blurry" });
    const cough = planNextQuestion({ ...empty, concern: "I have a cough" });
    expect(eye?.questionId).toBe("symptom_onset__eye_soreness,visual_changes");
    expect(cough?.questionId).toBe("respiratory_breathing");

    const afterNewSymptom = planNextQuestion({
      ...empty,
      concern: "I have a cough",
      responses: [
        { id: "r1", text: "I have a cough", sequence: 0 },
        { id: "r2", text: "I also have a headache", sequence: 1, questionBankId: "symptom_onset__cough" },
      ],
      questionsAsked: ["What have you been feeling?", "When did the cough begin?"],
      questionHistory: [{ questionId: "symptom_onset__cough", targetField: "symptom_onset", status: "requires_clarification", sourceResponseIds: ["r2"] }],
      fields: [
        { fieldId: "symptom_onset_cough", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "breathing_concern", value: "Patient reports no breathing difficulty", status: "patient_denied", sourceResponseIds: ["r1"] },
      ],
    });
    expect(afterNewSymptom?.questionId).toBe("symptom_onset__headache");
  });

  it("does not re-ask an answered eye field and selects a different relevant question", () => {
    const state: IntakeState = {
      ...empty,
      concern: "My vision is blurry",
      fields: [
        { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "progression", value: "Unchanged", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "affected_eyes", value: "Left eye", status: "reported", sourceResponseIds: ["r1"] },
      ],
      responses: [{ id: "r1", text: "My vision is blurry, it started today and affects my left eye", sequence: 0 }],
    };
    expect(planNextQuestion(state)?.questionId).not.toBe("eye_side");
  });

  it("does not select respiratory questions for a denied cough when the concern is digestive", () => {
    const state: IntakeState = {
      ...empty,
      concern: "My stomach hurts, but I do not have a cough",
      responses: [{ id: "r1", text: "My stomach hurts, but I do not have a cough", sequence: 0 }],
      fields: [
        { fieldId: "stomach_pain", value: "Stomach or abdominal discomfort", status: "reported", sourceResponseIds: ["r1"] },
        { fieldId: "cough", value: "Patient denied cough", status: "patient_denied", sourceResponseIds: ["r1"] },
      ],
    };
    expect(isQuestionApplicable(QUESTION_BANK.find((question) => question.id === "respiratory_breathing")!, state)).toBe(false);
    expect(planNextQuestion(state)?.questionId).toBe("symptom_onset__stomach_pain");
  });
});
