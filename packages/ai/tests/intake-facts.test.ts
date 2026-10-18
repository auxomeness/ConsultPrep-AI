import { describe, expect, it } from "vitest";
import { extractPatientFacts, extractReportedTemperature } from "../src/intake-facts.js";

describe("source-linked intake fact extraction", () => {
  it("records a volunteered denial of other symptoms alongside reported symptoms", () => {
    const facts = extractPatientFacts({
      id: "r1",
      text: "I have a crushing headache and cramping, and no other symptoms.",
      sequence: 0,
    }, "What have you been feeling?", "main_concern");
    expect(facts).toContainEqual(expect.objectContaining({
      fieldId: "additional_symptoms",
      value: "No additional symptoms reported",
      status: "patient_denied",
      sourceResponseIds: ["r1"],
    }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "headache", status: "reported" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "cramping", status: "reported" }));
  });

  it("preserves an ear-symptom denial as scoped information, not a denial of all symptoms", () => {
    const facts = extractPatientFacts({
      id: "ent-answer",
      text: "My nose is runny, and my throat feels scratchy. I haven't noticed any ear symptoms.",
      sequence: 1,
    }, "For the cold symptoms you mentioned, what are you noticing in your nose, throat, or ears?", "ent_location");

    expect(facts).toContainEqual({
      fieldId: "ent_associated_features",
      value: "No ear symptoms noticed",
      status: "patient_denied",
      sourceResponseIds: ["ent-answer"],
    });
    expect(facts).not.toContainEqual(expect.objectContaining({ fieldId: "additional_symptoms", status: "patient_denied" }));
  });

  it.each([
    ["midnight", "Midnight"],
    ["around midnight", "Around midnight"],
    ["at midnight", "At midnight"],
    ["yesterday at midnight", "Yesterday at midnight"],
    ["12 midnight", "Midnight"],
    ["at 12 noon", "Noon"],
    ["today around 12:30 am", "Today at 12:30 am"],
    ["yesterday at 23:45", "Yesterday at 23:45"],
    ["The headache began today at midnight.", "Today at midnight"],
    ["2 am", "2 am"],
    ["at 2:30 am", "At 2:30 am"],
    ["12:00 a.m.", "12:00 am"],
    ["around 23:45", "Around 23:45"],
    ["00:30", "00:30"],
    ["23:59", "23:59"],
    ["noon", "Noon"],
    ["earlier in the morning", "Earlier in the morning"],
    ["early this morning", "Early this morning"],
    ["this afternoon", "This afternoon"],
    ["last night", "Last night"],
    ["overnight", "Overnight"],
    ["yesterday evening", "Yesterday evening"],
    ["since Tuesday", "Tuesday"],
    ["30 minutes ago", "About 30 minutes ago"],
    ["around 3 hours ago", "About 3 hours ago"],
    ["I felt this about 2 days ago", "About 2 days ago"],
    ["just a while ago", "A little while ago"],
    ["just a while a go", "A little while ago"],
    ["a little while ago", "A little while ago"],
    ["just now", "Just now"],
    ["about half an hour ago", "About half an hour ago"],
    ["a few hours", "For a few hours"],
    ["for 3 days", "For 3 days"],
    ["3 days", "For 3 days"],
    ["when I woke up", "When patient woke up"],
  ])("recognizes a short onset answer (%s) without asking for a restatement", (text, expected) => {
    const facts = extractPatientFacts({
      id: "onset-answer",
      text,
      sequence: 1,
      questionBankId: "symptom_onset__headache",
    }, "When did the headache begin?", "symptom_onset__headache");
    expect(facts).toContainEqual({
      fieldId: "symptom_onset_headache",
      value: expected,
      status: "reported",
      sourceResponseIds: ["onset-answer"],
    });
  });

  it.each([
    ["I don't know", "unknown"],
    ["not sure", "unknown"],
    ["prefer not to say", "declined"],
    ["none", "unknown"],
  ])("does not invent an onset when the answer is %s", (text, status) => {
    const facts = extractPatientFacts({
      id: "uncertain-onset",
      text,
      sequence: 1,
      questionBankId: "symptom_onset__headache",
    }, "When did the headache begin?", "symptom_onset__headache");
    expect(facts).toContainEqual({
      fieldId: "symptom_onset_headache",
      value: null,
      status,
      sourceResponseIds: ["uncertain-onset"],
    });
  });

  it("prefers the stated start time when another time appears in the same answer", () => {
    const facts = extractPatientFacts({
      id: "two-times",
      text: "I felt unwell today, but the headache started yesterday evening.",
      sequence: 1,
    }, "What have you been feeling?");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "Yesterday evening" }));
  });

  it("does not treat a negated time as the onset when a later positive time is given", () => {
    const facts = extractPatientFacts({
      id: "negated-time",
      text: "It did not begin at midnight; it started earlier in the morning.",
      sequence: 1,
      questionBankId: "symptom_onset__headache",
    }, "When did the headache begin?", "symptom_onset__headache");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "Earlier in the morning" }));
  });

  it.each([
    "I don't think it began at midnight.",
    "It did not start at midnight.",
    "Not at midnight.",
  ])("does not record a negated onset time as fact (%s)", (text) => {
    const facts = extractPatientFacts({
      id: "negated-onset",
      text,
      sequence: 1,
      questionBankId: "symptom_onset__headache",
    }, "When did the headache begin?", "symptom_onset__headache");
    expect(facts).not.toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", status: "reported" }));
  });

  it("keeps the confirmed time in a correction even when the answer mentions denial first", () => {
    const facts = extractPatientFacts({
      id: "corrected-onset",
      text: "Not midnight; it started around 2 am.",
      sequence: 2,
      correctsResponseId: "response-1",
    }, "Does the summary look right?", "summary_confirmation");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "onset", value: "Around 2 am", status: "patient_corrected" }));
  });

  it("does not interpret a bare time as onset when the active question is about something else", () => {
    const facts = extractPatientFacts({
      id: "other-question",
      text: "midnight",
      sequence: 1,
      questionBankId: "additional_symptoms",
    }, "Have you noticed any other symptoms?");
    expect(facts.some((field) => field.fieldId === "onset")).toBe(false);
  });

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

  it("applies a volunteered shared onset to each symptom when the patient says they felt this then", () => {
    const facts = extractPatientFacts({
      id: "shared-onset",
      text: "I have a headache with chills and fever. I felt this around 3 hours ago.",
      sequence: 0,
    }, "What have you been feeling?");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "About 3 hours ago" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_chills", value: "About 3 hours ago" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_fever", value: "About 3 hours ago" }));
  });

  it("applies a single 'it started' timeline to symptoms listed together in the same message", () => {
    const facts = extractPatientFacts({
      id: "anaphoric-shared-onset",
      text: "I have a headache, chills, a temperature of 37.5 C, and it started about 3 hours ago.",
      sequence: 0,
    }, "What have you been feeling?", "main_concern");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "About 3 hours ago" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_chills", value: "About 3 hours ago" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "temperature_measurement", value: expect.stringContaining("37.5") }));
  });

  it("applies a shared midnight onset to a headache and unspecified cramping", () => {
    const facts = extractPatientFacts({
      id: "headache-cramping-midnight",
      text: "I have a crushing headache and cramping I can't describe well. It began around midnight.",
      sequence: 0,
      questionBankId: "main_concern",
    }, "What have you been feeling?", "main_concern");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_headache", value: "Around midnight" }));
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "symptom_onset_cramping", value: "Around midnight" }));
  });

  it("does not attach an approximate onset time to a separately stated temperature", () => {
    expect(extractReportedTemperature("I have a headache, chills, a temperature of 37.5 C, and it started about 3 hours ago."))
      .toBe("Temperature reading: 37.5 °C");
    expect(extractReportedTemperature("I think my temperature is 37.5 C."))
      .toBe("Temperature reading: 37.5 °C (uncertain or approximate, as reported)");
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

  it.each(["yes", "yeah", "no", "nope"])("does not treat a bare %s as a headache location", (text) => {
    const facts = extractPatientFacts({
      id: "location-short-answer",
      text,
      sequence: 1,
      questionBankId: "headache_location",
    }, "Where do you feel the headache, and does it stay there or move?", "headache_location");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "headache_location", value: null, status: expect.stringMatching(/^(?:unclear|unknown)$/) }));
  });

  it("records no additional headache changes without removing the headache itself", () => {
    const facts = extractPatientFacts({
      id: "no-changes",
      text: "nothing, just headache",
      sequence: 2,
      questionBankId: "headache_associated",
    }, "Have you noticed any other changes along with the headache?", "headache_associated");
    expect(facts).toContainEqual(expect.objectContaining({ fieldId: "headache_associated_changes", status: "patient_denied", value: "No other changes reported; headache remains" }));
    expect(facts).not.toContainEqual(expect.objectContaining({ fieldId: "headache", status: "patient_denied" }));
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
