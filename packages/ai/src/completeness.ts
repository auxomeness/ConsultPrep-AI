import type { InformationStatus, IntakeState } from "./contracts.js";
import { detectSymptomCategories, getSymptomLabel, reportedSymptomFieldIds, type SymptomCategory } from "./question-bank.js";
import { assessSafety } from "./safety.js";

export type CompletenessStatus = "known" | "unknown" | "clarification_needed" | "potentially_urgent" | "sufficiently_covered";

export interface CompletenessCriterion {
  id: string;
  questionId: string;
  symptomId: string;
  label: string;
  requiredForWorkflow: boolean;
  status: CompletenessStatus;
  informationStatus: InformationStatus | "not_asked";
  asked: boolean;
  sourceResponseIds: string[];
}

export interface ConcernCompleteness {
  symptomId: string;
  label: string;
  category: SymptomCategory;
  status: CompletenessStatus;
  criteria: CompletenessCriterion[];
}

export interface IntakeCompleteness {
  status: CompletenessStatus;
  reviewStatus: "provisional_requires_clinician_review";
  meaning: string;
  concerns: ConcernCompleteness[];
  openRequiredQuestionIds: string[];
  clarificationQuestionIds: string[];
  urgentRuleId: string | null;
}

const REQUIRED_FIELD_BY_SYMPTOM: Readonly<Record<string, Array<{ fieldId: string; questionId: string; label: string }>>> = {
  visual_changes: [
    { fieldId: "affected_eyes", questionId: "eye_side", label: "Which eye or eyes are affected" },
    { fieldId: "visual_change_timing", questionId: "eye_visual_timing", label: "How the vision change began and varies" },
  ],
  cough: [
    { fieldId: "breathing_concern", questionId: "respiratory_breathing", label: "Breathing difficulty" },
  ],
  chest_discomfort: [
    { fieldId: "breathing_concern", questionId: "respiratory_breathing", label: "Breathing difficulty" },
  ],
};

/**
 * Reports documentation coverage for the intake workflow. These criteria are
 * provisional engineering defaults, not clinical standards or a completeness
 * score for diagnosis or care. Clinician review is required before deployment.
 */
export function assessIntakeCompleteness(state: IntakeState): IntakeCompleteness {
  const safety = state.safety?.routed ? state.safety : assessSafety(state);
  const symptomIds = reportedSymptomFieldIds(state);
  const text = [state.concern, ...state.responses.map((response) => response.text)].join("\n");
  const categories = detectSymptomCategories(text);
  const concerns = symptomIds.map((symptomId) => {
    const category = categoryForSymptom(symptomId, categories);
    const onsetFieldId = `symptom_onset_${symptomId}`;
    const required = [
      { fieldId: onsetFieldId, questionId: `symptom_onset__${symptomId}`, label: `Onset of ${getSymptomLabel(symptomId) ?? symptomId.replace(/_/g, " ")}` },
      ...(REQUIRED_FIELD_BY_SYMPTOM[symptomId] ?? []),
    ];
    const criteria = required.map((item) => criterion(state, symptomId, item.fieldId, item.questionId, item.label, true));
    const supportingFields = optionalFieldsFor(symptomId);
    for (const item of supportingFields) {
      if (criteria.some((candidate) => candidate.id === `${symptomId}:${item.fieldId}`)) continue;
      criteria.push(criterion(state, symptomId, item.fieldId, item.questionId, item.label, false));
    }
    const concernStatus: CompletenessStatus = safety.routed
      ? "potentially_urgent"
      : criteria.some((item) => item.requiredForWorkflow && item.status === "clarification_needed")
        ? "clarification_needed"
        : criteria.some((item) => item.requiredForWorkflow && !isDocumented(item))
          ? "unknown"
          : "sufficiently_covered";
    return { symptomId, label: getSymptomLabel(symptomId) ?? symptomId.replace(/_/g, " "), category, status: concernStatus, criteria };
  });

  const openRequiredQuestionIds = unique(concerns.flatMap((concern) => concern.criteria
    .filter((item) => item.requiredForWorkflow && !isDocumented(item) && item.status !== "clarification_needed")
    .map((item) => item.questionId)));
  const clarificationQuestionIds = unique(concerns.flatMap((concern) => concern.criteria
    .filter((item) => item.requiredForWorkflow && item.status === "clarification_needed")
    .map((item) => item.questionId)));
  const status: CompletenessStatus = safety.routed
    ? "potentially_urgent"
    : clarificationQuestionIds.length
      ? "clarification_needed"
      : openRequiredQuestionIds.length
        ? "unknown"
        : concerns.length
          ? "sufficiently_covered"
          : state.responses.length
            ? "unknown"
            : "unknown";

  return {
    status,
    reviewStatus: "provisional_requires_clinician_review",
    meaning: "Sufficiently covered means only that the prototype's minimum documentation prompts are known or explicitly recorded as unknown/declined; it does not mean clinically complete, safe, or ready for a decision.",
    concerns,
    openRequiredQuestionIds,
    clarificationQuestionIds,
    urgentRuleId: safety.routed ? safety.ruleId : null,
  };
}

