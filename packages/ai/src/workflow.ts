import type { IntakeField, IntakeState, NextTurnResult, QuestionHistoryEntry, SafetyEvent } from "./contracts.js";
import { extractPatientFacts, mergeFieldUpdates, restorePatientFacts } from "./intake-facts.js";
import { QUESTION_BANK } from "./question-bank.js";
import { classifyConversationIntent, communicationPreferencesFromText, isBareMisattributionCorrection, isNoAdditionalInformation } from "./conversation.js";

/** Add one patient answer and locally extracted facts to an intake state. */
export function recordPatientAnswer(state: IntakeState, text: string): { state: IntakeState; responseId: string } {
  if (state.completion === "emergency_interrupted" || state.safety?.routed) {
    return { state, responseId: state.responses.at(-1)?.id ?? "emergency-interrupted" };
  }
  state = { ...state, fields: restorePatientFacts(state) };
  const latestQuestion = state.questionsAsked.at(-1) ?? "";
  const activeQuestionIds = state.activeQuestionIds?.length
    ? state.activeQuestionIds
    : state.activeQuestionId ? [state.activeQuestionId] : [];
  const activeQuestionId = activeQuestionIds[0];
  const ambiguousYesNoToDescription = activeQuestionId === "main_concern"
    && /^\s*(?:yes|yeah|no|nope)[.!\s]*$/i.test(text)
    && /(?:how would you describe|describe (?:the )?(?:concern|what)|in your own words)/i.test(latestQuestion);
  const intent = ambiguousYesNoToDescription
    ? "clarification_request"
    : classifyConversationIntent({ text, isFirstPatientTurn: state.responses.length === 0 });
  if (intent === "correction" && isBareMisattributionCorrection(text)) {
    const responseId = `response-${state.responses.length + 1}`;
    return {
      responseId,
      state: {
        ...state,
        currentIntent: "correction",
        responses: [...state.responses, {
          id: responseId,
          text,
          sequence: state.responses.length,
          createdAt: new Date().toISOString(),
        }],
      },
    };
  }
  if (intent === "correction") {
    const responseId = `response-${state.responses.length + 1}`;
    return { state: recordPatientCorrection(state, text), responseId };
  }
  const responseId = `response-${state.responses.length + 1}`;
  if (intent === "repetition_complaint") {
    return { state: recordRepetitionComplaint(state, text, responseId), responseId };
  }
  const sideConversationIntent = ["guidance_request", "personal_concern", "workflow_question", "care_service_request", "frightened_about_dying"].includes(intent);
  // Direct questions and worries are side turns. Still extract any symptoms
  // the patient volunteers, but never interpret the question itself as the
  // answer to whichever intake field happened to be active.
  const activeQuestion = sideConversationIntent ? "" : latestQuestion;
  const extractionQuestionIds = sideConversationIntent ? [] : activeQuestionIds;
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    createdAt: new Date().toISOString(),
  };
  // Uncertainty is still an answer to the active question. Let the fact
  // extractor record it as unknown/declined so the planner can move on.
  const nonClinicalOpening = ["recall_request", "summary", "workflow_question", "clarification_request", "repetition_complaint", "off_topic", "greeting", "identity_question", "vague_opening", "ambiguous_opening"].includes(intent)
    || intent === "unclear" && !activeQuestionId;
  const preferenceUpdate = communicationPreferencesFromText(text);
  let updates = nonClinicalOpening ? [] : mergeFieldUpdates([], extractionQuestionIds.length > 1
    ? extractionQuestionIds.flatMap((questionId) => extractPatientFacts(
      response,
      QUESTION_BANK.find((question) => question.id === questionId)?.question ?? activeQuestion,
      questionId,
    ))
    : extractPatientFacts(response, activeQuestion, extractionQuestionIds[0]));
  if (intent === "format_preference") updates = updates.filter((field) => field.fieldId !== "primary_concern");
  const explicitlyAsksAboutSymptoms = /what have you been feeling|what symptoms are you experiencing|what brings you in|any symptoms/i.test(activeQuestion);
  if (activeQuestionId === "main_concern" && explicitlyAsksAboutSymptoms && isNoAdditionalInformation(text)) {
    updates = mergeFieldUpdates(updates, [{ fieldId: "current_symptoms", value: "No symptoms reported", status: "patient_denied", sourceResponseIds: [responseId] }]);
  }
  const activeQuestionDefinitions = activeQuestionIds.map((questionId) => QUESTION_BANK.find((question) => question.id === questionId)).filter(Boolean);
  const denialTargets = new Set(activeQuestionDefinitions.map((question) => question!.targetField)
    .filter((fieldId) => fieldId === "additional_symptoms" || fieldId === "headache_associated_changes"));
  if (!denialTargets.size && /(?:other|additional|any) symptoms|(?:other|any) changes|anything else.*(?:feel|notice|symptom)/i.test(latestQuestion)) {
    denialTargets.add(/headache/i.test(latestQuestion) ? "headache_associated_changes" : "additional_symptoms");
  }
  if (denialTargets.size && isLeadingNoAdditionalSymptomsAnswer(text)) {
    updates = mergeFieldUpdates(updates, [...denialTargets].map((fieldId) => ({
      fieldId,
      value: fieldId === "headache_associated_changes" ? "No other changes reported; headache remains" : "No additional symptoms reported",
      status: "patient_denied" as const,
      sourceResponseIds: [responseId],
    })));
  }
  const fields = mergeFieldUpdates(state.fields, updates);
  const answerFields = fields.filter((field) => field.sourceResponseIds.includes(responseId));
  const answeredQuestionIds = activeQuestionIds.filter((questionId) => activeQuestionAnswered(questionId, updates, text));
  const deferActiveQuestion = ["recall_request", "summary", "format_preference", "off_topic", "greeting", "identity_question", "vague_opening", "ambiguous_opening", "guidance_request", "personal_concern", "workflow_question", "care_service_request", "frightened_about_dying"].includes(intent);
  const questionHistory = activeQuestionIds.length && (!nonClinicalOpening || intent === "clarification_request")
    ? activeQuestionIds.reduce((history, questionId) => answeredQuestionIds.includes(questionId) || intent === "clarification_request"
      ? markQuestionAnswered(history, questionId, responseId, answerFields, text)
      : deferActiveQuestion ? history : markQuestionAnswered(history, questionId, responseId, answerFields, text), state.questionHistory ?? [])
    : state.questionHistory;
  const linkedResponse = answeredQuestionIds.length
    ? { ...response, ...(activeQuestion ? { questionId: activeQuestion } : {}), questionBankId: answeredQuestionIds[0], questionBankIds: answeredQuestionIds }
    : response;
  const communicationPreferences = preferenceUpdate
    ? { ...(state.communicationPreferences ?? {}), ...preferenceUpdate }
    : state.communicationPreferences;
  return {
    responseId,
    state: {
      ...state,
      currentIntent: intent,
      concern: state.concern || (nonClinicalOpening || ["finish", "workflow_question", "summary", "decline", "unclear"].includes(intent)
        || updates.every((field) => field.fieldId === "patient_question") ? "" : text),
      responses: [...state.responses, linkedResponse],
      fields,
      ...(communicationPreferences ? { communicationPreferences } : {}),
      ...(questionHistory ? { questionHistory } : {}),
    },
  };
}

