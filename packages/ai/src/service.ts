import { recallConversation } from "./conversation-memory.js";
import {
  ContinueIntakeInputSchema,
  AnswerQuestionInputSchema,
  GenerateBriefInputSchema,
  NextTurnResultSchema,
  QuestionAnswerResultSchema,
  StartIntakeResultSchema,
  type IntakeField,
  type IntakeState,
  type NextTurnResult,
  type StartIntakeResult,
  type StructuredConsultationBrief,
  validateIntakeState,
} from "./contracts.js";
import { AiServiceError } from "./errors.js";
import type { ChatCompleter, ChatMessage } from "./amd-client.js";
import type { InMemoryRetriever, RetrievedChunk } from "./rag.js";
import { assessSafety, DEFAULT_EMERGENCY_CONTACT, type EmergencyContactConfig } from "./safety.js";
import { CONTINUE_OUTPUT_INSTRUCTIONS, QUESTION_ANSWER_INSTRUCTIONS, SYSTEM_INSTRUCTIONS } from "./prompts.js";
import { classifyQuestionScope, isContextualFollowUp, isPersonalizedDiagnosisOrTreatmentRequest, OUT_OF_SCOPE_ANSWER, PERSONALIZED_MEDICAL_ANSWER } from "./scope.js";
import { urgentGuidanceForText } from "./safety.js";
import { extractPatientFacts, extractReportedTemperature, factIsSufficient, mergeFieldUpdates, targetForQuestion } from "./intake-facts.js";
import { detectSymptomCategories, getSymptomLabel, isQuestionApplicable, isSymptomReportField, QUESTION_BANK, questionIsRelevant, reportedSymptomFieldIds, type QuestionDefinition } from "./question-bank.js";
import { buildStructuredBrief } from "./brief.js";
import { assessIntakeCompleteness } from "./completeness.js";
import { classifyConversationIntent, isBareMisattributionCorrection, type ConversationIntent } from "./conversation.js";
import { assessPromptAssessmentNeed } from "./safety.js";
import { interruptIntakeForSafety } from "./workflow.js";

export interface AiService {
  startIntake(): StartIntakeResult;
  continueIntake(input: unknown, signal?: AbortSignal): Promise<NextTurnResult | { safety: ReturnType<typeof assessSafety>; state: IntakeState }>;
  generateBrief(input: unknown): Promise<StructuredConsultationBrief>;
  answerQuestion(input: unknown): Promise<{ scope: "medical" | "system" | "out_of_scope"; answer: string }>;
}

export const COMPLETENESS_QUESTION = "Is that everything you’re feeling today, or would you like to add anything else?";

export interface PlannedQuestion {
  questionId: string;
  category: QuestionDefinition["category"];
  targetField: string;
  targetConcept: string;
  questionPurpose: string;
  priority: number;
  status: "needed" | "clarification_needed";
  question: string;
  safetyRelevant: boolean;
  required: boolean;
  answerType: QuestionDefinition["answerType"];
}

// Keep the interview focused: symptom onset, a key detail, associated symptoms,
// a relevant measurement, and daily impact are usually enough for a first pass.
export const MAX_ROUTINE_FOLLOW_UPS = 6;

export function deduplicateQuestionCandidates<T extends Pick<PlannedQuestion, "targetConcept" | "priority">>(candidates: Array<T | null>): T[] {
  const seenConcepts = new Set<string>();
  return candidates.filter((candidate): candidate is T => candidate !== null).sort((a, b) => a.priority - b.priority).filter((candidate) => {
    if (seenConcepts.has(candidate.targetConcept)) return false;
    seenConcepts.add(candidate.targetConcept);
    return true;
  });
}

/**
 * Keep the intake from wrapping up before it has covered a small, useful history.
 * This is deliberately a short checklist, not a clinical triage protocol.
 */
export function nextRequiredInterviewQuestion(state: IntakeState): string | null {
  return planNextQuestion(state)?.question ?? null;
}

export function planNextQuestions(state: IntakeState): PlannedQuestion[] {
  const first = planNextQuestion(state);
  if (!first) return [];
  const preferences = state.communicationPreferences;
  const grouped = preferences?.questionPacing === "grouped" || preferences?.questionFormat === "bullets";
  if (!grouped || first.status === "clarification_needed") return [first];
  const related = getUnansweredQuestionDefinitions(state)
    .filter((candidate) => candidate.id !== first.questionId && candidate.answerType !== "yes_no_detail")
    .filter((candidate) => candidate.category === first.category || candidate.category === "universal" || first.category === "universal")
    .filter((candidate) => !(state.questionHistory ?? []).some((entry) => entry.questionId === candidate.id && ["answered", "skipped", "declined"].includes(entry.status)))
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 2)
    .map((candidate) => toPlannedQuestion(candidate, "needed", candidate.question));
  return [first, ...related];
}

function formatPlannedQuestionGroup(questions: PlannedQuestion[], state: IntakeState): string | null {
  if (!questions.length) return null;
  const bullets = state.communicationPreferences?.questionFormat === "bullets" || questions.length > 1;
  if (!bullets) return questions[0]!.question;
  const lines = questions.map((question) => `- ${question.question}`);
  return questions.length > 1
    ? `Answer whichever you can; it’s okay to skip anything you’re unsure about.\n\n${lines.join("\n")}`
    : lines[0]!;
}

function redirectOffTopicTurn(state: IntakeState, latestText: string): NextTurnResult {
  const activeQuestionIds = state.activeQuestionIds?.length ? state.activeQuestionIds
    : state.activeQuestionId ? [state.activeQuestionId] : [];
  const activeQuestionId = activeQuestionIds[0] ?? "main_concern";
  const question = activeQuestionId === "main_concern"
    ? "What symptom or health concern would you like help organizing for your doctor?"
    : state.questionsAsked.at(-1) ?? "What symptom or health concern would you like help organizing for your doctor?";
  const prefix = /\bguess\b/i.test(latestText)
    ? "I can’t reliably guess how you’re feeling, so I haven’t added that as a health detail."
    : "That message doesn’t give me enough health information to add to the visit notes.";
  return NextTurnResultSchema.parse({
    assistantMessage: `${prefix} ${question}`,
    askedQuestion: question,
    askedQuestionId: activeQuestionId,
    askedQuestionIds: activeQuestionIds.length ? activeQuestionIds : [activeQuestionId],
    fieldUpdates: [],
  });
}

