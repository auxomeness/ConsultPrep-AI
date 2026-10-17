import type { IntakeState } from "./contracts.js";
import { extractPatientFacts, mergeFieldUpdates } from "./intake-facts.js";

export function recordPatientCorrection(state: IntakeState, text: string): IntakeState {
  const timelineCorrection = /\b(started|began|onset|yesterday|today|last night|this morning|when i woke up)\b/i.test(text);
  const targetField = timelineCorrection && /\b(headache|head pain|migraine)\b/i.test(text) ? "symptom_onset_headache"
    : timelineCorrection && /\b(vision|sight|blurry|blurred)\b/i.test(text) ? "symptom_onset_visual_changes"
      : timelineCorrection && /\b(eye soreness|sore eyes?)\b/i.test(text) ? "symptom_onset_eye_soreness"
  : /\b(one eye|left eye|right eye|both eyes|both of my eyes)\b/i.test(text) ? "affected_eyes"
    : /\b(started|began|onset|yesterday|today|last night|this morning)\b/i.test(text) ? "onset"
      : /\b(worse|worsening|better|improving|same|unchanged)\b/i.test(text) ? "progression"
    : /\b(blurry|blurred|vision|sight|eye)\b/i.test(text) ? (/\b(vision|sight|blurry|blurred)\b/i.test(text) ? "visual_changes" : "eye_soreness")
      : /\b(activity|activities|read|walk|work|daily)\b/i.test(text) ? "daily_impact"
        : /\btemperature|degrees?\s*[cf]|\d{2}\.\d\b/i.test(text) ? "temperature_measurement" : null;
  const sourceResponseId = (targetField ? state.fields.find((field) => field.fieldId === targetField)?.sourceResponseIds.at(-1) : undefined)
    ?? state.responses[0]?.id;
  const responseId = `response-${state.responses.length + 1}`;
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    ...(state.questionsAsked.at(-1) ? { questionId: state.questionsAsked.at(-1)! } : {}),
    ...(targetField?.startsWith("symptom_onset_") ? { questionBankId: `symptom_onset__${targetField.slice("symptom_onset_".length)}` } : {}),
    ...(sourceResponseId ? { correctsResponseId: sourceResponseId } : {}),
    createdAt: new Date().toISOString(),
  };
  let fields = mergeFieldUpdates(state.fields, extractPatientFacts(response, response.questionId ?? "", response.questionBankId));
  if (!fields.some((field) => field.sourceResponseIds.includes(responseId))) {
    fields = mergeFieldUpdates(fields, [{ fieldId: "correction_note", value: null, status: "unclear", sourceResponseIds: [responseId] }]);
  }
  return { ...state, responses: [...state.responses, response], fields };
}

export function confirmPatientBrief(state: IntakeState): IntakeState {
  if (state.completion === "completed") return state;
  return { ...state, completion: "completed", patientConfirmed: true };
}