/** Preserve a clear "none" answer when the same turn also asks for help. */
function isLeadingNoAdditionalSymptomsAnswer(text: string): boolean {
  return /^\s*(?:none|nothing(?:\s+else)?|nope)(?:\b|[,;.!?—-])/i.test(text);
}

/** Apply the AI service's validated turn delta without replacing patient evidence. */
export function applyIntakeTurn(state: IntakeState, result: Pick<NextTurnResult, "fieldUpdates"> & Partial<Pick<NextTurnResult, "assistantMessage" | "askedQuestion" | "askedQuestionId" | "askedQuestionIds" | "guidanceProvided">>): IntakeState {
  if (state.completion === "emergency_interrupted" || state.safety?.routed) return state;
  const fields = new Map(state.fields.map((field) => [field.fieldId, field]));
  for (const field of result.fieldUpdates) fields.set(field.fieldId, field);
  const questionIds = result.askedQuestion
    ? result.askedQuestionIds?.length ? result.askedQuestionIds : [result.askedQuestionId ?? "completion_check"]
    : [];
  const questionHistory = questionIds.length ? questionIds.reduce((history, questionId) => {
    const alreadyLogged = history.some((entry) => entry.questionId === questionId && entry.status === "asked");
    return alreadyLogged ? history : [...history, {
      questionId,
      targetField: questionId === "main_concern" ? "primary_concern"
        : QUESTION_BANK.find((item) => item.id === questionId)?.targetField ?? (questionId.startsWith("symptom_onset__") ? "symptom_onset" : questionId),
      status: "asked" as const,
      sourceResponseIds: [],
    }];
  }, state.questionHistory ?? []) : state.questionHistory;
  const { activeQuestionId: _previousActiveQuestionId, activeQuestionIds: _previousActiveQuestionIds, ...stateWithoutActiveQuestion } = state;
  return {
    ...stateWithoutActiveQuestion,
    fields: [...fields.values()],
    ...(questionIds.length ? { activeQuestionId: questionIds[0], activeQuestionIds: questionIds } : state.currentIntent === "repetition_complaint" ? {} : state.activeQuestionId ? { activeQuestionId: state.activeQuestionId, ...(state.activeQuestionIds ? { activeQuestionIds: state.activeQuestionIds } : {}) } : {}),
    questionHistory,
    ...(result.assistantMessage ? { recentAssistantMessages: [...(state.recentAssistantMessages ?? []), result.assistantMessage].slice(-8) } : {}),
    completion: ["recall_request", "format_preference", "clarification_request", "correction", "off_topic", "greeting", "identity_question", "vague_opening", "ambiguous_opening", "guidance_request", "personal_concern", "workflow_question", "care_service_request", "frightened_about_dying"].includes(state.currentIntent ?? "")
      ? state.completion
      : result.askedQuestion ? "in_progress" : "ready_for_review",
    ...(result.guidanceProvided ? { guidanceProvided: [...(state.guidanceProvided ?? []), result.guidanceProvided] } : {}),
    questionsAsked: result.askedQuestion && !state.questionsAsked.some((question) => normalize(question) === normalize(result.askedQuestion!))
      ? [...state.questionsAsked, result.askedQuestion]
      : state.questionsAsked,
  };
}