function clarifyPreviousTurn(state: IntakeState): NextTurnResult {
  const activeQuestionIds = state.activeQuestionIds?.length ? state.activeQuestionIds
    : state.activeQuestionId ? [state.activeQuestionId] : [];
  const activeQuestionId = activeQuestionIds[0] ?? "main_concern";
  const clarificationQuestion = selectedQuestionsForTurn(state, "clarification_request")[0]?.question;
  const previousQuestion = state.questionsAsked.at(-1) ?? "";
  const question = clarificationQuestion?.startsWith("When you say")
    ? clarificationQuestion
    : activeQuestionId === "main_concern"
      ? /how would you describe|in your own words/i.test(previousQuestion)
        ? "What feels wrong or different? You can describe the main symptom or concern in your own words."
        : "What symptom or health concern would you like help organizing for your doctor?"
      : QUESTION_BANK.find((item) => item.id === activeQuestionId)?.question
        ?? previousQuestion
        ?? "What symptom or health concern would you like help organizing for your doctor?";
  const previousReply = state.recentAssistantMessages?.at(-1) ?? "";
  const explanation = /(?:can’t|can't|cannot)\s+(?:tell|determine|assess).{0,100}\b(?:cause|chat)\b/i.test(previousReply)
    ? "I mean I can’t be certain about the cause from chat. A clinician can assess that, and I can help organize what you’re experiencing into notes for the visit."
    : "Sorry, I wasn’t clear. I’ll ask in simpler words so I can make useful notes for your visit.";
  return NextTurnResultSchema.parse({
    assistantMessage: `${explanation} ${question}`,
    askedQuestion: question,
    askedQuestionId: activeQuestionId,
    askedQuestionIds: activeQuestionIds.length ? activeQuestionIds : [activeQuestionId],
    fieldUpdates: [],
  });
}

function selectedQuestionsForTurn(state: IntakeState, intent: ConversationIntent): PlannedQuestion[] {
  const latestAnswer = state.responses.at(-1)?.text ?? "";
  const previousQuestion = state.questionsAsked.at(-1) ?? "";
  if (intent === "clarification_request" && state.activeQuestionId === "main_concern"
    && /^\s*(?:yes|yeah|no|nope)[.!\s]*$/i.test(latestAnswer)
    && /(?:how would you describe|describe (?:the )?(?:concern|what)|in your own words)/i.test(previousQuestion)) {
    return [{
      questionId: "main_concern",
      category: "universal",
      targetField: "primary_concern",
      targetConcept: "primary_concern",
      questionPurpose: "clarify_ambiguous_concern_reply",
      priority: 0,
      status: "clarification_needed",
      question: "When you say “no,” do you mean you’d rather not describe what’s bothering you, or did you mean something else?",
      safetyRelevant: false,
      required: false,
      answerType: "free_text",
    }];
  }
  const planned = planNextQuestions(state);
  if (planned.length) return planned;
  const noConcern = !state.fields.some((field) => field.fieldId === "primary_concern" || isSymptomReportField(field.fieldId));
  if (!noConcern || !["format_preference", "clarification_request", "off_topic", "greeting", "identity_question", "vague_opening", "ambiguous_opening"].includes(intent)) return [];
  return [{
    questionId: "main_concern",
    category: "universal",
    targetField: "primary_concern",
    targetConcept: "primary_concern",
    questionPurpose: "establish_primary_concern",
    priority: 0,
    status: "needed",
    question: "What have you been feeling, or what would you like help preparing to discuss today?",
    safetyRelevant: false,
    required: false,
    answerType: "free_text",
  }];
}

export function planNextQuestion(state: IntakeState): PlannedQuestion | null {
  if (state.completion === "completed" || state.completion === "emergency_interrupted" || state.safety?.routed) return null;
  const completeness = assessIntakeCompleteness(state);
  if (completeness.status === "potentially_urgent") return null;
  if (/^\s*(?:none|nothing|no symptoms|i have no symptoms|i don'?t have any symptoms)[.!\s]*$/i.test(state.responses[0]?.text ?? "")) return null;
  const latestResponse = state.responses.at(-1);
  const openingIntent = latestResponse ? classifyConversationIntent({ text: latestResponse.text, isFirstPatientTurn: state.responses.length === 1 }) : "continue";
  const hasReportedConcern = state.fields.some((field) => field.fieldId === "primary_concern"
    || isSymptomReportField(field.fieldId) && ["reported", "patient_corrected"].includes(field.status));
  if (!hasReportedConcern && ["greeting", "identity_question", "vague_opening", "ambiguous_opening"].includes(openingIntent)) return null;
  const askedCount = (state.questionHistory ?? []).filter((item) => item.questionId !== "main_concern" && item.questionId !== "completion_check"
    && ["asked", "answered", "partially_answered", "skipped", "declined", "requires_clarification"].includes(item.status)).length;
  if (askedCount >= MAX_ROUTINE_FOLLOW_UPS) return null;
  const patientText = [state.concern, ...state.responses.map((response) => response.text), ...state.fields.map((field) => field.value ?? "")].join("\n");
  const categories = detectSymptomCategories(patientText);
  const factsByField = new Map(state.fields.map((field) => [field.fieldId, field]));
  const symptomOnsetCandidates = makeSymptomOnsetCandidates(state, factsByField);
  const relevantLibrary = QUESTION_BANK.filter((candidate) => candidate.id !== "onset"
    && questionIsRelevant(candidate, categories) && isQuestionApplicable(candidate, state));
  const candidates = deduplicateQuestionCandidates([...symptomOnsetCandidates, ...relevantLibrary].map((candidate) => {
    const onsetSymptomIds = candidate.targetField === "symptom_onset" ? candidate.id.slice("symptom_onset__".length).split(",").filter(Boolean) : [];
    const field = factsByField.get(candidate.targetField);
    const unclearOnsetIds = onsetSymptomIds.filter((symptomId) => {
      const onsetField = factsByField.get(`symptom_onset_${symptomId}`);
      return onsetField && ["unclear", "conflicting"].includes(onsetField.status);
    });
    const needsOnsetClarification = unclearOnsetIds.length > 0;
    const prior = (state.questionHistory ?? []).filter((item) => item.questionId === candidate.id).at(-1);
    if (candidate.id === "general_weakness_type" && prior && ["requires_clarification", "partially_answered"].includes(prior.status)) return null;
    if (factIsSufficient(field) && !needsOnsetClarification) return null;
    if (needsOnsetClarification) {
      const labels = unclearOnsetIds.map((id) => getSymptomLabel(id) ?? id.replace(/_/g, " "));
      const labelList = labels.length === 1 ? labels[0]! : labels.join(" and ");
      const clarification = `I have different or unclear timing details for ${labelList}. When did it begin?`;
      if (state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(clarification))) return null;
      return toPlannedQuestion(candidate, "clarification_needed", clarification);
    }
    if (field && ["unclear", "conflicting"].includes(field.status)) {
      const clarification = clarificationFor(candidate, state, field.value);
      if (state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(clarification))) return null;
      return toPlannedQuestion(candidate, "clarification_needed", clarification);
    }
    if (prior && ["answered", "skipped", "declined"].includes(prior.status) && !needsOnsetClarification) return null;
    if (prior?.status === "requires_clarification" || prior?.status === "partially_answered") {
      const clarification = clarificationFor(candidate, state, field?.value);
      if (state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(clarification))) return null;
      return toPlannedQuestion(candidate, "clarification_needed", clarification);
    }
    if (hasAnsweredQuestionTarget(state, candidate) && !needsOnsetClarification) return null;
    const alreadyAsked = state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(candidate.question));
    if (alreadyAsked) return null;
    return toPlannedQuestion(candidate, "needed", candidate.question);
  }).filter((candidate): candidate is PlannedQuestion => candidate !== null));
  const requiredQuestionIds = new Set([...completeness.openRequiredQuestionIds, ...completeness.clarificationQuestionIds]);
  const questionMatchesRequiredCriterion = (questionId: string) => requiredQuestionIds.has(questionId)
    || questionId.startsWith("symptom_onset__") && completeness.openRequiredQuestionIds.some((id) => id.startsWith("symptom_onset__") && questionId.includes(id.slice("symptom_onset__".length)));
  candidates.sort((left, right) => Number(questionMatchesRequiredCriterion(right.questionId)) - Number(questionMatchesRequiredCriterion(left.questionId)) || left.priority - right.priority);
  return candidates[0] ?? null;
}

