import type { IntakeField, IntakeState, NextTurnResult, QuestionHistoryEntry, SafetyEvent } from "./contracts.js";
import { extractPatientFacts, mergeFieldUpdates } from "./intake-facts.js";
import { QUESTION_BANK } from "./question-bank.js";
import { classifyConversationIntent } from "./conversation.js";

/** Add one patient answer and locally extracted facts to an intake state. */
export function recordPatientAnswer(state: IntakeState, text: string): { state: IntakeState; responseId: string } {
  if (state.completion === "emergency_interrupted" || state.safety?.routed) {
    return { state, responseId: state.responses.at(-1)?.id ?? "emergency-interrupted" };
  }
  const intent = classifyConversationIntent({ text, isFirstPatientTurn: state.responses.length === 0 });
  if (intent === "correction") {
    const responseId = `response-${state.responses.length + 1}`;
    return { state: recordPatientCorrection(state, text), responseId };
  }
  const responseId = `response-${state.responses.length + 1}`;
  const activeQuestionId = state.activeQuestionId;
  const activeQuestion = state.questionsAsked.at(-1) ?? "";
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    ...(activeQuestion ? { questionId: activeQuestion } : {}),
    ...(activeQuestionId ? { questionBankId: activeQuestionId } : {}),
    createdAt: new Date().toISOString(),
  };
  const nonClinicalOpening = ["greeting", "identity_question", "vague_opening", "ambiguous_opening"].includes(intent);
  const updates = nonClinicalOpening ? [] : extractPatientFacts(response, activeQuestion, activeQuestionId);
  const fields = mergeFieldUpdates(state.fields, updates);
  const questionHistory = activeQuestionId && !nonClinicalOpening
    ? markQuestionAnswered(state.questionHistory ?? [], activeQuestionId, responseId, updates, text)
    : state.questionHistory;
  return {
    responseId,
    state: {
      ...state,
      currentIntent: intent,
      concern: state.concern || (nonClinicalOpening || ["finish", "workflow_question", "summary", "decline", "unclear"].includes(intent)
        || updates.every((field) => field.fieldId === "patient_question") ? "" : text),
      responses: [...state.responses, response],
      fields,
      ...(questionHistory ? { questionHistory } : {}),
    },
  };
}

/** Apply the AI service's validated turn delta without replacing patient evidence. */
export function applyIntakeTurn(state: IntakeState, result: Pick<NextTurnResult, "fieldUpdates" | "askedQuestion" | "askedQuestionId" | "guidanceProvided">): IntakeState {
  if (state.completion === "emergency_interrupted" || state.safety?.routed) return state;
  const fields = new Map(state.fields.map((field) => [field.fieldId, field]));
  for (const field of result.fieldUpdates) fields.set(field.fieldId, field);
  const questionId = result.askedQuestion ? result.askedQuestionId ?? "completion_check" : null;
  const alreadyLogged = questionId !== null && (state.questionHistory ?? []).some((entry) => entry.questionId === questionId && entry.status === "asked");
  const questionHistory = questionId === null || alreadyLogged ? state.questionHistory : [...(state.questionHistory ?? []), {
    questionId,
    targetField: QUESTION_BANK.find((item) => item.id === questionId)?.targetField ?? questionId,
    status: "asked" as const,
    sourceResponseIds: [],
  }];
  const { activeQuestionId: _previousActiveQuestionId, ...stateWithoutActiveQuestion } = state;
  return {
    ...stateWithoutActiveQuestion,
    fields: [...fields.values()],
    ...(questionId ? { activeQuestionId: questionId } : {}),
    questionHistory,
    completion: result.askedQuestion ? "in_progress" : "ready_for_review",
    ...(result.guidanceProvided ? { guidanceProvided: [...(state.guidanceProvided ?? []), result.guidanceProvided] } : {}),
    questionsAsked: result.askedQuestion && !state.questionsAsked.some((question) => normalize(question) === normalize(result.askedQuestion!))
      ? [...state.questionsAsked, result.askedQuestion]
      : state.questionsAsked,
  };
}