export function isCompletenessCriterionDocumented(criterionValue: CompletenessCriterion): boolean {
  return isDocumented(criterionValue);
}

function criterion(state: IntakeState, symptomId: string, fieldId: string, questionId: string, label: string, requiredForWorkflow: boolean): CompletenessCriterion {
  const field = state.fields.find((item) => item.fieldId === fieldId);
  const history = (state.questionHistory ?? []).filter((entry) => entry.questionId === questionId).at(-1);
  const response = state.responses.find((item) => item.questionBankId === questionId);
  const asked = Boolean(field?.sourceResponseIds.length || history?.status && history.status !== "not_selected" && history.status !== "selected" || response);
  let status: CompletenessStatus;
  let informationStatus: InformationStatus | "not_asked";
  if (field?.status === "unclear" || field?.status === "conflicting" || history?.status === "requires_clarification" || history?.status === "partially_answered" || history?.status === "answered" && !field) {
    status = "clarification_needed";
    informationStatus = field?.status === "conflicting" ? "conflicting" : "unclear";
  } else if (history?.status === "skipped" || history?.status === "declined") {
    status = "unknown";
    informationStatus = history.status === "declined" ? "declined" : "not_answered";
  } else if (field && ["reported", "patient_denied", "patient_corrected"].includes(field.status)) {
    status = "known";
    informationStatus = field.status;
  } else {
    status = "unknown";
    informationStatus = field?.status ?? (asked ? "unknown" : "not_asked");
  }
  return {
    id: `${symptomId}:${fieldId}`,
    questionId,
    symptomId,
    label,
    requiredForWorkflow,
    status,
    informationStatus,
    asked,
    sourceResponseIds: field?.sourceResponseIds ?? history?.sourceResponseIds ?? (response ? [response.id] : []),
  };
}

function optionalFieldsFor(symptomId: string): Array<{ fieldId: string; questionId: string; label: string }> {
  if (symptomId === "visual_changes" || symptomId === "eye_soreness") return [
    { fieldId: "eye_associated_features", questionId: "eye_features", label: "Other eye changes" },
    { fieldId: "eye_injury_or_exposure", questionId: "eye_exposure", label: "Eye injury or exposure" },
    { fieldId: "contact_lens_use", questionId: "eye_contact_lenses", label: "Contact lens use" },
  ];
  if (symptomId === "cough" || symptomId === "chest_discomfort") return [
    { fieldId: "cough_description", questionId: "respiratory_cough", label: "Cough details" },
    { fieldId: "temperature_measurement", questionId: "respiratory_temperature", label: "Measured temperature" },
  ];
  if (["fever", "chills", "weakness"].includes(symptomId)) return [
    { fieldId: "temperature_measurement", questionId: "general_temperature", label: "Measured temperature" },
  ];
  return [];
}

function categoryForSymptom(symptomId: string, fallback: SymptomCategory[]): SymptomCategory {
  if (["eye_soreness", "visual_changes"].includes(symptomId)) return "eye_vision";
  if (["cough", "chest_discomfort"].includes(symptomId)) return "respiratory";
  if (["sore_throat", "runny_nose", "cold_like_symptoms"].includes(symptomId)) return "throat_nose_ear";
  if (["fever", "weakness", "body_aches", "chills"].includes(symptomId)) return "general";
  if (["headache"].includes(symptomId)) return "headache_neurological";
  if (["nausea", "stomach_pain", "diarrhea", "vomiting"].includes(symptomId)) return "digestive";
  if (symptomId === "skin_concern") return "skin";
  if (symptomId === "urinary_concern") return "urinary";
  if (symptomId === "musculoskeletal_concern") return "musculoskeletal";
  return fallback[0] ?? "other";
}

function isDocumented(item: CompletenessCriterion): boolean {
  return item.status === "known" || (item.status === "unknown" && item.asked && ["unknown", "declined", "not_answered"].includes(item.informationStatus));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