function clarificationFor(candidate: QuestionDefinition, state: IntakeState, fieldValue?: string | null): string {
  if (candidate.id === "headache_location") {
    const evidence = [fieldValue, ...state.responses.map((response) => response.text)].filter(Boolean).join("\n");
    const hasLocation = /\b(?:front|forehead|frontal|back|left|right|both sides|one side|all over|temples?|behind (?:my |the )?eyes|toward(?:s)? (?:my |the )?eyes?)\b/i.test(evidence);
    const hasMovement = /\b(?:stays?|staying|does not move|doesn'?t move|moves?|moving|shifts?)\b/i.test(evidence);
    if (hasMovement && !hasLocation) return "Where do you feel the headache?";
    if (hasLocation && !hasMovement) return "Does it stay in one place or move?";
    if (hasLocation && hasMovement) return "I heard different details about where it is and whether it moves. Could you clarify what you meant?";
    return "Where do you feel the headache, and does it stay in one place or move?";
  }
  return candidate.followUpQuestion ?? `Could you clarify what you mean about ${candidate.targetField.replace(/_/g, " ")}?`;
}

export function getUnansweredQuestionDefinitions(state: IntakeState): QuestionDefinition[] {
  if (state.completion === "completed") return [];
  const facts = new Map(state.fields.map((field) => [field.fieldId, field]));
  const categories = detectSymptomCategories([state.concern, ...state.responses.map((response) => response.text)].join("\n"));
  const candidates = [...makeSymptomOnsetCandidates(state, facts), ...QUESTION_BANK.filter((question) => question.id !== "onset"
    && questionIsRelevant(question, categories) && isQuestionApplicable(question, state))];
  return deduplicateQuestionCandidates(candidates.map((question) => {
    const prior = (state.questionHistory ?? []).filter((item) => item.questionId === question.id).at(-1);
    return factIsSufficient(facts.get(question.targetField)) || prior && ["answered", "skipped", "declined", "partially_answered"].includes(prior.status)
      ? null
      : toPlannedQuestion(question, "needed", question.question);
  }).filter((question): question is PlannedQuestion => question !== null)).map((planned) => candidates.find((question) => question.id === planned.questionId)!).slice(0, 6);
}

function hasAnsweredQuestionTarget(state: IntakeState, candidate: QuestionDefinition): boolean {
  const previousQuestion = (state.questionHistory ?? []).some((item) => item.questionId === candidate.id && ["answered", "skipped", "declined"].includes(item.status));
  if (previousQuestion) return true;
  // The universal associated-symptoms prompt already covers this narrower check.
  if (candidate.id === "headache_associated" && hasAnsweredCategory(state, "additional_symptoms")) return true;
    if (["onset", "additional_symptoms", "progression", "daily_impact"].includes(candidate.targetField)) {
    return hasAnsweredCategory(state, candidate.targetField as InterviewCategory);
  }
  return state.responses.some((response) => response.questionBankId === candidate.id || response.questionBankIds?.includes(candidate.id));
}

function makeSymptomOnsetCandidates(state: IntakeState, facts: Map<string, IntakeField>): QuestionDefinition[] {
  const previouslyAskedSymptomIds = new Set<string>();
  const attemptedIds = [
    ...(state.questionHistory ?? []).map((entry) => entry.questionId),
    ...state.responses.flatMap((response) => response.questionBankIds ?? (response.questionBankId ? [response.questionBankId] : [])),
  ];
  for (const attemptedId of attemptedIds) {
    if (!attemptedId.startsWith("symptom_onset__")) continue;
    attemptedId.slice("symptom_onset__".length).split(",").filter(Boolean).forEach((id) => previouslyAskedSymptomIds.add(id));
  }
  const missingSymptomIds = reportedSymptomFieldIds(state).filter((symptomId) => {
    const onset = facts.get(`symptom_onset_${symptomId}`);
    const needsClarification = onset && ["unclear", "conflicting"].includes(onset.status);
    const priorNeedsClarification = (state.questionHistory ?? []).some((entry) => entry.questionId.startsWith("symptom_onset__")
      && entry.questionId.slice("symptom_onset__".length).split(",").includes(symptomId)
      && ["requires_clarification", "partially_answered"].includes(entry.status));
    if (previouslyAskedSymptomIds.has(symptomId) && !needsClarification && !priorNeedsClarification) return false;
    if (needsClarification) return true;
    if (factIsSufficient(onset)) return false;
    const derivedFromEarlierResponse = state.responses.some((response) => extractPatientFacts(response, response.questionId ?? "", response.questionBankId)
      .some((field) => field.fieldId === `symptom_onset_${symptomId}` && factIsSufficient(field)));
    return !derivedFromEarlierResponse;
  });
  if (!missingSymptomIds.length) return [];
  const questionId = `symptom_onset__${missingSymptomIds.join(",")}`;
  const labels = missingSymptomIds.map((id) => getSymptomLabel(id) ?? id.replace(/_/g, " "));
  const question = missingSymptomIds.length === 1 && missingSymptomIds[0] === "fever"
    ? "When did you first start feeling hot or feverish?"
    : missingSymptomIds.length > 1
      ? "When did each of these symptoms begin? If they began at different times, you can tell me separately."
      : `When did the ${labels[0]} begin?`;
  const followUpQuestion = missingSymptomIds.length === 1 && missingSymptomIds[0] === "fever"
    ? "I didn’t catch the timing. When did you first start feeling hot or feverish?"
    : `I didn’t catch when ${labels.length === 1 ? `the ${labels[0]}` : "each of these symptoms"} began. Could you tell me, or say if you’re not sure?`;
  return [{
    id: questionId,
    category: "universal",
    targetField: "symptom_onset",
    targetConcept: `symptom_onset:${missingSymptomIds.join(",")}`,
    purpose: "establish_symptom_specific_timeline",
    priority: 10,
    safetyRelevant: false,
    required: false,
    answerType: "time_period",
    question,
    followUpQuestion,
    relevanceTerms: labels,
    sufficiency: "recognized_fact",
    clinicalReview: "prototype_wording_requires_clinician_review",
  }];
}

function toPlannedQuestion(candidate: QuestionDefinition, status: PlannedQuestion["status"], question: string): PlannedQuestion {
  return {
    questionId: candidate.id,
    category: candidate.category,
    targetField: candidate.targetField,
    targetConcept: candidate.targetConcept,
    questionPurpose: status === "clarification_needed" ? (candidate.targetField === "daily_impact" ? "clarify_impact" : `clarify_${candidate.purpose}`) : candidate.purpose,
    priority: candidate.priority,
    status,
    question,
    safetyRelevant: candidate.safetyRelevant,
    required: candidate.required,
    answerType: candidate.answerType,
  };
}

type InterviewCategory = "onset" | "additional_symptoms" | "progression" | "daily_impact";

function categoryOfQuestion(question: string): InterviewCategory | null {
  const target = targetForQuestion(question);
  return ["onset", "additional_symptoms", "progression", "daily_impact"].includes(target) ? target as InterviewCategory : null;
}

function categoryOfQuestionId(questionId: string): InterviewCategory | null {
  if (questionId.startsWith("symptom_onset__")) return "onset";
  const question = QUESTION_BANK.find((item) => item.id === questionId);
  return question ? categoryOfQuestion(question.question) : null;
}

function hasAnsweredCategory(state: IntakeState, category: InterviewCategory): boolean {
  const field = state.fields.find((item) => item.fieldId === category);
  if (field && field.status !== "unclear" && field.status !== "conflicting") return true;
  if (category === "daily_impact" && field?.status === "unclear") return false;
  const matchingQuestionIndexes = state.questionsAsked
    .map((question, index) => categoryOfQuestion(question) === category ? index : -1)
    .filter((index) => index >= 0);
  const answeredLinkedQuestion = state.responses.some((response) => {
    const linkedQuestionIds = response.questionBankIds ?? (response.questionBankId ? [response.questionBankId] : []);
    if (linkedQuestionIds.length) return linkedQuestionIds.some((questionId) => categoryOfQuestionId(questionId) === category);
    if (response.questionId) {
      return state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(response.questionId!)
        && categoryOfQuestion(question) === category);
    }
    return matchingQuestionIndexes.some((index) => response.sequence === index);
  });
  if (answeredLinkedQuestion && !(category === "daily_impact" && field?.status === "unclear")) return true;

  const allResponses = state.responses.map((response) => response.text).join("\n");
  if (category === "onset") return /\b(since|started|start|began|beginning|yesterday|today|this morning|last night|woke up|for \d+\s*(hours?|days?|weeks?))\b/i.test(allResponses);
  if (category === "additional_symptoms") return /\b(no other symptoms?|nothing else|none along with|no additional symptoms?)\b/i.test(allResponses);
  if (category === "progression") return /\b(getting worse|worse|worsening|getting better|better|improving|improved|about the same|staying the same|unchanged|no change)\b/i.test(allResponses);
  return /\b(cannot move|can't move|unable to move|unable to get up|can't get up|cannot get up|need to lie down|want to (?:lie|lay) down|can't do (?:my|usual) activities|cannot do (?:my|usual) activities|affecting my|affects my|hard to (?:walk|stand|move|work|sleep|eat)|interferes with|difficulty reading|can't read|cannot read|difficulty walking)\b/i.test(allResponses);
}

