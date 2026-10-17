import { describe, expect, it } from "vitest";
import { buildStructuredBrief, formatStructuredBrief, PROFESSIONAL_ADVICE_WARNING } from "../src/brief.js";
import { extractPatientFacts, mergeFieldUpdates } from "../src/intake-facts.js";
import type { IntakeState } from "../src/contracts.js";

function stateFromResponses(texts: string[]): IntakeState {
  const responses = texts.map((text, sequence) => ({ id: `r${sequence + 1}`, text, sequence }));
  let fields = [] as IntakeState["fields"];
  for (const response of responses) fields = mergeFieldUpdates(fields, extractPatientFacts(response, ""));
  return {
    schemaVersion: "1.0",
    concern: texts[0] ?? "",
    responses,
    fields,
    questionsAsked: [],
    completion: "in_progress",
  };
}

describe("structured consultation brief", () => {
  it("shows the professional-advice and urgent-care notice in patient-facing brief text", () => {
    expect(PROFESSIONAL_ADVICE_WARNING).toMatch(/does not provide a diagnosis/i);
    expect(PROFESSIONAL_ADVICE_WARNING).toMatch(/seek urgent medical care rather than waiting/i);
    expect(formatStructuredBrief(buildStructuredBrief(stateFromResponses(["I have a headache"]))).replace(/\s+/g, " "))
      .toContain(PROFESSIONAL_ADVICE_WARNING.replace(/\s+/g, " "));
  });

  it("organizes reported facts, keeps blurry vision out of functional impact, and preserves sources", () => {
    const state = stateFromResponses([
      "My eyes are sore, where should I go?",
      "It started today and I'm seeing blurry.",
      "Worse",
    ]);
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "patient_question", value: "Asks where to seek eye care", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r2"] },
      { fieldId: "progression", value: "Worsening", status: "reported", sourceResponseIds: ["r3"] },
    ]);
    const brief = buildStructuredBrief(state);
    const rendered = formatStructuredBrief(brief);
    expect(rendered).toContain("REASON FOR VISIT");
    expect(rendered).toContain("Eye soreness");
    expect(rendered).toContain("Blurry vision");
    expect(rendered).toContain("Patient asks where to seek eye care");
    expect(brief.functionalImpact).toEqual([]);
    expect(rendered).toContain("DAILY IMPACT\n\n  Not established during intake.");
    expect(brief.sourceTraceability).toEqual(state.responses.map((response) => ({ responseId: response.id, originalText: response.text })));
    expect(rendered.replace(/\s+/g, " ")).toContain("does not replace assessment by a qualified healthcare professional");
  });

  it("renders a scan-friendly patient-facing summary without internal response IDs", () => {
    const state = stateFromResponses([
      "I feel hot and have a headache that has been bothering me all day",
      "It started earlier today and is getting worse",
    ]);
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "progression", value: "Getting worse", status: "reported", sourceResponseIds: ["r2"] },
    ]);
    const rendered = formatStructuredBrief(buildStructuredBrief(state, true));
    expect(rendered).toContain("CONSULTPREP  |  PRE-CONSULTATION SUMMARY");
    expect(rendered).toContain("CONFIRMED BY PATIENT · DRAFT FOR CLINICIAN REVIEW");
    expect(rendered).not.toContain("[r1]");
    expect(rendered).not.toContain("response-1");
    expect(rendered).not.toContain("YOUR ORIGINAL ANSWERS");
    expect(rendered).toContain("HANDOFF STATUS");
    expect(rendered.split("\n").every((line) => line.length <= 76)).toBe(true);
  });

  it("creates a sourced patient-reported narrative without duplicating identical onset details", () => {
    const state = stateFromResponses(["I have a headache and vomiting", "Headache began earlier this morning", "Vomiting began just a while ago"]);
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "symptom_onset_headache", value: "Earlier this morning", status: "reported", sourceResponseIds: ["r2"] },
      { fieldId: "symptom_onset_vomiting", value: "A little while ago", status: "reported", sourceResponseIds: ["r3"] },
      { fieldId: "headache_character", value: "Crushing in my head", status: "reported", sourceResponseIds: ["r1"] },
      { fieldId: "headache_location", value: null, status: "unclear", sourceResponseIds: ["r1"] },
    ]);
    const brief = buildStructuredBrief(state);
    expect(brief.patientReportedNarrative?.text).toContain("headache");
    expect(brief.patientReportedNarrative?.text).toContain("vomiting");
    expect(brief.patientReportedNarrative?.text).toContain("Crushing in my head");
    expect(brief.patientReportedNarrative?.sourceResponseIds).toEqual(expect.arrayContaining(["r1", "r2", "r3"]));
    expect(brief.symptomTimeline.filter((fact) => fact.text.startsWith("Onset:")).length).toBe(0);
  });

  it("preserves when the patient says they cannot describe a symptom clearly", () => {
    const state = stateFromResponses(["I have a crushing headache and cramping I can't describe well."]);
    const brief = buildStructuredBrief(state);

    expect(brief.patientReportedNarrative?.text).toMatch(/cramping hard to describe clearly/i);
    expect(brief.patientReportedNarrative?.sourceResponseIds).toContain("r1");
  });

  it("uses a short narrative, symptom bullets, action history, and separate sourced comfort information", () => {
    const state = stateFromResponses([
      "I feel hot, have a headache, and I vomited",
      "I tried resting; the headache stays at the front of my head",
    ]);
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "actions_taken", value: "I tried resting", status: "reported", sourceResponseIds: ["r2"] },
      { fieldId: "symptom_location", value: "It stays at the front of my head", status: "reported", sourceResponseIds: ["r2"] },
    ]);
    const rendered = formatStructuredBrief(buildStructuredBrief(state));
    expect(rendered).toContain("OVERVIEW");
    expect(rendered).toContain("I’m seeking advice about");
    expect(rendered).not.toContain("The patient");
    expect(rendered).toContain("SYMPTOMS YOU REPORTED");
    expect(rendered).toContain("SYMPTOM DETAILS");
    expect(rendered).toContain("Symptom Location: It stays at the front of my head");
    expect(rendered).toContain("WHAT YOU HAVE TRIED");
    expect(rendered).toContain("I tried resting");
    expect(rendered).toContain("GENERAL COMFORT INFORMATION FOR YOU");
    expect(rendered.replace(/\s+/g, " ")).toContain("small, frequent sips of clear fluids");
    expect(rendered.replace(/\s+/g, " ")).toContain("not a diagnosis or a personalized treatment plan");
    expect(rendered.replace(/\s+/g, " ")).toContain("https://www.nhs.uk/conditions/dehydration/");
    expect(rendered).not.toContain("The symptoms are caused by");
    expect(rendered.split("\n").every((line) => line.length <= 76)).toBe(true);
  });

  it("omits comfort tips when an automated safety flag is present", () => {
    const state = stateFromResponses(["I have a cough and trouble breathing"]);
    state.safety = { routed: true, ruleId: "breathing_emergency", guidance: "Seek emergency help now.", matchedResponseIds: ["r1"] };
    expect(formatStructuredBrief(buildStructuredBrief(state))).not.toContain("GENERAL COMFORT INFORMATION FOR YOU");
  });

  it("records local patient confirmation separately from clinician approval or transmission", () => {
    const state = stateFromResponses(["My head hurts"]);
    const brief = buildStructuredBrief(state, true);
    expect(brief.status).toBe("patient_confirmed");
    expect(formatStructuredBrief(brief)).toContain("Patient confirmation: confirmed by you.");
    expect(brief.clinicianReviewStatus).toBe("not_available");
  });

  it("keeps unrelated facts from a response when only one field is corrected", () => {
    const state = stateFromResponses(["My eyes are sore and my vision is blurry; it started today."]);
    state.responses.push({ id: "r2", text: "Correction: it started yesterday, not today", sequence: 1, correctsResponseId: "r1" });
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "onset", value: "Yesterday", status: "patient_corrected", sourceResponseIds: ["r2"] },
    ]);
    const brief = buildStructuredBrief(state);
    expect(brief.primaryConcern.map((fact) => fact.text).join(" ")).toContain("Eye soreness");
    expect(brief.reportedSymptoms.map((fact) => fact.text)).toContain("Blurry vision");
    expect(brief.onsetAndProgression.map((fact) => fact.text)).toEqual(["Onset: Yesterday"]);
  });

  it("preserves unknown and conflicting information without presenting it as denied", () => {
    const state = stateFromResponses(["I have a headache", "I don't know when it began", "It began today"]);
    state.fields = mergeFieldUpdates(state.fields, [
      { fieldId: "temperature_measurement", value: null, status: "unknown", sourceResponseIds: ["r2"] },
      { fieldId: "onset", value: "Today", status: "reported", sourceResponseIds: ["r3"] },
      { fieldId: "onset", value: "Yesterday", status: "reported", sourceResponseIds: ["r1"] },
    ]);
    const brief = buildStructuredBrief(state);
    expect(brief.informationNotEstablished).toContain("Temperature Measurement: not answered or unknown.");
    expect(brief.informationNotEstablished).toContain("Onset: conflicting reports.");
    expect(brief.currentSymptoms.some((fact) => fact.status === "patient_denied")).toBe(false);
  });

  it("includes the safety guidance and patient source actually recorded in intake state", () => {
    const state = stateFromResponses(["I suddenly lost my vision"]);
    state.safety = {
      routed: true,
      ruleId: "emergency_eye_warning_sign",
      guidance: "Seek emergency eye assessment now. This intake has stopped.",
      matchedResponseIds: ["r1"],
    };
    const brief = buildStructuredBrief(state);
    expect(brief.automatedSafetyFlags).toEqual([{
      ruleId: "emergency_eye_warning_sign",
      message: "Seek emergency eye assessment now. This intake has stopped.",
      sourceResponseIds: ["r1"],
    }]);
  });
});
