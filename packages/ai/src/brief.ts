import { StructuredConsultationBriefSchema, type IntakeField, type IntakeState, type StructuredConsultationBrief, validateIntakeState } from "./contracts.js";
import { getSymptomLabel, isQuestionApplicable, isSymptomReportField, QUESTION_BANK, detectSymptomCategories, questionIsRelevant, reportedSymptomFieldIds } from "./question-bank.js";
import { assessSafety } from "./safety.js";
import { assessIntakeCompleteness } from "./completeness.js";

export const PROFESSIONAL_ADVICE_WARNING = "Important: ConsultPrep AI organizes the information you provide and may contain errors or omissions. It does not provide a diagnosis and does not replace assessment by a qualified healthcare professional. Please review the information carefully and seek advice from a qualified healthcare professional about your symptoms and concerns. If you experience severe or sudden symptoms, seek urgent medical care rather than waiting to complete this intake.";

export function buildStructuredBrief(state: IntakeState, confirmed = false): StructuredConsultationBrief {
  validateIntakeState(state);
  const activeFields = state.fields.filter((field) => !isSuperseded(field, state));
  const responses = new Map(state.responses.map((response) => [response.id, response.text]));
  const factsFor = (fields: IntakeField[]) => fields.flatMap((field) => {
    if (!field.value || !field.sourceResponseIds.length) return [];
    const originalText = field.sourceResponseIds.map((id) => responses.get(id)).filter((text): text is string => Boolean(text));
    if (!originalText.length) return [];
    return [{ text: field.value, status: field.status, sourceResponseIds: field.sourceResponseIds, originalText }];
  });

  const symptoms = activeFields.filter((field) => isSymptomField(field.fieldId));
  const onsetAndProgression = activeFields.filter((field) => ["onset", "progression"].includes(field.fieldId));
  const onsetAndProgressionFacts = onsetAndProgression.flatMap((field) => factsFor([field]).map((fact) => ({
    ...fact,
    text: `${field.fieldId === "onset" ? "Onset" : "Course"}: ${fact.text}`,
  })));
  const impact = activeFields.filter((field) => field.fieldId === "daily_impact");
  const additional = activeFields.filter((field) => field.fieldId === "additional_symptoms");
  const patientQuestion = activeFields.find((field) => field.fieldId === "patient_question");
  const patientGoal = activeFields.find((field) => field.fieldId === "patient_goal");
  const safety = state.responses.filter((response) => /\b(shortness of breath|difficulty breathing|trouble breathing|blurry vision|blurred vision|vision loss|severe eye pain|cannot see|can't see|eye injury)\b/i.test(response.text));
  const informationNotEstablished: string[] = [];
  for (const field of activeFields.filter((candidate) => ["unknown", "not_answered", "not_asked", "unclear", "conflicting", "declined"].includes(candidate.status))) {
    informationNotEstablished.push(`${humanize(field.fieldId)}: ${statusLabel(field.status)}.`);
  }

  const primarySymptom = symptoms[0];
  const patientConcern = activeFields.find((field) => field.fieldId === "primary_concern");
  const primarySourceIds = [...new Set([...(primarySymptom?.sourceResponseIds ?? []), ...(patientConcern?.sourceResponseIds ?? [])])];
  const primaryOriginalText = [...new Set(primarySourceIds.map((id) => responses.get(id)).filter((text): text is string => Boolean(text)))];
  const primaryFacts = primarySourceIds.length ? [{
    text: primarySymptom?.value ?? patientConcern?.value ?? "Reason for seeking care (patient's words)",
    status: primarySymptom?.status === "patient_corrected" ? "patient_corrected" as const : "reported" as const,
    sourceResponseIds: primarySourceIds,
    originalText: primaryOriginalText,
  }] : state.responses[0] ? [{
    text: "Reason for seeking care (patient's words)",
    status: "reported" as const,
    sourceResponseIds: [state.responses[0].id],
    originalText: [state.responses[0].text],
  }] : [];
  const sourceTraceability = state.responses.map((response) => ({ responseId: response.id, originalText: response.text }));
  const allSymptomFacts = factsFor(symptoms);
  const patientQuestions = factsFor([patientQuestion, patientGoal].filter((field): field is IntakeField => field !== undefined)).map((fact) => ({
    ...fact,
    text: fact.text === "Asks where to seek eye care" ? "Patient asks where to seek eye care" : fact.text,
  }));
  const timelineFields = activeFields.filter((field) => ["onset", "progression", "onset_pattern", "previous_episodes", "episode_pattern", "visual_change_timing"].includes(field.fieldId) || field.fieldId.startsWith("symptom_onset_"));
  const timelineFacts = timelineFields.flatMap((field) => factsFor([field]).map((fact) => ({
    ...fact,
    text: `${timelineLabel(field.fieldId)}: ${fact.text}`,
  })));
  const contextFields = activeFields.filter((field) => ["relevant_context", "medical_history", "medications", "allergies", "recent_events", "prior_advice", "prior_eye_advice", "contact_lens_use", "food_fluids"].includes(field.fieldId));
  const symptomDetailFields = activeFields.filter((field) => ["symptom_location", "symptom_character", "symptom_severity", "headache_associated_changes", "digestive_pattern", "ent_associated_features", "visual_change_description"].includes(field.fieldId));
  const actionFields = activeFields.filter((field) => field.fieldId === "actions_taken");
  const backgroundFacts = [
    ...factsFor(contextFields),
    ...symptomDetailFields.flatMap((field) => factsFor([field]).map((fact) => ({ ...fact, text: `${humanize(field.fieldId)}: ${fact.text}` }))),
    ...factsFor(actionFields).map((fact) => ({ ...fact, text: `Action taken: ${fact.text}` })),
  ];
  const categoryText = [state.concern, ...state.responses.map((response) => response.text)].join("\n");
  const categories = detectSymptomCategories(categoryText);
  const unanswered = QUESTION_BANK.filter((question) => question.id !== "onset" && questionIsRelevant(question, categories) && isQuestionApplicable(question, state)).flatMap((question) => {
    const field = activeFields.find((candidate) => candidate.fieldId === question.targetField);
    const prior = (state.questionHistory ?? []).filter((entry) => entry.questionId === question.id).at(-1);
    if (field && ["reported", "patient_denied", "patient_corrected"].includes(field.status)) return [];
    if (prior && ["answered", "skipped"].includes(prior.status) && !field) return [];
    return [{
      fieldId: question.targetField,
      question: question.question,
      importance: question.required ? "important" as const : "optional" as const,
      status: prior?.status === "requires_clarification" ? "unclear" as const
        : prior?.status === "partially_answered" ? "partially_answered" as const
          : field?.status === "conflicting" ? "conflicting" as const
            : field?.status === "declined" || prior?.status === "declined" ? "declined" as const
              : field?.status === "unknown" ? "unknown" as const : "not_asked" as const,
    }];
  });
  const unansweredOnset = reportedSymptomFieldIds(state).filter((symptomId) => {
    const onset = activeFields.find((field) => field.fieldId === `symptom_onset_${symptomId}`);
    return !onset || ["unknown", "not_answered", "not_asked", "unclear", "conflicting", "declined"].includes(onset.status);
  }).map((symptomId) => ({
    fieldId: `symptom_onset_${symptomId}`,
    question: `When did the ${getSymptomLabel(symptomId) ?? symptomId.replace(/_/g, " ")} begin?`,
    importance: "important" as const,
    status: (activeFields.find((field) => field.fieldId === `symptom_onset_${symptomId}`)?.status === "declined" ? "declined"
      : activeFields.find((field) => field.fieldId === `symptom_onset_${symptomId}`)?.status === "conflicting" ? "conflicting"
        : activeFields.find((field) => field.fieldId === `symptom_onset_${symptomId}`)?.status === "unclear" ? "unclear"
          : activeFields.some((field) => field.fieldId === `symptom_onset_${symptomId}`) ? "unknown" : "not_asked") as "declined" | "conflicting" | "unclear" | "unknown" | "not_asked",
  }));
  const topUnanswered = [...unansweredOnset, ...unanswered].sort((left, right) => Number(right.importance === "important") - Number(left.importance === "important")).slice(0, 6);
  const automatedSafety = state.safety?.routed ? state.safety : assessSafety(state);
  const intakeCompleteness = assessIntakeCompleteness(state);
  const brief = StructuredConsultationBriefSchema.parse({
    schemaVersion: "1.0",
    status: confirmed ? "patient_confirmed" : "ai_generated_draft",
    patientIdentification: factsFor(activeFields.filter((field) => field.fieldId === "patient_name" || field.fieldId === "patient_identifier")),
    reasonForConsultation: primaryFacts,
    currentSymptoms: allSymptomFacts,
    symptomTimeline: timelineFacts,
    relevantBackground: backgroundFacts,
    associatedSymptoms: factsFor(additional),
    importantUnansweredQuestions: topUnanswered,
    patientConcernsAndQuestions: patientQuestions,
    guidanceProvided: state.guidanceProvided ?? [],
    automatedSafetyFlags: automatedSafety.routed && automatedSafety.ruleId ? [{
      ruleId: automatedSafety.ruleId,
      message: automatedSafety.guidance ?? "Automated safety rule matched; this is not a diagnosis and does not rule out other urgent concerns.",
      sourceResponseIds: automatedSafety.matchedResponseIds,
    }] : [],
    intakeCompleteness,
    clinicianReviewStatus: "not_available",
    primaryConcern: primaryFacts,
    reportedSymptoms: factsFor(primarySymptom ? symptoms.filter((field) => field.fieldId !== primarySymptom.fieldId) : symptoms),
    onsetAndProgression: onsetAndProgressionFacts.length ? onsetAndProgressionFacts : timelineFacts,
    functionalImpact: factsFor(impact),
    additionalSymptoms: factsFor(additional),
    informationNotEstablished: [...new Set(informationNotEstablished)],
    safetyRelevantStatements: safety.map((response) => ({
      text: "Patient reported: " + response.text,
      status: "reported" as const,
      sourceResponseIds: [response.id],
      originalText: [response.text],
    })),
    sourceTraceability,
  });
  validateBriefEvidence(brief, state);
  return brief;
}

export function formatStructuredBrief(brief: StructuredConsultationBrief): string {
  const width = 76;
  const rule = "━".repeat(width);
  const lines = [
    rule,
    "CONSULTPREP  |  PRE-CONSULTATION SUMMARY",
    brief.status === "patient_confirmed" ? "CONFIRMED BY PATIENT · DRAFT FOR CLINICIAN REVIEW" : "DRAFT · AWAITING PATIENT CONFIRMATION",
    rule,
    "",
  ];

  pushSection(lines, "Patient", brief.patientIdentification, width);
  const reason = brief.reasonForConsultation.length ? brief.reasonForConsultation : brief.primaryConcern;
  const symptoms = brief.currentSymptoms.length ? brief.currentSymptoms : brief.reportedSymptoms;
  addHeading(lines, "Overview");
  const reasonText = reason.map((fact) => fact.text).join("; ");
  const symptomText = symptoms.map((fact) => fact.text).join(", ");
  appendWrapped(lines, `${reasonText ? `You came to organize a concern about ${reasonText.toLocaleLowerCase()}.` : "You came to organize a health concern."}${symptomText ? ` You also reported ${symptomText.toLocaleLowerCase()}.` : ""} This summary records what you shared; it does not identify a cause or diagnosis.`, width, "  ");
  pushSection(lines, "Reason for Visit", reason, width);
  pushSection(lines, "Symptoms You Reported", symptoms, width);
  pushSection(lines, "Timeline", brief.symptomTimeline.length ? brief.symptomTimeline : brief.onsetAndProgression, width);
  if (brief.functionalImpact.length) pushSection(lines, "Daily Impact", brief.functionalImpact, width);
  else {
    addHeading(lines, "Daily Impact");
    appendWrapped(lines, "Not established during intake.", width, "  ");
  }
  const actionFacts = brief.relevantBackground.filter((fact) => fact.text.startsWith("Action taken: "))
    .map((fact) => ({ ...fact, text: fact.text.slice("Action taken: ".length) }));
  const symptomDetailFacts = brief.relevantBackground.filter((fact) => !fact.text.startsWith("Action taken: ") && /^[A-Z][\w ]+: /.test(fact.text));
  const otherBackgroundFacts = brief.relevantBackground.filter((fact) => !fact.text.startsWith("Action taken: ") && !symptomDetailFacts.includes(fact));
  pushSection(lines, "Symptom Details", symptomDetailFacts, width);
  if (actionFacts.length) pushSection(lines, "What You Have Tried", actionFacts, width);
  else {
    addHeading(lines, "What You Have Tried");
    appendWrapped(lines, "Not established during intake.", width, "  ");
  }
  pushSection(lines, "Other Relevant Context", otherBackgroundFacts, width);
  pushSection(lines, "Other Symptoms", brief.associatedSymptoms.length ? brief.associatedSymptoms : brief.additionalSymptoms, width);

  if (brief.importantUnansweredQuestions.length || brief.informationNotEstablished.length) {
    addHeading(lines, "Still to Clarify");
    brief.importantUnansweredQuestions.forEach((item) => appendWrapped(lines, `• ${item.question} (${item.status.replace(/_/g, " ")})`, width, "  "));
    if (!brief.importantUnansweredQuestions.length) brief.informationNotEstablished.forEach((item) => appendWrapped(lines, `• ${item}`, width, "  "));
  }

  addHeading(lines, "Intake Coverage");
  appendWrapped(lines, `Provisional workflow coverage: ${brief.intakeCompleteness.status.replace(/_/g, " ")}. This is not a measure of clinical completeness.`, width, "  ");
  brief.intakeCompleteness.concerns.forEach((concern) => {
    const unresolved = concern.criteria.filter((criterion) => criterion.requiredForWorkflow && criterion.status !== "known");
    const detail = unresolved.length ? `; open items: ${unresolved.map((item) => `${item.label} (${item.informationStatus.replace(/_/g, " ")})`).join(", ")}` : "";
    appendWrapped(lines, `• ${concern.label}: ${concern.status.replace(/_/g, " ")}${detail}`, width, "  ");
  });

  pushSection(lines, "Your Questions", brief.patientConcernsAndQuestions, width);
  if (brief.guidanceProvided.length) {
    addHeading(lines, "Guidance Shared During Intake");
    brief.guidanceProvided.forEach((item) => appendWrapped(lines, `• ${item.text} (${item.category.replace(/_/g, " ")}; prompted by ${formatSources(item.sourceResponseIds)})`, width, "  "));
  }
  pushSection(lines, "Safety-Relevant Statements", brief.safetyRelevantStatements, width);
  if (brief.automatedSafetyFlags.length) {
    addHeading(lines, "Safety Notice");
    brief.automatedSafetyFlags.forEach((flag) => appendWrapped(lines, `${flag.message} (rule ${flag.ruleId}; ${formatSources(flag.sourceResponseIds)})`, width, "  "));
  }

  addHeading(lines, "Your Original Answers");
  brief.sourceTraceability.forEach((source) => appendWrapped(lines, `[${source.responseId}] “${source.originalText}”`, width, "  "));
  lines.push("");
  addHeading(lines, "Handoff Status");
  appendWrapped(lines, `Patient confirmation: ${brief.status === "patient_confirmed" ? "confirmed locally" : "not yet confirmed"}. Clinician review: ${brief.clinicianReviewStatus.replace(/_/g, " ")}. This terminal demo has not sent the summary to a clinician.`, width, "  ");
  const comfortInfo = patientComfortInformation(brief);
  if (comfortInfo) {
    lines.push("");
    addHeading(lines, "General Comfort Information for You");
    comfortInfo.guidance.forEach((item) => appendWrapped(lines, `• ${item}`, width, "  "));
    addHeading(lines, "Sources for Comfort Information");
    comfortInfo.sources.forEach((source) => {
      appendWrapped(lines, source.label, width, "  ");
      appendWrapped(lines, source.url, width, "    ");
    });
  }
  lines.push("", rule, "PLEASE NOTE");
  appendWrapped(lines, PROFESSIONAL_ADVICE_WARNING, width, "  ");
  lines.push(rule);
  return lines.join("\n");
}

function pushSection(lines: string[], heading: string, facts: Array<{ text: string; sourceResponseIds: string[] }>, width: number): void {
  if (!facts.length) return;
  addHeading(lines, heading);
  facts.forEach((fact) => appendWrapped(lines, `• ${fact.text}  ${formatSources(fact.sourceResponseIds)}`, width, "  "));
}

function addHeading(lines: string[], heading: string): void {
  lines.push(heading.toLocaleUpperCase(), "");
}

function formatSources(ids: string[]): string {
  return ids.map((id) => `[${id}]`).join(" ");
}

function appendWrapped(lines: string[], text: string, width: number, indent: string): void {
  const words = text.split(/\s+/).filter(Boolean);
  let current = indent;
  for (const word of words) {
    const next = current === indent ? `${current}${word}` : `${current} ${word}`;
    if (next.length > width && current !== indent) {
      lines.push(current);
      current = `${indent}${word}`;
    } else current = next;
  }
  if (current.trim()) lines.push(current);
}

function isSymptomField(fieldId: string): boolean {
  return isSymptomReportField(fieldId);
}

function patientComfortInformation(brief: StructuredConsultationBrief): { guidance: string[]; sources: Array<{ label: string; url: string }> } | undefined {
  if (!brief.currentSymptoms.length && !brief.reportedSymptoms.length) return undefined;
  if (brief.automatedSafetyFlags.length) return undefined;
  const symptomText = [...brief.currentSymptoms, ...brief.reportedSymptoms].map((fact) => fact.text).join(" ").toLowerCase();
  const hasColdLike = /cold|cough|sore throat|runny nose/.test(symptomText);
  const hasFeverishness = /fever|hot or fever/.test(symptomText);
  const hasVomiting = /vomit|threw up|nausea/.test(symptomText);
  const hasHeadache = /headache/.test(symptomText);
  if (!hasColdLike && !hasFeverishness && !hasVomiting && !hasHeadache) return undefined;

  const guidance = new Set<string>();
  const sources = new Map<string, { label: string; url: string }>();
  if (hasColdLike) {
    guidance.add("For mild cold-like symptoms, rest and drink fluids as you are able.");
    sources.set("common_cold", { label: "NHS — Common cold", url: "https://www.nhs.uk/conditions/common-cold/" });
  }
  if (hasFeverishness) {
    guidance.add("If you feel feverish, rest and drink fluids as you are able. A clinician can advise you about a high, persistent, or worsening measured temperature.");
    sources.set("fever", { label: "NHS — High temperature in adults", url: "https://www.nhs.uk/symptoms/fever-in-adults/" });
  }
  if (hasHeadache) {
    guidance.add("For a headache, drinking water and resting may help with comfort.");
    sources.set("headache", { label: "NHS 111 Wales — Headache", url: "https://111.wales.nhs.uk/encyclopaedia/h/article/headache/" });
  }
  if (hasVomiting) {
    guidance.add("If you feel sick or have been vomiting, try small, frequent sips of clear fluids. Seek medical advice if you cannot keep fluids down, are urinating much less than usual, or notice blood in vomit or severe abdominal pain.");
    sources.set("dehydration", { label: "NHS — Dehydration", url: "https://www.nhs.uk/conditions/dehydration/" });
    sources.set("vomiting", { label: "MedlinePlus — Nausea and vomiting", url: "https://medlineplus.gov/ency/article/003117.htm" });
  }
  if (hasHeadache && hasVomiting) {
    guidance.add("Because you reported both headache and vomiting, contact a healthcare professional for advice rather than relying on home measures alone.");
  }
  guidance.add("These are general comfort measures, not a diagnosis or a personalized treatment plan. If symptoms are severe or suddenly worsen, seek urgent medical care. Follow any advice already given to you by a healthcare professional.");
  return { guidance: [...guidance], sources: [...sources.values()] };
}

function timelineLabel(fieldId: string): string {
  if (fieldId.startsWith("symptom_onset_")) {
    const symptomId = fieldId.slice("symptom_onset_".length);
    return `Onset (${getSymptomLabel(symptomId) ?? symptomId.replace(/_/g, " ")})`;
  }
  return `${humanize(fieldId)}`;
}

function isSuperseded(field: IntakeField, state: IntakeState): boolean {
  return state.responses.some((response) => {
    if (!response.correctsResponseId || !field.sourceResponseIds.includes(response.correctsResponseId)) return false;
    return state.fields.some((replacement) => replacement.fieldId === field.fieldId
      && replacement.status === "patient_corrected"
      && replacement.sourceResponseIds.includes(response.id));
  });
}

function validateBriefEvidence(brief: StructuredConsultationBrief, state: IntakeState): void {
  const responses = new Map(state.responses.map((response) => [response.id, response.text]));
  const facts = [
    ...brief.patientIdentification,
    ...brief.reasonForConsultation,
    ...brief.currentSymptoms,
    ...brief.symptomTimeline,
    ...brief.relevantBackground,
    ...brief.associatedSymptoms,
    ...brief.patientConcernsAndQuestions,
    ...brief.primaryConcern,
    ...brief.reportedSymptoms,
    ...brief.onsetAndProgression,
    ...brief.functionalImpact,
    ...brief.additionalSymptoms,
    ...brief.safetyRelevantStatements,
  ];
  for (const fact of facts) {
    const sourceTexts = fact.sourceResponseIds.map((id) => responses.get(id));
    if (sourceTexts.some((text) => text === undefined)) throw new Error("Brief fact references a response outside the validated intake state.");
    if (fact.originalText.some((text) => !sourceTexts.includes(text))) throw new Error("Brief evidence text does not match its cited patient response.");
  }
  for (const flag of brief.automatedSafetyFlags) {
    if (flag.sourceResponseIds.some((id) => !responses.has(id))) throw new Error("Safety flag references a response outside the validated intake state.");
  }
  for (const guidance of brief.guidanceProvided) {
    if (guidance.sourceResponseIds.some((id) => !responses.has(id))) throw new Error("Guidance record references a response outside the validated intake state.");
  }
  if (brief.sourceTraceability.length !== state.responses.length
    || brief.sourceTraceability.some((source) => responses.get(source.responseId) !== source.originalText)) {
    throw new Error("Brief source traceability does not match the validated intake state.");
  }
}

function statusLabel(status: string): string {
  if (status === "unknown" || status === "not_answered") return "not answered or unknown";
  if (status === "not_asked") return "not asked";
  if (status === "declined") return "patient declined to answer";
  if (status === "unclear") return "needs clarification";
  if (status === "conflicting") return "conflicting reports";
  return status;
}

function humanize(fieldId: string): string {
  return fieldId.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