/** Keep a repetition complaint without treating it as new clinical evidence. */
function recordRepetitionComplaint(state: IntakeState, text: string, responseId: string): IntakeState {
  const questionIds = state.activeQuestionIds?.length
    ? state.activeQuestionIds
    : state.activeQuestionId ? [state.activeQuestionId] : [];
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    ...(state.questionsAsked.at(-1) ? { questionId: state.questionsAsked.at(-1)! } : {}),
    ...(questionIds[0] ? { questionBankId: questionIds[0] } : {}),
    ...(questionIds.length > 1 ? { questionBankIds: questionIds } : {}),
    createdAt: new Date().toISOString(),
  };
  const questionHistory = questionIds.reduce((history, questionId) => {
    const question = QUESTION_BANK.find((item) => item.id === questionId);
    const targetField = questionId === "main_concern" ? "primary_concern"
      : question?.targetField ?? (questionId.startsWith("symptom_onset__") ? "symptom_onset" : questionId);
    const targetFields = questionId.startsWith("symptom_onset__")
      ? ["onset", ...questionId.slice("symptom_onset__".length).split(",").map((id) => `symptom_onset_${id}`)]
      : questionId === "main_concern" ? ["primary_concern", "current_symptoms"] : [targetField];
    const knownFacts = state.fields.filter((field) => targetFields.includes(field.fieldId)
      && ["reported", "patient_corrected", "patient_denied", "declined", "unknown", "not_answered"].includes(field.status));
    const entry: QuestionHistoryEntry = {
      questionId,
      targetField,
      status: knownFacts.length ? "answered" : "skipped",
      sourceResponseIds: knownFacts.length
        ? [...new Set(knownFacts.flatMap((field) => field.sourceResponseIds))]
        : [responseId],
    };
    const next = [...history];
    const index = next.map((item) => item.questionId).lastIndexOf(questionId);
    if (index >= 0) next[index] = entry;
    else next.push(entry);
    return next;
  }, state.questionHistory ?? []);
  return {
    ...state,
    currentIntent: "repetition_complaint",
    responses: [...state.responses, response],
    questionHistory,
  };
}

function activeQuestionAnswered(questionId: string, updates: IntakeField[], text: string): boolean {
  const target = questionId === "main_concern" ? "primary_concern"
    : QUESTION_BANK.find((question) => question.id === questionId)?.targetField
      ?? (questionId.startsWith("symptom_onset__") ? "symptom_onset" : questionId);
  if (updates.some((field) => field.fieldId === target
    || questionId === "main_concern" && field.fieldId === "current_symptoms"
    || target === "symptom_onset" && (field.fieldId === "onset" || field.fieldId.startsWith("symptom_onset_")))) return true;
  return /^(?:skip|i'?m not sure|i am not sure|not sure|idk|i don't know|i do not know|rather not|prefer not)[.!\s]*$/i.test(text.trim());
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
    || questionId === "main_concern" && field.fieldId === "current_symptoms"
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
  const headacheCharacter = /\b(?:crushing|squeezing|throbbing|pounding|pressure|sharp|dull|aching|burning|tingling|stabbing|numb|pins and needles)\b/i.test(text);
  const headacheLocation = /\b(?:front|forehead|frontal|back|left|right|both sides|one side|all over|temples?|behind (?:my |the )?eyes|toward(?:s)? (?:my |the )?eyes?|stays?|moves?|shifts?)\b/i.test(text);
  // “I already said it was crushing” is a correction to the headache's
  // character even if the current prompt happened to ask about location.
  const correctionTarget = activeTarget?.startsWith("headache") && headacheCharacter && !headacheLocation
    ? "headache_character"
    : activeTarget?.startsWith("headache") && headacheLocation && !headacheCharacter
      ? "headache_location"
      : null;
  let targetField = correctionTarget ?? activeTarget ?? null;
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
  const extractionQuestionId = correctionTarget === "headache_character" ? "headache_character"
    : correctionTarget === "headache_location" ? "headache_location"
      : activeQuestionId;
  const responseId = `response-${state.responses.length + 1}`;
  const response = {
    id: responseId,
    text,
    sequence: state.responses.length,
    ...(state.questionsAsked.at(-1) ? { questionId: state.questionsAsked.at(-1)! } : {}),
    ...(extractionQuestionId ? { questionBankId: extractionQuestionId }
      : targetField?.startsWith("symptom_onset_") ? { questionBankId: `symptom_onset__${targetField.slice("symptom_onset_".length)}` } : {}),
    ...(sourceResponseId ? { correctsResponseId: sourceResponseId } : {}),
    createdAt: new Date().toISOString(),
  };
  const extracted = extractPatientFacts(response, response.questionId ?? "", extractionQuestionId);
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
