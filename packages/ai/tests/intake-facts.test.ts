import { describe, expect, it } from "vitest";
import { extractPatientFacts } from "../src/intake-facts.js";

describe("source-linked intake fact extraction", () => {
  it("extracts eye soreness, onset, and blurry vision separately from one response", () => {
    const facts = extractPatientFacts({
      id: "r1",
      text: "My eyes are sore, it started today, and I'm seeing blurry.",
      sequence: 0,
    }, "What have you been feeling?");
    expect(facts).toContainEqual({ fieldId: "eye_soreness", value: "Eye soreness", status: "reported", sourceResponseIds: ["r1"] });
    expect(facts).toContainEqual({ fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r1"] });
    expect(facts).toContainEqual({ fieldId: "visual_changes", value: "Blurry vision", status: "reported", sourceResponseIds: ["r1"] });
    expect(facts.some((fact) => fact.fieldId === "daily_impact")).toBe(false);
  });

  it("captures symptom, onset, and progression from one patient response with the same source", () => {
    const facts = extractPatientFacts({ id: "multi", text: "I have a headache that started yesterday and is getting worse", sequence: 0 }, "What have you been feeling?");
    expect(facts).toContainEqual({ fieldId: "headache", value: "Headache", status: "reported", sourceResponseIds: ["multi"] });
    expect(facts).toContainEqual({ fieldId: "onset", value: "Yesterday", status: "reported", sourceResponseIds: ["multi"] });
    expect(facts).toContainEqual({ fieldId: "progression", value: "Worsening", status: "reported", sourceResponseIds: ["multi"] });
  });

  it("keeps separate symptom timelines when one answer gives different start times", () => {
    const facts = extractPatientFacts({
      id: "eye-timeline",
      text: "Eye soreness began today, but my blurry vision started yesterday",
      sequence: 0,
      questionBankId: "symptom_onset__eye_soreness,visual_changes",
    }, "When did the eye soreness and vision changes begin?", "symptom_onset__eye_soreness,visual_changes");
    expect(facts).toContainEqual({ fieldId: "symptom_onset_eye_soreness", value: "Today", status: "reported", sourceResponseIds: ["eye-timeline"] });
    expect(facts).toContainEqual({ fieldId: "symptom_onset_visual_changes", value: "Yesterday", status: "reported", sourceResponseIds: ["eye-timeline"] });
  });

  it("captures a plain-language symptom duration as timeline evidence", () => {
    const facts = extractPatientFacts({ id: "duration", text: "I have had a cough for five days", sequence: 0 }, "What have you been feeling?");
    expect(facts).toContainEqual({ fieldId: "symptom_onset_cough", value: "For five days", status: "reported", sourceResponseIds: ["duration"] });
  });

  it("records feeling hot as subjective feverishness and preserves the patient's cold wording", () => {
    const hot = extractPatientFacts({ id: "hot", text: "Hi, I feel hot", sequence: 0 }, "What have you been feeling?");
    expect(hot).toContainEqual({ fieldId: "fever", value: "Feeling hot or feverish (patient-reported; no measurement stated)", status: "reported", sourceResponseIds: ["hot"] });
    expect(hot.some((field) => field.fieldId === "temperature_measurement")).toBe(false);

    const cold = extractPatientFacts({ id: "cold", text: "I have colds", sequence: 0 }, "What have you been feeling?");
    expect(cold).toContainEqual({ fieldId: "cold_like_symptoms", value: "Cold-like symptoms (patient-described)", status: "reported", sourceResponseIds: ["cold"] });
  });

  it("recognizes common past-tense wording for vomiting", () => {
    const facts = extractPatientFacts({ id: "r1", text: "I vomited earlier", sequence: 0 }, "What have you been feeling?");
    expect(facts).toContainEqual({ fieldId: "vomiting", value: "Vomiting", status: "reported", sourceResponseIds: ["r1"] });
  });

  it("records explicit symptom denials without treating them as reported symptoms", () => {
    const response = { id: "mixed", text: "My stomach hurts, but I do not have a cough", sequence: 0 };
    const facts = extractPatientFacts(response, "What have you been feeling?");
    expect(facts).toContainEqual({ fieldId: "stomach_pain", value: "Stomach or abdominal discomfort", status: "reported", sourceResponseIds: ["mixed"] });
    expect(facts).toContainEqual({ fieldId: "cough", value: "Patient denied cough", status: "patient_denied", sourceResponseIds: ["mixed"] });
  });

  it("records an explicit activity limitation separately from a visual symptom", () => {
    const facts = extractPatientFacts({ id: "r2", text: "I cannot read because my vision is blurry", sequence: 1 }, "How much are these symptoms affecting your activities?");
    expect(facts.find((fact) => fact.fieldId === "visual_changes")?.value).toBe("Blurry vision");
    expect(facts.find((fact) => fact.fieldId === "daily_impact")?.value).toMatch(/cannot read/i);
  });

  it("keeps a bare worse response unclear when the active question asked about activity impact", () => {
    const facts = extractPatientFacts({ id: "r3", text: "worse", sequence: 2 }, "How much are your sore eyes affecting your usual activities today?");
    expect(facts).toContainEqual({ fieldId: "daily_impact", value: null, status: "unclear", sourceResponseIds: ["r3"] });
  });

  it("does not convert unknown into a denial and records patient corrections with new evidence", () => {
    expect(extractPatientFacts({ id: "r4", text: "I don't know", sequence: 3 }, "When did these symptoms start?")).toContainEqual({ fieldId: "onset", value: null, status: "unknown", sourceResponseIds: ["r4"] });
    expect(extractPatientFacts({ id: "r5", text: "Actually it started yesterday", sequence: 4, correctsResponseId: "r1" }, "Does the summary look right?")).toContainEqual({ fieldId: "onset", value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["r5"] });
  });
});