function markQuestionAnswered(
  history: QuestionHistoryEntry[],
  questionId: string,
  responseId: string,
  updates: IntakeField[],
  responseText: string,
): QuestionHistoryEntry[] {
  const target = questionId === "main_concern" ? "primary_concern"
    : QUESTION_BANK.find((question) => question.id === questionId)?.targetField
      ?? (questionId.startsWith("symptom_onset__") ? "symptom_onset" : questionId);
  const fact = updates.find((field) => field.fieldId === target
    || (target === "symptom_onset" && (field.fieldId === "onset" || field.fieldId.startsWith("symptom_onset_"))));
  const status: QuestionHistoryEntry["status"] = fact?.status === "declined" || /^\s*(?:skip|prefer not to say|i(?:'d| would) rather not|i (?:do not|don't) want to answer)\b/i.test(responseText) ? "declined"
    : fact?.status === "unclear" ? "requires_clarification"
      : fact?.status === "unknown" || fact?.status === "patient_denied" || fact?.status === "reported" || fact?.status === "patient_corrected" ? "answered"
        : history.at(-1)?.questionId === questionId && ["requires_clarification", "partially_answered"].includes(history.at(-1)?.status ?? "") ? "answered"
          : responseText.trim().length < 3 ? "partially_answered" : "requires_clarification";
  const next = [...history];
  const index = next.map((entry) => entry.questionId).lastIndexOf(questionId);
  const entry: QuestionHistoryEntry = { questionId, targetField: target, status, sourceResponseIds: [responseId] };
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return next;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function recordPatientCorrection(state: IntakeState, text: string): IntakeState {
  const activeQuestionId = state.activeQuestionId;
  const timelineCorrection = /\b(started|began|onset|yesterday|today|last night|this morning|when i woke up|\d+\s*(?:mins?|minutes?|hours?)\s+ago)\b/i.test(text);
  const activeTarget = activeQuestionId?.startsWith("symptom_onset__") ? "onset"
    : QUESTION_BANK.find((item) => item.id === activeQuestionId)?.targetField;
  let targetField = activeTarget ?? null;
  if (!targetField) {
    if (timelineCorrection && /\b(headache|head pain|migraine)\b/i.test(text)) targetField = "symptom_onset_headache";
    else if (timelineCorrection && /\b(vision|sight|blurry|blurred)\b/i.test(text)) targetField = "symptom_onset_visual_changes";
    else if (timelineCorrection && /\b(eye soreness|sore eyes?)\b/i.test(text)) targetField = "symptom_onset_eye_soreness";
    else if (/\b(one eye|left eye|right eye|both eyes|both of my eyes)\b/i.test(text)) targetField = "affected_eyes";
    else if (/\b(started|began|onset|yesterday|today|last night|this morning)\b/i.test(text)) targetField = "onset";
    else if (/\b(worse|worsening|better|improving|same|unchanged)\b/i.test(text)) targetField = "progression";
    else if (/\b(blurry|blurred|vision|sight|eye)\b/i.test(text)) targetField = /\b(vision|sight|blurry|blurred)\b/i.test(text) ? "visual_changes" : "eye_soreness";
    else if (/\b(activity|activities|read|walk|work|daily)\b/i.test(text)) targetField = "daily_impact";
    else if (/\btemperature|degrees?\s*[cf]|\d{2}\.\d\b/i.test(text)) targetField = "temperature_measurement";
  }
  const sourceResponseId = (targetField ? state.fields.find((field) => field.fieldId === targetField)?.sourceResponseIds.at(-1) : undefined)
    ?? state.responses[0]?.id;
  const responseId = `response-${state.responses.length + 1}`;
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    ...(state.questionsAsked.at(-1) ? { questionId: state.questionsAsked.at(-1)! } : {}),
    ...(activeQuestionId ? { questionBankId: activeQuestionId }
      : targetField?.startsWith("symptom_onset_") ? { questionBankId: `symptom_onset__${targetField.slice("symptom_onset_".length)}` } : {}),
    ...(sourceResponseId ? { correctsResponseId: sourceResponseId } : {}),
    createdAt: new Date().toISOString(),
  };
  const extracted = extractPatientFacts(response, response.questionId ?? "", response.questionBankId);
  let fields = mergeFieldUpdates(state.fields, extracted);
  const existingAnsweredFields = fieldsForQuestion(state, activeQuestionId);
  if (!extracted.length && existingAnsweredFields.length) {
    const correctionSource = existingAnsweredFields.flatMap((field) => field.sourceResponseIds);
    const correctionResponseId = correctionSource.at(-1);
    if (correctionResponseId) response.correctsResponseId = correctionResponseId;
  } else if (!fields.some((field) => field.sourceResponseIds.includes(responseId))) {
    fields = mergeFieldUpdates(fields, [{ fieldId: "correction_note", value: null, status: "unclear", sourceResponseIds: [responseId] }]);
  }
  const questionHistory = response.questionBankId && !extracted.length && existingAnsweredFields.length
    ? markExistingQuestionAnswered(state.questionHistory ?? [], response.questionBankId, existingAnsweredFields)
    : response.questionBankId
      ? markQuestionAnswered(state.questionHistory ?? [], response.questionBankId, responseId, extracted, text)
    : state.questionHistory;
  return { ...state, currentIntent: "correction", responses: [...state.responses, response], fields, ...(questionHistory ? { questionHistory } : {}) };
}

function fieldsForQuestion(state: IntakeState, questionId: string | undefined): IntakeField[] {
  if (!questionId) return [];
  if (questionId.startsWith("symptom_onset__")) {
    const symptomIds = questionId.slice("symptom_onset__".length).split(",").filter(Boolean);
    return state.fields.filter((field) => fieldIsSufficient(field) && (field.fieldId === "onset" || symptomIds.some((id) => field.fieldId === `symptom_onset_${id}`)));
  }
  const target = QUESTION_BANK.find((question) => question.id === questionId)?.targetField;
  return target ? state.fields.filter((field) => field.fieldId === target && fieldIsSufficient(field)) : [];
}

function fieldIsSufficient(field: IntakeField): boolean {
  return ["reported", "patient_denied", "patient_corrected", "declined", "unknown", "not_answered", "not_asked"].includes(field.status);
}

function markExistingQuestionAnswered(history: QuestionHistoryEntry[], questionId: string, fields: IntakeField[]): QuestionHistoryEntry[] {
  const next = [...history];
  const index = next.map((entry) => entry.questionId).lastIndexOf(questionId);
  const entry: QuestionHistoryEntry = {
    questionId,
    targetField: QUESTION_BANK.find((question) => question.id === questionId)?.targetField ?? "symptom_onset",
    status: "answered",
    sourceResponseIds: [...new Set(fields.flatMap((field) => field.sourceResponseIds))],
  };
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return next;
}

export function confirmPatientBrief(state: IntakeState): IntakeState {
  if (state.completion === "completed" || state.completion === "emergency_interrupted" || state.safety?.routed) return state;
  return { ...state, completion: "completed", patientConfirmed: true };
}

/** Enter a terminal safety interruption for this intake; routine turns cannot resume it. */
export function interruptIntakeForSafety(state: IntakeState, safety: SafetyEvent): IntakeState {
  if (!safety.routed) return state;
  return { ...state, safety, completion: "emergency_interrupted" };
}
