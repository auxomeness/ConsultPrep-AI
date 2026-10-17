import type { IntakeField, IntakeState, NextTurnResult, QuestionHistoryEntry } from "./contracts.js";
import { extractPatientFacts, mergeFieldUpdates } from "./intake-facts.js";
import { QUESTION_BANK } from "./question-bank.js";
import { classifyConversationIntent } from "./conversation.js";

/** Add one patient answer and locally extracted facts to an intake state. */
export function recordPatientAnswer(state: IntakeState, text: string): { state: IntakeState; responseId: string } {
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
  const fact = updates.find((field) => field.fieldId === target || (target === "symptom_onset" && field.fieldId.startsWith("symptom_onset_")));
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