export function createAiService(client: ChatCompleter, retriever: InMemoryRetriever, options: { emergencyContact?: EmergencyContactConfig } = {}): AiService {
  const emergencyContact = options.emergencyContact ?? DEFAULT_EMERGENCY_CONTACT;
  return {
    startIntake() {
      const assistantMessage = "Hi. I’ll ask a few short questions to help organize what you’d like to discuss with a healthcare professional. What have you been feeling? Share only what you’re comfortable including.";
      const state: IntakeState = {
        schemaVersion: "1.0",
        concern: "",
        responses: [],
        recentAssistantMessages: [assistantMessage],
        fields: [],
        questionsAsked: [assistantMessage],
        activeQuestionId: "main_concern",
        questionHistory: [{ questionId: "main_concern", targetField: "primary_concern", status: "asked", sourceResponseIds: [] }],
        completion: "in_progress",
      };
      return StartIntakeResultSchema.parse({ assistantMessage, state });
    },

    async answerQuestion(rawInput) {
      const { question, conversationHistory = [] } = AnswerQuestionInputSchema.parse(rawInput);
      let scope = classifyQuestionScope(question);
      if (scope === "out_of_scope" && isContextualFollowUp(question) && conversationHistory.length > 0) {
        scope = classifyQuestionScope(conversationHistory.at(-1)!.question);
      }
      if (scope === "out_of_scope") {
        return QuestionAnswerResultSchema.parse({ scope, answer: OUT_OF_SCOPE_ANSWER });
      }
      const urgentGuidance = urgentGuidanceForText(question);
      if (urgentGuidance) {
        return QuestionAnswerResultSchema.parse({ scope, answer: urgentGuidance });
      }
      if (scope === "medical" && isPersonalizedDiagnosisOrTreatmentRequest(question)) {
        return QuestionAnswerResultSchema.parse({ scope, answer: PERSONALIZED_MEDICAL_ANSWER });
      }

      const retrievalQuery = [...conversationHistory.flatMap((turn) => [turn.question, turn.answer]), question].join("\n");
      const context = scope === "system" ? await retriever.search(retrievalQuery, 4) : [];
      const messages = buildMessages(QUESTION_ANSWER_INSTRUCTIONS, context, { question, answerMode: scope, conversationHistory });
      const output = parseModelJson(await client.complete(messages, { maxTokens: 450, reasoningEffort: "none" }));
      try {
        return QuestionAnswerResultSchema.parse({ ...output as Record<string, unknown>, scope });
      } catch {
        throw new AiServiceError("invalid_response", "The AI response did not match the question-answer schema.");
      }
    },

    async continueIntake(rawInput, signal) {
      const input = ContinueIntakeInputSchema.parse(rawInput);
      const state = validateIntakeState(input.state);
      if (state.completion === "emergency_interrupted" || state.safety?.routed) {
        const safety = state.safety?.routed ? state.safety : assessSafety(state, emergencyContact);
        const persistentSafety = safety.routed ? safety : {
          routed: true,
          ruleId: "emergency_interruption_persisted",
          guidance: "This intake was interrupted for urgent medical guidance. Please contact emergency services or seek urgent medical help. This tool cannot assess or rule out an emergency.",
          matchedResponseIds: state.responses.at(-1) ? [state.responses.at(-1)!.id] : [],
        };
        return { safety: persistentSafety, state: interruptIntakeForSafety(state, persistentSafety) };
      }
      if (state.completion === "completed") {
        return NextTurnResultSchema.parse({ assistantMessage: "This intake is complete.", askedQuestion: null, askedQuestionId: null, fieldUpdates: [] });
      }
      const safety = assessSafety(state, emergencyContact);
      if (safety.routed) return { safety, state: interruptIntakeForSafety(state, safety) };

      const latest = input.latestResponseId
        ? state.responses.find((response) => response.id === input.latestResponseId)
        : state.responses.at(-1);
      if (input.latestResponseId && !latest) throw new AiServiceError("invalid_request", "latestResponseId is not in the intake state.");

      // `recordPatientAnswer` classifies short answers in the context of the
      // exact active question (for example, “no” to an open description prompt).
      // Keep that context-aware result instead of classifying the same word again
      // as a context-free generic reply.
      const intent = latest ? state.currentIntent ?? classifyConversationIntent({ text: latest.text, isFirstPatientTurn: state.responses.length === 1 }) : "continue";
      if (latest && intent === "correction" && isBareMisattributionCorrection(latest.text)) {
        return NextTurnResultSchema.parse({
          assistantMessage: "You’re right—I shouldn’t have attributed that to you. I’ll keep the draft grounded in what you actually shared.",
          askedQuestion: null,
          askedQuestionId: null,
          fieldUpdates: [],
        });
      }
      if (latest && intent === "finish" && isContextualFinish(latest.text, state.activeQuestionId)) {
        return NextTurnResultSchema.parse({
          assistantMessage: "Understood. I’ll stop the intake questions here. You can review the draft summary and correct anything that needs changing.",
          askedQuestion: null,
          askedQuestionId: null,
          fieldUpdates: [],
        });
      }
      if (latest && intent === "summary") {
        return NextTurnResultSchema.parse({
          assistantMessage: formatPatientConversationSummary(state),
          askedQuestion: null,
          askedQuestionId: null,
          fieldUpdates: [],
        });
      }
      if (latest && intent === "workflow_question") {
        return NextTurnResultSchema.parse({
          assistantMessage: "Next, I can organize what you’ve shared into a draft consultation summary. You can review and correct it, then show it to your doctor; it isn’t sent automatically. For medical advice about what to do, a qualified healthcare professional needs to assess your situation.",
          askedQuestion: null,
          askedQuestionId: null,
          fieldUpdates: [],
        });
      }
      if (latest && intent === "recall_request") {
        return NextTurnResultSchema.parse({
          assistantMessage: recallConversation(state) ?? "I don’t have that detail recorded in this consultation yet.",
          askedQuestion: null,
          askedQuestionId: null,
          fieldUpdates: [],
        });
      }
      if (latest && intent === "off_topic") return redirectOffTopicTurn(state, latest.text);
      if (latest && intent === "clarification_request") return clarifyPreviousTurn(state);
      const openingNoSymptoms = Boolean(latest && isNoAdditionalSymptomsReply(latest.text)
        && state.responses.length === 1
        && (state.activeQuestionId === "main_concern" || /what have you been feeling|what symptoms are you experiencing|what brings you in/i.test(state.questionsAsked.at(-1) ?? "")));
      // recordPatientAnswer is the single write path for patient evidence. The
      // model service consumes that validated state and never re-extracts or
      // merges the same answer using a second interpretation.
      const currentState = state;
      const extractedFacts = latest
        ? state.fields.filter((field) => field.sourceResponseIds.includes(latest.id))
        : [];

      // Patient symptom turns do not benefit from the project-only knowledge base.
      // Skipping local embedding and irrelevant RAG context keeps this path faster.
      const messages = buildMessages(CONTINUE_OUTPUT_INSTRUCTIONS, [], {
        state: currentState,
        latestResponse: latest ?? null,
        alreadyCovered: summarizeCoveredTopics(state.responses.map((response) => response.text).join("\n")),
        questionsAlreadyAsked: state.questionsAsked.slice(-12),
        recentAssistantMessages: state.recentAssistantMessages ?? [],
        patientIntent: intent,
        recallEvidence: recallConversation(currentState),
        promptAssessment: assessPromptAssessmentNeed(currentState),
        communicationPreferences: currentState.communicationPreferences,
        selectedNextQuestion: formatPlannedQuestionGroup(selectedQuestionsForTurn(currentState, intent), currentState)
          ?? (openingNoSymptoms ? COMPLETENESS_QUESTION : null),
      });
      const allowedIds = new Set(state.responses.map((response) => response.id));
      let content: string;
      try {
        content = await client.complete(messages, {
          // Routine turns need only a short acknowledgment; direct questions
          // get a little more room for a useful, complete answer.
          maxTokens: ["guidance_request", "personal_concern", "workflow_question", "frightened_about_dying", "care_service_request"].includes(intent) ? 36 : 18,
          reasoningEffort: "none",
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (error instanceof AiServiceError && error.code === "invalid_response" && latest && isDirectResponseIntent(intent, latest.text)) {
          return directFallbackTurn(currentState, intent, latest, extractedFacts, allowedIds);
        }
        // Preserve the answer in the caller and expose an explicit retry state;
        // never disguise an inference outage as a model-written response.
        throw error;
      }
      try {
        return normalizeNextTurn(parseModelJson(content), allowedIds, currentState, extractedFacts, intent, latest?.id);
      } catch (error) {
        if (!(error instanceof AiServiceError) || error.code !== "invalid_response") throw error;
        if (latest && isDirectResponseIntent(intent, latest.text)) {
          return directFallbackTurn(currentState, intent, latest, extractedFacts, allowedIds);
        }
        // Do not present a canned intake turn as though it came from the model.
        // A caller can preserve the patient's answer and offer an explicit retry.
        throw error;
      }
    },

    async generateBrief(rawInput) {
      const input = GenerateBriefInputSchema.parse(rawInput);
      const state = validateIntakeState(input.state);
      const safety = assessSafety(state, emergencyContact);
      if (safety.routed) throw new AiServiceError("safety_routed", "Routine brief generation stopped by the safety-routing rule.");
      return buildStructuredBrief(state);
    },
  };
}

function buildMessages(instructions: string, context: RetrievedChunk[], userPayload: unknown): ChatMessage[] {
  const retrievedContext = context.map((chunk) => ({
    source: chunk.chunkId,
    heading: chunk.heading,
    excerpt: chunk.text,
  }));
  const userContent = JSON.stringify({
    task: instructions,
    retrievedProjectGuidance: retrievedContext,
    data: userPayload,
  });
  return [
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: userContent },
  ];
}

function formatPatientConversationSummary(state: IntakeState): string {
  const brief = buildStructuredBrief(state);
  const narrative = brief.patientReportedNarrative?.text
    ?? "You shared that you would like help preparing for a conversation with a healthcare professional.";
  const concerns = brief.patientConcernsAndQuestions.map((fact) => fact.text).filter(Boolean);
  const noOtherSymptoms = state.fields.some((field) => field.fieldId === "additional_symptoms" && field.status === "patient_denied");
  return [
    "Here’s a draft summary to review and share with your doctor:",
    narrative,
    noOtherSymptoms ? "You reported no other symptoms." : "",
    concerns.length ? `You also asked about: ${[...new Set(concerns)].join("; ")}.` : "",
    "Please check that it matches what you meant and correct anything that doesn’t. This is not a diagnosis, and it has not been sent to a clinician.",
  ].filter(Boolean).join("\n\n").slice(0, 1_950);
}

function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const recoveredMessage = recoverAssistantMessage(content);
    if (recoveredMessage) return { assistantMessage: recoveredMessage };
    throw new AiServiceError("invalid_response", "The AI returned content that was not valid JSON.");
  }
}

function recoverAssistantMessage(content: string): string | null {
  const property = /["'](?:assistantMessage|assistant_message|message|response)["']\s*:\s*/g;
  const match = property.exec(content);
  if (!match) return null;

  const start = content.indexOf('"', match.index + match[0].length);
  if (start < 0) return null;
  let escaped = false;
  for (let end = start + 1; end < content.length; end += 1) {
    const character = content[end]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      try {
        const recovered = JSON.parse(content.slice(start, end + 1)) as unknown;
        return typeof recovered === "string" && recovered.trim() ? recovered.trim() : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isDirectQuestion(text: string): boolean {
  return text.includes("?") || /^\s*(?:what|why|how|when|where|who|which|is|are|am|do|does|did|can|could|should|would|will|have|has)\b/i.test(text)
    || /\b(?:what should i do|what can i do|where can i get help|do i need to|should i|can i take|is this a)\b/i.test(text);
}

function isDirectResponseIntent(intent: ConversationIntent, latestText: string): boolean {
  if (["guidance_request", "personal_concern", "workflow_question", "frightened_about_dying", "care_service_request"].includes(intent)) return true;
  if (["off_topic", "identity_question", "format_preference", "clarification_request", "repetition_complaint", "recall_request", "summary", "finish", "decline", "greeting", "vague_opening", "ambiguous_opening", "unclear"].includes(intent)) return false;
  return isDirectQuestion(latestText);
}

function directFallbackTurn(state: IntakeState, intent: ConversationIntent, latest: IntakeState["responses"][number], extractedFacts: IntakeField[], allowedIds: Set<string>): NextTurnResult {
  const promptAssessment = assessPromptAssessmentNeed(state);
  const assessmentPrefix = promptAssessment
    ? "Because you’ve described worsening weakness or low energy that is affecting your usual activities, please contact a qualified healthcare professional promptly for assessment. This AI can’t determine the cause or whether it is safe to manage at home, and you don’t need to finish this intake before seeking care."
    : "";
  const fallback = directAnswerFallback(intent, state, latest.text);
  const assistantMessage = [assessmentPrefix, fallback].filter(Boolean).join(" ");
  return NextTurnResultSchema.parse({
    assistantMessage,
    askedQuestion: null,
    askedQuestionId: null,
    askedQuestionIds: [],
    fieldUpdates: extractedFacts.filter((field) => field.sourceResponseIds.every((id) => allowedIds.has(id))),
    guidanceProvided: {
      text: [assessmentPrefix, fallback].filter(Boolean).join(" "),
      category: promptAssessment ? "prompt_assessment" : "general_information",
      sourceResponseIds: [latest.id],
    },
  });
}

function normalizeNextTurn(output: unknown, allowedIds: Set<string>, state: IntakeState, extractedFacts: IntakeField[], intent: ConversationIntent, latestResponseId?: string): NextTurnResult {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new AiServiceError("invalid_response", "The AI returned no structured intake turn.");
  }
  const record = output as Record<string, unknown>;
  const messageValue = record.assistantMessage ?? record.assistant_message ?? record.message ?? record.response;
  if (typeof messageValue !== "string" || !messageValue.trim()) {
    throw new AiServiceError("invalid_response", "The AI response did not include a usable assistant message.");
  }
  const recalled = intent === "recall_request" ? recallConversation(state) : null;
  // The local model receives all evidence and still runs for recall turns. Anchor
  // the displayed answer to that evidence so a small model cannot invent numbers.
  if (recalled) return NextTurnResultSchema.parse({
    assistantMessage: recalled, askedQuestion: null, askedQuestionId: null, fieldUpdates: [],
  });
  const modelMessage = deduplicateQuestions(messageValue.trim());
  const latestText = state.responses.at(-1)?.text ?? "";
  const directRequest = intent === "guidance_request" || intent === "personal_concern" || intent === "workflow_question"
    || intent === "frightened_about_dying" || intent === "care_service_request" || isDirectQuestion(latestText);
  if (/\b(?:call\s+(?:911|the emergency number|emergency services)|emergency services|emergency department|seek emergency care|go to the emergency room)\b/i.test(modelMessage)) {
    // The safety rules run before inference. If none matched, do not let a
    // generated reply escalate a routine intake into an unsupported emergency.
    throw new AiServiceError("invalid_response", "The AI returned unsupported urgent guidance. Please retry your answer.");
  }
  const answerText = extractAnswerBeforeQuestion(modelMessage);
  if (directRequest && (!answerText || isUnsafePersonalAdvice(answerText)
    || !isResponsiveDirectAnswer(answerText, intent, latestText))) {
    throw new AiServiceError("invalid_response", "The AI did not return a safe, direct answer to the patient's request.");
  }

  const promptAssessment = assessPromptAssessmentNeed(state);
  const assessmentPrefix = directRequest && promptAssessment
    ? "Because you’ve described worsening weakness or low energy that is affecting your usual activities, please contact a qualified healthcare professional promptly for assessment. This AI can’t determine the cause or whether it is safe to manage at home, and you don’t need to finish this intake before seeking care."
    : "";
  const conversationalReply = intent === "care_service_request"
    ? "I can’t search for or book a clinician through this demo, and I can’t make a referral. If you already have a clinic or provider in mind, contact them directly; I can help organize what you’d like to tell them."
    : intent === "format_preference"
      ? state.communicationPreferences?.questionFormat === "bullets" || state.communicationPreferences?.questionPacing === "grouped"
        ? "Of course. I’ll use concise bullet points and group related questions so you can answer them together."
        : "Of course. I’ll keep the questions focused and use the format you asked for."
      : intent === "off_topic"
        ? "I can help organize information about a health concern for your visit."
        : intent === "repetition_complaint"
          ? repetitionComplaintAcknowledgement(state)
        : intent === "clarification_request"
          ? "Sorry, I may not have phrased that clearly."
    : directRequest
    ? `${extractedFacts.some((field) => field.fieldId !== "patient_question") ? contextualAcknowledgement(latestText, extractedFacts, state.responses.at(-1)?.sequence ?? 0, state.recentAssistantMessages ?? []) : ""} ${cleanDirectModelReply(answerText, intent, state, latestText)}`.trim()
    : intent === "greeting" ? cleanGreetingAcknowledgement(modelMessage)
    : cleanModelReply(answerText, latestText, extractedFacts, state);
  const baseMessage = [assessmentPrefix, conversationalReply].filter(Boolean).join(" ");
  const plannedQuestions = selectedQuestionsForTurn(state, intent);
  const planned = plannedQuestions[0];
  const latestQuestion = state.responses.at(-1)?.text ?? "";
  const openingNoSymptoms = isNoAdditionalSymptomsReply(latestQuestion)
    && state.responses.length === 1
    && (state.activeQuestionId === "main_concern" || /what have you been feeling|what symptoms are you experiencing|what brings you in/i.test(state.questionsAsked.at(-1) ?? ""));
  const fallbackQuestion = openingNoSymptoms ? COMPLETENESS_QUESTION : null;
  const nextQuestion = formatPlannedQuestionGroup(plannedQuestions, state) ?? fallbackQuestion;
  const nextQuestionId = planned?.questionId ?? (openingNoSymptoms ? "completion_check" : null);
  const nextQuestionIds = plannedQuestions.map((question) => question.questionId);
  const planAlreadyAsked = Boolean(nextQuestion && state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(nextQuestion)));
  // Answer direct patient questions before continuing with one relevant, not-yet-
  // asked intake question. This prevents the old behavior of ignoring the question
  // while still avoiding a second model-generated follow-up.
  const isClarification = intent === "clarification_request";
  const actualNextQuestion = directRequest && !isClarification || planAlreadyAsked && !isClarification ? null : nextQuestion;
  const assistantMessage = actualNextQuestion ? `${baseMessage} ${actualNextQuestion}` : baseMessage;
  const fieldUpdates = extractedFacts.filter((field) => field.sourceResponseIds.every((id) => allowedIds.has(id)));
  const guidanceProvided = directRequest && latestResponseId ? {
    text: [assessmentPrefix, answerText].filter(Boolean).join(" "),
    category: promptAssessment ? "prompt_assessment" as const : "general_information" as const,
    sourceResponseIds: [latestResponseId],
  } : undefined;
  const result = NextTurnResultSchema.safeParse({
    assistantMessage,
    askedQuestion: actualNextQuestion,
    askedQuestionId: actualNextQuestion ? nextQuestionId : null,
    askedQuestionIds: actualNextQuestion ? nextQuestionIds.length ? nextQuestionIds : nextQuestionId ? [nextQuestionId] : [] : [],
    fieldUpdates,
    ...(guidanceProvided ? { guidanceProvided } : {}),
  });
  if (!result.success) throw new AiServiceError("invalid_response", "The AI response could not be normalized safely.");
  return result.data;
}

function isUnsafePersonalAdvice(message: string): boolean {
  const namedMedication = /\b(?:ibuprofen|acetaminophen|paracetamol|aspirin|naproxen|aleve|advil|motrin|tylenol|excedrin|sumatriptan|triptan)\b/i;
  const medicationClass = /\b(?:medications?|medicines?|drugs?|pain relievers?|painkillers?|analgesics?|over[- ]the[- ]counter|otc)\b/i;
  const recommendsMedication = /\b(?:take|taking|use|using|try|trying|consider|recommend|recommendation|suggest|start|stop|increase|decrease)\b[^.!?]{0,80}\b(?:medications?|medicines?|drugs?|pain relievers?|painkillers?|analgesics?|over[- ]the[- ]counter|otc)\b/i;
  const medicationClaimedHelpful = /\b(?:medications?|medicines?|drugs?|pain relievers?|painkillers?|analgesics?|over[- ]the[- ]counter|otc)\b[^.!?]{0,60}\b(?:may|might|can|could|should|will)\s+(?:help|ease|relieve|reduce|treat)\b/i;
  return /\b(?:you have|you likely have|you probably have|this is (?:a|an)|take \d+|start taking|stop taking|increase your dose|decrease your dose)\b/i.test(message)
    || namedMedication.test(message)
    || medicationClass.test(message) && (recommendsMedication.test(message) || medicationClaimedHelpful.test(message));
}

function extractAnswerBeforeQuestion(message: string): string {
  const questionLead = /\b(?:could you|can you|would you|when did|how long|how much|how\b|have you|are you|do you|did you|what|which|who|where|why|is there|are there|has it|have they|does it|is it|was it|were there)\b/i.exec(message);
  const questionMark = message.indexOf("?");
  const cutAt = [questionLead?.index, questionMark >= 0 ? questionMark : undefined]
    .filter((index): index is number => index !== undefined)
    .reduce((earliest, index) => Math.min(earliest, index), Number.POSITIVE_INFINITY);
  const answer = Number.isFinite(cutAt) ? message.slice(0, cutAt) : message;
  return answer.replace(/[\s.!?]+$/g, "").trim();
}

function cleanModelReply(message: string, latestText: string, fieldUpdates: IntakeField[], state: IntakeState): string {
  // The app owns follow-up selection. Keep only a brief acknowledgement from the
  // model and discard narration, extra questions, or leaked note-taking language.
  const withoutGenericThanks = message
    .replace(/^\s*(?:thanks?|thank you)\b[^.!?]*(?:[.!?]\s*|—\s*)?/i, "")
    .trim();
  if (isPatientFacingReply(withoutGenericThanks) && replyReflectsLatestAnswer(withoutGenericThanks, latestText)
    && !overlyEchoesLatestAnswer(withoutGenericThanks, latestText)
    && replyCoversReportedSymptoms(withoutGenericThanks, fieldUpdates)
    && !hasInventedTemperatureUnit(withoutGenericThanks, state)
    && !overstatesUncertainTemperature(withoutGenericThanks, fieldUpdates)) {
    const normalized = /[.!?…]$/.test(withoutGenericThanks) ? withoutGenericThanks : `${withoutGenericThanks}.`;
    if (!repeatsRecentAcknowledgement(normalized, state.recentAssistantMessages ?? [])) return normalized;
  }
  return contextualAcknowledgement(latestText, fieldUpdates, state.responses.at(-1)?.sequence ?? 0, state.recentAssistantMessages ?? []);
}

function hasInventedTemperatureUnit(message: string, state: IntakeState): boolean {
  const reported = state.responses.map(response => extractReportedTemperature(response.text, /temperature/i.test(response.questionId ?? "")) ?? "");
  return [...message.matchAll(/\b(\d{2,3}(?:\.\d+)?)\s*(?:°\s*|degrees?\s*)?(celsius|fahrenheit|[cf]\b)/gi)].some(match => {
    const unit = /^c/i.test(match[2]!) ? "C" : "F";
    return !reported.some(reading => reading.includes(`${match[1]} °${unit}`));
  });
}

function overstatesUncertainTemperature(message: string, fieldUpdates: IntakeField[]): boolean {
  const reading = fieldUpdates.find((field) => field.fieldId === "temperature_measurement")?.value;
  if (!reading || !/uncertain or approximate/i.test(reading)) return false;
  if (!/\b(?:temperature|reading|degrees?|\d{2}(?:\.\d+)?)\b/i.test(message)) return false;
  return !/\b(?:estimate|estimated|approx(?:imately)?|around|about|think|maybe|possibly|uncertain|not sure)\b/i.test(message);
}

function cleanDirectModelReply(message: string, intent: ConversationIntent, state: IntakeState, latestText: string): string {
  if (!isPatientFacingReply(message) || isUnsafePersonalAdvice(message)) {
    return directAnswerFallback(intent, state, latestText);
  }
  const cleaned = message.replace(/^\s*(?:thanks?|thank you)\b[^.!?]*(?:[.!?]\s*|—\s*)?/i, "").trim();
  if (!isResponsiveDirectAnswer(cleaned, intent, latestText)
    || intent === "personal_concern" && !/\b(?:can'?t tell|cannot tell|can'?t determine|cannot determine|clinician|doctor|assess|assessment|cause)\b/i.test(cleaned)) {
    return directAnswerFallback(intent, state, latestText);
  }
  return cleaned;
}

function isResponsiveDirectAnswer(message: string, intent: ConversationIntent, latestText: string): boolean {
  const asksForAction = intent === "guidance_request" && /\b(?:what (?:can|should) i do|what to do|how can i (?:ease|relieve|manage|help)|what helps|what can help|anything i can do|how do i feel better|any (?:advice|tips|home remedies))\b/i.test(latestText);
  if (!asksForAction) return true;
  const asksForRelief = /\b(?:ease|relieve|pain|hurt|feel better|remedies|tips?)\b/i.test(latestText);
  if (asksForRelief) return /\b(?:rest|quiet room|dark room|drink water|water|hydration|fluids?|compress|reduce noise|dim the lights?)\b/i.test(message);
  return /\b(?:rest|drink|sip|water|fluid|contact|call|speak|talk|see|visit|consult|ask|seek|healthcare professional|doctor|clinician|medical advice|quiet room)\b/i.test(message);
}

function directAnswerFallback(intent: ConversationIntent, state?: IntakeState, latestText = ""): string {
  const history = state?.recentAssistantMessages ?? [];
  const chooseFresh = (options: string[]) => options.find((option) => !history.some((message) => normalizeQuestion(message) === normalizeQuestion(option))) ?? options[0]!;
  const headacheReported = Boolean(state?.fields.some((field) => ["headache", "headache_character", "headache_location", "headache_severity"].includes(field.fieldId))
    || state?.responses.some((response) => /\b(?:headache|migraine|head pain)\b/i.test(response.text)));
  if (intent === "guidance_request" && headacheReported) {
    const migraineMentioned = state?.responses.some((response) => /\bmigraine\b/i.test(response.text));
    if (/\b(?:before (?:i )?(?:go|see)|before (?:the )?(?:doctor|doct\w*|clinician)|tips? before)\b/i.test(latestText)) {
      const causeNote = migraineMentioned
        ? "I can’t tell from chat whether this is a migraine; ask the clinician what is right for you."
        : "I can’t determine the cause from chat; the clinician can advise you personally.";
      return chooseFresh([
        `Before the visit, it may help to note when the headache began, where it hurts, how it feels, and any other symptoms; you can show that to the clinician. For comfort while you wait, try resting somewhere quiet and dim and sip water if you’re able. ${causeNote}`,
        `For the appointment, write down when this started, what the pain feels like, and anything else you’ve noticed. While waiting, a quiet, dim place to rest and small sips of water may help with comfort if you can tolerate them. ${causeNote}`,
      ]);
    }
    if (migraineMentioned) {
      return chooseFresh([
        "I can’t tell from chat whether the headache is a migraine or something else. For general comfort, you could rest in a quiet, dim room and sip water if you’re able. A qualified healthcare professional can advise what’s appropriate for you.",
        "That sounds uncomfortable. I can’t identify the cause or tell whether it’s a migraine here. You could try resting somewhere quiet with dim light and drinking water if you’re able, and ask a clinician for advice tailored to you.",
      ]);
    }
    return chooseFresh([
      "That sounds uncomfortable. I can’t tell what’s causing the headache from chat. For general comfort, try resting in a quiet, dim room and sipping water if you’re able. Please contact a qualified healthcare professional for advice tailored to you.",
      "I hear you’re looking for something practical to try. While you arrange care, you could rest somewhere quiet and dim and sip water if you can. I can’t determine the cause here, so please contact a clinician for advice about your situation.",
    ]);
  }
  if (intent === "guidance_request" || intent === "personal_concern") {
    return chooseFresh([
      "I can’t determine the cause or choose treatment from chat. For now, rest somewhere comfortable, sip fluids if you’re able, and note when this started and any changes. Please contact a qualified healthcare professional for advice about your situation.",
      "I hear you’re asking what to do next. I can’t assess the cause here; consider resting somewhere comfortable and keeping track of your symptoms while you contact a qualified healthcare professional for personal advice.",
    ]);
  }
  if (intent === "care_service_request") {
    return "I can’t arrange care through this demo. Please contact a qualified healthcare professional or local clinic directly; I can help organize what you want to tell them.";
  }
  if (intent === "frightened_about_dying") {
    return "I can’t tell what is causing this from chat. Please contact a qualified healthcare professional now so they can assess your symptoms and advise you.";
  }
  return "I can’t determine the cause from chat. A qualified healthcare professional can assess what you’ve described and advise you on next steps.";
}

function cleanGreetingAcknowledgement(message: string): string {
  const greeting = message.match(/^\s*(?:hi|hello|hey)\b[^.!?]{0,120}[.!?]?/i)?.[0]?.trim();
  if (greeting && !/[\u0000-\u001f]|\*\*|^[-*#]\s/i.test(greeting)) return greeting;
  return "Hi!";
}

function isPatientFacingReply(message: string): boolean {
  const value = message.trim();
  if (!value || value.length < 12 || value.length > 520) return false;
  if (/^\s*(?:\{\s*["'](?:assistantMessage|assistant_message|askedQuestion|fieldUpdates|fieldId|status)["']\s*:|\[\s*\{|```(?:json)?\b)/i.test(value)) return false;
  if (/\b(?:the user|the patient|patient reports|the patient mentioned|the concerned issue)\b/i.test(value)) return false;
  // Small local models sometimes return private note-taking scaffolding instead
  // of a sentence for the person. Never show those labels or markdown bullets.
  if (/^\s*[-*#]\s|\*\*|(?:^|\n)\s*(?:asks?|summary|analysis|recorded facts?)\s*:/im.test(value)) return false;
  // Reject replies that accidentally speak as if the assistant has the patient's
  // symptoms. Match both straight and typographic apostrophes from model output.
  if (/\bI(?:['’]m| am)\s+(?:feeling|experiencing|having)\b/i.test(value)
    || /\bI\s+(?:have|feel)\b[^.!?]{0,100}\b(?:headaches?|migraines?|cramp(?:ing)?|chills?|fever|pain|nausea|vomiting|weakness|cold|hot|dizz(?:y|iness)|unwell)\b/i.test(value)) return false;
  if (/^(?:hi[.!]?\s*)?(?:i(?:'ll| will) ask a few short questions|reply in json|assistantmessage\s*:)/i.test(value)) return false;
  return true;
}

function replyReflectsLatestAnswer(message: string, latestText: string): boolean {
  const words = latestText.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [];
  const usefulWords = words.filter((word) => word.length >= 4 && !new Set([
    "that", "this", "with", "from", "when", "what", "where", "have", "does", "there", "then", "just", "like", "also", "about", "feel", "feels", "started", "began",
  ]).has(word));
  if (!usefulWords.length) return false;
  const normalizedReply = message.toLocaleLowerCase();
  return usefulWords.some((word) => normalizedReply.includes(word));
}

function replyCoversReportedSymptoms(message: string, fieldUpdates: IntakeField[]): boolean {
  const symptoms = fieldUpdates.filter((field) => isSymptomReportField(field.fieldId)
    && ["reported", "patient_corrected"].includes(field.status));
  if (symptoms.length < 2) return true;
  return symptoms.every((field) => {
    const label = getSymptomLabel(field.fieldId)?.replace(/\s*\([^)]*\)/g, "").trim();
    if (!label) return true;
    const pattern = field.fieldId === "headache" ? /\bheadaches?\b/i
      : field.fieldId === "cramping" ? /\bcramp(?:ing)?\b/i
        : field.fieldId === "chills" ? /\b(?:chills?|shivering|cold)\b/i
          : new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
    return pattern.test(message);
  });
}

function overlyEchoesLatestAnswer(message: string, latestText: string): boolean {
  const ignored = new Set(["that", "this", "with", "from", "when", "what", "where", "have", "does", "there", "then", "just", "like", "also", "about", "feel", "feels", "started", "began", "the", "and", "but", "you", "your", "can", "could"]);
  const keyWords = [...new Set((latestText.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 4 && !ignored.has(word)))];
  if (keyWords.length < 3) return false;
  const echoedWords = keyWords.filter((word) => message.toLocaleLowerCase().includes(word));
  return echoedWords.length / keyWords.length >= 0.68;
}

function contextualAcknowledgement(latestText: string, fieldUpdates: IntakeField[], sequence: number, previousMessages: string[] = []): string {
  const choose = (candidates: string[]) => candidates.find((candidate) => !repeatsRecentAcknowledgement(candidate, previousMessages))
    ?? candidates[Math.max(0, sequence) % candidates.length]!;
  if (/\b(?:worried|concerned|scared|afraid|anxious)\b/i.test(latestText)) return choose(["I understand this is worrying you.", "I hear that you’re concerned about this.", "I can see why this has your attention."]);
  if (/^\s*(?:none|nothing|no|nope|that's all|that is all|nothing else)\b/i.test(latestText)) return choose(["Okay, I’ll note that there are no other symptoms to add.", "Understood. I’ll leave the other-symptoms section as none reported.", "Got it—I’ve recorded that you have nothing else to add."]);
  if (/\b(?:already answered|i said that|i told you|asked that)\b/i.test(latestText)) return "You’re right—I’ve noted your earlier answer and won’t ask you to repeat it.";
  const reportedSymptoms = fieldUpdates.filter((field) => isSymptomReportField(field.fieldId)
    && ["reported", "patient_corrected"].includes(field.status));
  const temperatureField = fieldUpdates.find((field) => field.fieldId === "temperature_measurement" && field.value);
  const symptomLabels = reportedSymptoms.map((field) => {
    if (field.fieldId === "headache") {
      const character = fieldUpdates.find((item) => item.fieldId === "headache_character")?.value?.toLocaleLowerCase();
      return character ? `a ${character} headache` : "a headache";
    }
    const label = getSymptomLabel(field.fieldId)?.replace(/\s*\([^)]*\)/g, "").toLocaleLowerCase();
    return label === "feeling cold or chills" ? "feeling cold or having chills" : label;
  }).filter((value): value is string => Boolean(value));
  const noOtherSymptoms = fieldUpdates.some((field) => field.fieldId === "additional_symptoms" && field.status === "patient_denied");
  const noOtherNote = noOtherSymptoms ? ", and that there are no other symptoms to add" : "";
  const temperatureReading = temperatureField?.value?.match(/\d{2}(?:\.\d+)?/)?.[0];
  if (symptomLabels.length && temperatureField?.value && temperatureReading) {
    const estimate = /uncertain or approximate/i.test(temperatureField.value)
      ? `your temperature estimate of ${temperatureReading} degrees`
      : `a temperature reading of ${temperatureReading} degrees`;
    return choose([
      `I’ve noted ${joinTopics(symptomLabels)}, along with ${estimate}${noOtherNote}.`,
      `I have ${joinTopics(symptomLabels)} noted, and ${temperatureReading} degrees is marked as ${/uncertain or approximate/i.test(temperatureField.value) ? "your estimate" : "the temperature reading"}${noOtherNote}.`,
    ]);
  }
  if (/\b(?:not sure|i don'?t know|unsure|can'?t remember|cannot remember)\b/i.test(latestText)) {
    if (symptomLabels.length) return choose([
      `I’ve noted ${joinTopics(symptomLabels)}${noOtherNote}. I’ll leave that detail as uncertain.`,
      `I have ${joinTopics(symptomLabels)} in your notes${noOtherNote}, and I won’t ask you to guess the uncertain detail.`,
    ]);
    return choose(["That’s okay; I’ll leave that detail as uncertain.", "No problem. I’ll mark that detail as not sure.", "Understood—I won’t ask you to guess."]);
  }
  const temperature = latestText.match(/\b\d{2}(?:\.\d+)?\s*°?\s*[cf]?\b/i)?.[0]?.trim();
  if (temperature || /\btemperature reading\b/i.test(latestText)) {
    const topics = summarizeCoveredTopics(latestText).filter((topic) => topic !== "temperature");
    const symptoms = topics.map((topic) => topic.replace(/_/g, " "));
    const details = symptoms.length ? joinTopics(symptoms) : "the symptoms you described";
    const temperatureField = fieldUpdates.find((field) => field.fieldId === "temperature_measurement");
    if (temperature && temperatureField?.value && /uncertain or approximate/i.test(temperatureField.value)) {
      return choose([`I have ${details} in your notes, with ${temperature} recorded as your estimate.`, `Okay, I’ve noted ${details} and marked ${temperature} as an estimated temperature.`, `Your notes include ${details} and your estimate of ${temperature}.`]);
    }
    return temperature
      ? choose([`I have ${details} and the ${temperature} temperature reading you mentioned.`, `Okay, I’ve recorded ${details} along with ${temperature}.`, `Your notes now include ${details} and a temperature reading of ${temperature}.`])
      : choose([`I have ${details} and the temperature reading you shared.`, `Okay, I’ve added the temperature reading to your notes.`, `Your notes now include the temperature reading you gave.`]);
  }
  if (fieldUpdates.some((field) => field.fieldId === "onset" || field.fieldId.startsWith("symptom_onset_"))) {
    const onset = fieldUpdates.find((field) => field.fieldId === "onset" || field.fieldId.startsWith("symptom_onset_"))?.value;
    return onset ? choose([`That places the start at ${onset}.`, `I have the timing as ${onset}.`, `Okay, I’ve added ${onset} as the start time.`]) : choose(["That helps clarify the timing.", "Okay, I have that timing detail.", "I’ve added that timing to your notes."]);
  }
  if (fieldUpdates.some((field) => field.fieldId === "progression")) {
    const progression = fieldUpdates.find((field) => field.fieldId === "progression")?.value;
    return progression ? choose([`I have the change recorded as ${progression.toLowerCase()}.`, `Okay, I’ve added that it has been ${progression.toLowerCase()}.`, `That gives me the change over time.`]) : choose(["I have how it has changed in your notes.", "Okay, that helps describe its course.", "I’ve added that change to the notes."]);
  }
  if (fieldUpdates.some((field) => field.fieldId === "daily_impact")) return choose(["I have that effect on your usual activities recorded.", "Okay, I’ve added how this is affecting your day.", "That helps describe what has been harder for you."]);
  if (fieldUpdates.some((field) => field.fieldId === "temperature_measurement")) return choose(["I’ve added the temperature reading to your notes.", "Okay, I have that reading recorded.", "The temperature you shared is in your notes."]);
  const headacheCharacter = fieldUpdates.find((field) => field.fieldId === "headache_character")?.value;
  if (headacheCharacter && /\bcramp(?:ing)?\b/i.test(latestText)) return choose(["I’ve noted the crushing headache and the cramping you mentioned. We can leave the cramping description open for now.", "I have both the headache and cramping recorded, along with your description of the headache.", "The headache description and the cramping are both in your notes."]);
  const headacheLocation = fieldUpdates.find((field) => field.fieldId === "headache_location" && field.value && field.status === "reported")?.value;
  if (headacheLocation) {
    const movement = /\b(?:stays?|staying|does not move|doesn'?t move)\b/i.test(headacheLocation) ? "stays in one place"
      : /\b(?:moves?|moving|shifts?)\b/i.test(headacheLocation) ? "moves" : null;
    const towardEyes = /\btoward(?:s)?\s+(?:my\s+)?eyes?\b/i.test(headacheLocation);
    if (movement && towardEyes) return choose([`I have the headache as ${movement} and near your eyes.`, `Okay, I’ve recorded that it ${movement} and is near your eyes.`, `That gives me both the location and movement detail.`]);
    return choose(["I have the headache location and whether it moves in your notes.", "Okay, that adds detail about the headache’s location.", "I’ve got that headache detail recorded."]);
  }
  if (fieldUpdates.some((field) => /(?:headache|symptom)_character$/.test(field.fieldId))) return choose(["That describes what the sensation is like.", "Okay, I’ve added that description.", "I have that quality of the headache recorded."]);
  if (fieldUpdates.some((field) => /(?:headache|symptom)_location$/.test(field.fieldId))) return choose(["I have that location detail recorded.", "Okay, that narrows down where it is.", "I’ve added that location to your notes."]);
  if (fieldUpdates.some((field) => field.fieldId === "additional_symptoms" && field.status === "patient_denied")) return choose(["Okay, I’ll note that there are no other symptoms.", "Understood. I’ve recorded no other symptoms.", "I have that you haven’t noticed anything else."]);
  const topics = summarizeCoveredTopics(latestText).filter((topic) => !["temperature"].includes(topic));
  if (topics.length) {
    const labels = topics.map((topic) => topic.replace(/_/g, " "));
    return choose([`I have ${joinTopics(labels)} in your notes.`, `Okay, I’ve recorded ${joinTopics(labels)}.`, `That gives me the main details about ${joinTopics(labels)}.`]);
  }
  return choose(["I have that detail in your notes.", "Okay, I’ve added that to the consultation notes.", "Got it—I’ll keep that in mind as we continue."]);
}

function repeatsRecentAcknowledgement(candidate: string, previousMessages: string[]): boolean {
  const normalizedCandidate = normalizeQuestion(candidate);
  if (!normalizedCandidate) return false;
  return previousMessages.slice(-6).some((message) => normalizeQuestion(message).startsWith(normalizedCandidate));
}

function repetitionComplaintAcknowledgement(state: IntakeState): string {
  const activeIds = state.activeQuestionIds?.length ? state.activeQuestionIds : state.activeQuestionId ? [state.activeQuestionId] : [];
  const targets = activeIds.flatMap((questionId) => {
    const question = QUESTION_BANK.find((item) => item.id === questionId);
    if (questionId.startsWith("symptom_onset__")) return ["onset", ...questionId.slice("symptom_onset__".length).split(",").map((id) => `symptom_onset_${id}`)];
    if (questionId === "main_concern") return ["primary_concern", "current_symptoms"];
    return question ? [question.targetField] : [questionId];
  });
  const answerRecorded = state.fields.some((field) => targets.includes(field.fieldId)
    && ["reported", "patient_corrected", "patient_denied", "declined", "unknown", "not_answered"].includes(field.status));
  return answerRecorded
    ? "You’re right—I have your earlier answer recorded, so I’ll use it and won’t ask you to repeat it."
    : "Sorry, I can’t find that detail in your notes. I’ll leave it blank for now and move on; you can add it later.";
}

function joinTopics(items: string[]): string {
  if (items.length < 2) return items[0] ?? "those symptoms";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["temperature", /\b(temperature|fever|\d{2}\.\d\s*°?\s*c?|\d{2}\.\d)\b/i],
  ["cold symptoms", /\b(?:colds|a cold|cold symptoms|common cold)\b/i],
  ["chills", /\b(chills?|shivering|feeling cold)\b/i],
  ["weakness", /\b(weak|weakness|no energy|low energy|fatigue|exhausted|tired)\b/i],
  ["appetite", /\b(appetite|hungry|eating)\b/i],
  ["sleepiness", /\b(sleepy|want to sleep|sleeping|drowsy)\b/i],
  ["body_aches", /\b(body aches?|muscle aches?|muscle pain|myalgia)\b/i],
  ["headache", /\b(headaches?|head pain|migraine)\b/i],
  ["cough", /\bcough(?:ing)?\b/i],
  ["sore_throat", /\b(sore throat|throat pain)\b/i],
  ["runny_nose", /\b(runny nose|nasal congestion|stuffy nose)\b/i],
  ["nausea", /\bnausea|nauseous\b/i],
  ["vomiting", /\b(vomit(?:ed|ing)?|threw up)\b/i],
  ["diarrhea", /\b(diarrh?ea|loose stools?)\b/i],
  ["stomach_pain", /\b(stomach|abdominal|belly) (ache|pain|cramp)s?\b/i],
];

function summarizeCoveredTopics(text: string): string[] {
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function getMentionedTopics(text: string): string[] {
  return summarizeCoveredTopics(text);
}

function isSymptomPresenceQuestion(question: string): boolean {
  return /\?/.test(question) && /\b(any|have you|do you|are you|did you|noticed|experiencing)\b/i.test(question);
}

function contextualNoneField(question: string, sourceResponseId: string): NextTurnResult["fieldUpdates"] {
  if (/\b(what have you been feeling|what symptoms are you experiencing|what brings you in)\b/i.test(question)) {
    return [{ fieldId: "current_symptoms", value: "No symptoms reported", status: "patient_denied", sourceResponseIds: [sourceResponseId] }];
  }
  if (/\b(taken|checked|measured|temperature reading)\b/i.test(question) && /\btemperature\b/i.test(question)) {
    return [{ fieldId: "temperature_measurement", value: null, status: "unknown", sourceResponseIds: [sourceResponseId] }];
  }
  if (/\b(other symptoms?|anything else|any other|along with|noticed any|symptoms? like)\b/i.test(question)) {
    return [{ fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: [sourceResponseId] }];
  }
  const category = categoryOfQuestion(question);
  if (category) {
    const fieldId = category;
    return [{ fieldId, value: null, status: "unknown", sourceResponseIds: [sourceResponseId] }];
  }
  const topics = getMentionedTopics(question);
  if (topics.length && isSymptomPresenceQuestion(question)) {
    return topics.map((topic) => ({
      fieldId: topic,
      value: `No ${topic.replace(/_/g, " ")} reported`,
      status: "patient_denied" as const,
      sourceResponseIds: [sourceResponseId],
    }));
  }
  return [{ fieldId: "response_to_last_question", value: null, status: "unknown", sourceResponseIds: [sourceResponseId] }];
}

function isNoAdditionalSymptomsReply(text: string): boolean {
  return /^\s*(nothing|none|nope|no|no symptoms|that'?s all|that is all|nothing else)\b[\s,.!?-]*(?:just\s+(?:the\s+)?(?:my\s+)?headache|just what i said|nothing else|no other symptoms?|only that|that'?s it|that is it)?[\s,.!?]*$/i.test(text);
}

function isContextualFinish(text: string, activeQuestionId: string | undefined): boolean {
  if (/\b(?:finish(?: the interview)?|wrap(?: it)? up|stop asking|end the interview|submit my intake|i'?m done|i am done)\b/i.test(text)) return true;
  return activeQuestionId === "completion_check";
}

function normalizeQuestion(question: string): string {
  return question.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function deduplicateQuestions(message: string): string {
  const questions = message.match(/[^?]*\?/g) ?? [];
  const uniqueQuestions = new Set<string>();
  let result = message;
  for (const question of questions) {
    const normalized = normalizeQuestion(question);
    if (uniqueQuestions.has(normalized)) {
      result = result.replace(question, "");
    } else {
      uniqueQuestions.add(normalized);
    }
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

export function makeSyntheticSmokePayload(): { prompt: string; expectedSchema: string } {
  return {
    prompt: "Return JSON only with a short intake response and a structured field. Synthetic patient statement: 'I have had a mild headache since yesterday.' Do not diagnose or recommend treatment.",
    expectedSchema: "{assistantMessage:string, fieldId:string, value:string|null, status:string, sourceResponseIds:string[]}",
  };
}
