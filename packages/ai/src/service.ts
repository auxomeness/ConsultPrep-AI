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
import { assessSafety } from "./safety.js";
import { CONTINUE_OUTPUT_INSTRUCTIONS, QUESTION_ANSWER_INSTRUCTIONS, SYSTEM_INSTRUCTIONS } from "./prompts.js";
import { classifyQuestionScope, isContextualFollowUp, isPersonalizedDiagnosisOrTreatmentRequest, OUT_OF_SCOPE_ANSWER, PERSONALIZED_MEDICAL_ANSWER } from "./scope.js";
import { urgentGuidanceForText } from "./safety.js";
import { extractPatientFacts, factIsSufficient, mergeFieldUpdates, targetForQuestion } from "./intake-facts.js";
import { detectSymptomCategories, getSymptomLabel, isQuestionApplicable, QUESTION_BANK, questionIsRelevant, reportedSymptomFieldIds, type QuestionDefinition } from "./question-bank.js";
import { buildStructuredBrief } from "./brief.js";
import { assessIntakeCompleteness } from "./completeness.js";

export interface AiService {
  startIntake(): StartIntakeResult;
  continueIntake(input: unknown): Promise<NextTurnResult | { safety: ReturnType<typeof assessSafety>; state: IntakeState }>;
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

export const MAX_ROUTINE_FOLLOW_UPS = 8;

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

export function planNextQuestion(state: IntakeState): PlannedQuestion | null {
  if (state.completion === "completed") return null;
  const completeness = assessIntakeCompleteness(state);
  if (completeness.status === "potentially_urgent") return null;
  if (/^\s*(?:none|nothing|no symptoms|i have no symptoms|i don'?t have any symptoms)[.!\s]*$/i.test(state.responses[0]?.text ?? "")) return null;
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
    if (factIsSufficient(field) && !needsOnsetClarification) return null;
    if (needsOnsetClarification) {
      const labels = unclearOnsetIds.map((id) => getSymptomLabel(id) ?? id.replace(/_/g, " "));
      const labelList = labels.length === 1 ? labels[0]! : labels.join(" and ");
      const clarification = `I have different or unclear timing details for ${labelList}. When did it begin?`;
      if (state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(clarification))) return null;
      return toPlannedQuestion(candidate, "clarification_needed", clarification);
    }
    if (field && ["unclear", "conflicting"].includes(field.status)) {
      const clarification = candidate.followUpQuestion ?? `Could you clarify what you mean about ${candidate.targetField.replace(/_/g, " ")}?`;
      if (state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(clarification))) return null;
      return toPlannedQuestion(candidate, "clarification_needed", clarification);
    }
    if (prior && ["answered", "skipped", "declined"].includes(prior.status) && !needsOnsetClarification) return null;
    if (prior?.status === "requires_clarification" || prior?.status === "partially_answered") {
      const clarification = candidate.followUpQuestion ?? `Could you tell me a little more about ${candidate.targetField.replace(/_/g, " ")}?`;
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
    if (["onset", "additional_symptoms", "progression", "daily_impact"].includes(candidate.targetField)) {
    return hasAnsweredCategory(state, candidate.targetField as InterviewCategory);
  }
  return state.responses.some((response) => response.questionBankId === candidate.id);
}

function makeSymptomOnsetCandidates(state: IntakeState, facts: Map<string, IntakeField>): QuestionDefinition[] {
  const previouslyAskedSymptomIds = new Set<string>();
  const attemptedIds = [
    ...(state.questionHistory ?? []).map((entry) => entry.questionId),
    ...state.responses.map((response) => response.questionBankId ?? ""),
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

function hasAnsweredCategory(state: IntakeState, category: InterviewCategory): boolean {
  const field = state.fields.find((item) => item.fieldId === category);
  if (field && field.status !== "unclear" && field.status !== "conflicting") return true;
  if (category === "daily_impact" && field?.status === "unclear") return false;
  const matchingQuestionIndexes = state.questionsAsked
    .map((question, index) => categoryOfQuestion(question) === category ? index : -1)
    .filter((index) => index >= 0);
  const answeredLinkedQuestion = state.responses.some((response) => {
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

export function createAiService(client: ChatCompleter, retriever: InMemoryRetriever): AiService {
  return {
    startIntake() {
      const assistantMessage = "Hi. I’ll ask a few short questions to help organize what you’d like to discuss with a healthcare professional. What have you been feeling? Share only what you’re comfortable including.";
      const state: IntakeState = {
        schemaVersion: "1.0",
        concern: "",
        responses: [],
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
      const output = parseModelJson(await client.complete(messages, { maxTokens: 800 }));
      try {
        return QuestionAnswerResultSchema.parse({ ...output as Record<string, unknown>, scope });
      } catch {
        throw new AiServiceError("invalid_response", "AMD response did not match the question-answer schema.");
      }
    },

    async continueIntake(rawInput) {
      const input = ContinueIntakeInputSchema.parse(rawInput);
      const state = validateIntakeState(input.state);
      if (state.completion === "completed") {
        return NextTurnResultSchema.parse({ assistantMessage: "This intake is complete.", askedQuestion: null, askedQuestionId: null, fieldUpdates: [] });
      }
      const safety = assessSafety(state);
      if (safety.routed) return { safety, state: { ...state, safety, completion: "ready_for_review" } };

      const latest = input.latestResponseId
        ? state.responses.find((response) => response.id === input.latestResponseId)
        : state.responses.at(-1);
      if (input.latestResponseId && !latest) throw new AiServiceError("invalid_request", "latestResponseId is not in the intake state.");

      const previousQuestion = state.questionsAsked.at(-1) ?? "";
      if (latest && isNoAdditionalSymptomsReply(latest.text) && previousQuestion) {
        const extracted = extractPatientFacts(latest, previousQuestion, latest.questionBankId ?? state.activeQuestionId);
        const legacyContext = !latest.questionBankId && !state.activeQuestionId ? contextualNoneField(previousQuestion, latest.id) : [];
        const fieldUpdates = mergeFieldUpdates(extracted, legacyContext);
        const updatedState = { ...state, fields: mergeFieldUpdates(state.fields, fieldUpdates) };
        const nextPlan = planNextQuestion(updatedState);
        const nextQuestion = nextPlan?.question ?? COMPLETENESS_QUESTION;
        return NextTurnResultSchema.parse({
          assistantMessage: `Understood. ${nextQuestion}`,
          askedQuestion: nextQuestion,
          askedQuestionId: nextPlan?.questionId ?? "completion_check",
          fieldUpdates,
        });
      }

      const extractedFacts = latest ? extractPatientFacts(latest, previousQuestion, latest.questionBankId ?? state.activeQuestionId) : [];
      const currentState = { ...state, fields: mergeFieldUpdates(state.fields, extractedFacts) };

      // Patient symptom turns do not benefit from the project-only knowledge base.
      // Skipping local embedding and irrelevant RAG context keeps this path faster.
      const messages = buildMessages(CONTINUE_OUTPUT_INSTRUCTIONS, [], {
        state: currentState,
        latestResponse: latest ?? null,
        alreadyCovered: summarizeCoveredTopics(state.responses.map((response) => response.text).join("\n")),
        questionsAlreadyAsked: state.questionsAsked.slice(-12),
      });
      const allowedIds = new Set(state.responses.map((response) => response.id));
      let content: string;
      try {
        content = await client.complete(messages, { maxTokens: 600 });
      } catch (error) {
        if (error instanceof AiServiceError && ["invalid_credentials", "rate_limited", "timeout", "provider_unavailable"].includes(error.code)) {
          return makeFallbackIntakeTurn(latest?.text ?? "", currentState, extractedFacts);
        }
        throw error;
      }
      try {
      return normalizeNextTurn(parseModelJson(content), allowedIds, currentState, extractedFacts);
      } catch (error) {
        if (!(error instanceof AiServiceError) || error.code !== "invalid_response") throw error;
        // Do not spend another inference request trying to repair malformed output.
        // Keep the interview moving with a safe clarification and no extracted facts.
        return makeFallbackIntakeTurn(latest?.text ?? "", currentState, extractedFacts);
      }
    },

    async generateBrief(rawInput) {
      const input = GenerateBriefInputSchema.parse(rawInput);
      const state = validateIntakeState(input.state);
      const safety = assessSafety(state);
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

function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const recoveredMessage = recoverAssistantMessage(content);
    if (recoveredMessage) return { assistantMessage: recoveredMessage };
    throw new AiServiceError("invalid_response", "AMD returned content that was not valid JSON.");
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

function makeFallbackIntakeTurn(_latestResponse: string, state: IntakeState, fieldUpdates: IntakeField[] = []): NextTurnResult {
  const nextPlan = planNextQuestion(state);
  const question = nextPlan?.question ?? COMPLETENESS_QUESTION;
  return NextTurnResultSchema.parse({
    assistantMessage: question,
    askedQuestion: question,
    askedQuestionId: nextPlan?.questionId ?? "completion_check",
    fieldUpdates,
  });
}

function normalizeNextTurn(output: unknown, allowedIds: Set<string>, state: IntakeState, extractedFacts: IntakeField[]): NextTurnResult {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new AiServiceError("invalid_response", "AMD returned no structured intake turn.");
  }

  const record = output as Record<string, unknown>;
  const messageValue = record.assistantMessage ?? record.assistant_message ?? record.message ?? record.response;
  if (typeof messageValue !== "string" || !messageValue.trim()) {
    throw new AiServiceError("invalid_response", "AMD intake response did not include a usable assistant message.");
  }
  let assistantMessage = deduplicateQuestions(messageValue.trim());

  const explicitQuestion = record.askedQuestion ?? record.asked_question;
  let askedQuestion = typeof explicitQuestion === "string" && explicitQuestion.trim()
    ? explicitQuestion.trim()
    : extractLastQuestion(assistantMessage);

  const category = askedQuestion ? categoryOfQuestion(askedQuestion) : null;
  if (category && hasAnsweredCategory(state, category)) {
    askedQuestion = nextRequiredInterviewQuestion(state) ?? COMPLETENESS_QUESTION;
    assistantMessage = `Thanks, I have that information. ${askedQuestion}`;
  }

  const knownTopics = new Set(summarizeCoveredTopics(state.responses.map((response) => response.text).join("\n")));
  const askedTopics = askedQuestion ? getMentionedTopics(askedQuestion) : [];
  const alreadyAsked = askedQuestion && state.questionsAsked.some((question) => normalizeQuestion(question) === normalizeQuestion(askedQuestion!));
  const asksWhetherSymptomIsPresent = askedQuestion !== null && /\b(any|have you|do you|are you|did you|noticed|experiencing)\b/i.test(askedQuestion);
  const repeatsCoveredTopic = asksWhetherSymptomIsPresent && askedTopics.length > 0 && askedTopics.every((topic) => knownTopics.has(topic));
  if ((alreadyAsked || repeatsCoveredTopic) && askedQuestion !== COMPLETENESS_QUESTION) {
    askedQuestion = COMPLETENESS_QUESTION;
    const firstQuestionIndex = assistantMessage.indexOf("?");
    assistantMessage = firstQuestionIndex >= 0 ? assistantMessage.slice(0, firstQuestionIndex + 1).trim() : assistantMessage;
  }
  if (/\b(mild fever|mild temperature|slightly above normal|not a high fever|viral illness(?:es)?|common (?:viral )?illness(?:es)?|likely caused by|likely due to|can be caused by|may be caused by|sounds like (?:a|an)|probably (?:a|an))\b/i.test(assistantMessage)) {
    assistantMessage = askedQuestion ? `Thanks for sharing. ${askedQuestion}` : "Thanks for sharing that. A healthcare professional can help assess what may be causing these symptoms.";
  }
  if (/\b(over[- ]the[- ]counter|fever reducers?|take (?:a|any|the) (?:medication|medicine)|rest and (?:drink|stay)|stay hydrated|drink (?:more )?fluids?|may help|will help|usually helpful to)\b/i.test(assistantMessage)) {
    assistantMessage = askedQuestion
      ? `I can’t recommend personal treatment. A clinician can advise you about what is appropriate. ${askedQuestion}`
      : "I can’t recommend personal treatment. A qualified clinician can advise you about what is appropriate.";
  }
  const knownTopicMentions = [...knownTopics].filter((topic) => TOPIC_PATTERNS.find(([id]) => id === topic)?.[1].test(assistantMessage)).length;
  if (knownTopicMentions >= 2 && /\b(you mentioned|you said|you reported|you told me|i have noted|i have recorded|your symptoms include)\b/i.test(assistantMessage)) {
    assistantMessage = askedQuestion ? `Thanks for sharing. ${askedQuestion}` : "Thanks for sharing. Is there anything else you would like your healthcare professional to know?";
  }
  if (askedQuestion && normalizeQuestion(askedQuestion) === normalizeQuestion(COMPLETENESS_QUESTION)) {
    const requiredQuestion = nextRequiredInterviewQuestion(state);
    if (requiredQuestion) {
      const questionStart = assistantMessage.indexOf(askedQuestion);
      const acknowledgement = questionStart >= 0 ? assistantMessage.slice(0, questionStart).trim() : "Thanks for sharing.";
      askedQuestion = requiredQuestion;
      assistantMessage = `${acknowledgement || "Thanks for sharing."} ${requiredQuestion}`;
    }
  }
  const selectedPlan = planNextQuestion(state);
  const selectedQuestion = selectedPlan?.question ?? COMPLETENESS_QUESTION;
  const selectedQuestionId = selectedPlan?.questionId ?? "completion_check";
  const acknowledgement = extractAcknowledgement(assistantMessage);
  askedQuestion = selectedQuestion;
  assistantMessage = `${acknowledgement || "Thanks for sharing."} ${selectedQuestion}`;
  assistantMessage = keepOnlyOneQuestion(assistantMessage, askedQuestion);
  if (askedQuestion && !assistantMessage.includes(askedQuestion)) {
    assistantMessage = `${assistantMessage} ${askedQuestion}`;
  }

  // Patient evidence is extracted by a constrained local parser. The model does not own the intake facts.
  const fieldUpdates = extractedFacts.filter((field) => field.sourceResponseIds.every((id) => allowedIds.has(id)));

  const result = NextTurnResultSchema.safeParse({ assistantMessage, askedQuestion, askedQuestionId: selectedQuestionId, fieldUpdates });
  if (!result.success) {
    throw new AiServiceError("invalid_response", "AMD intake response could not be normalized safely.");
  }
  return result.data;
}

function extractAcknowledgement(message: string): string {
  const firstQuestionMark = message.indexOf("?");
  let acknowledgement = firstQuestionMark >= 0 ? message.slice(0, firstQuestionMark) : message;
  const questionLead = /\b(?:could you tell me|can you tell me|would you tell me|when did|how long|how much|how\b|have you|are you|do you|did you|did it|what|which|who|where|why|is there|are there|has it|have they|does it|is it|was it|were there)\b/i.exec(acknowledgement);
  if (questionLead?.index !== undefined) acknowledgement = acknowledgement.slice(0, questionLead.index);
  return acknowledgement.replace(/[.!?\s]+$/g, "").trim();
}

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["temperature", /\b(temperature|fever|\d{2}\.\d\s*°?\s*c?|\d{2}\.\d)\b/i],
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
  return /^\s*(nothing|none|nope|no|no symptoms)\b[\s,.!?-]*(just what i said|nothing else|no other symptoms?|only that|that'?s it|that is it)?[\s,.!?]*$/i.test(text);
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

function keepOnlyOneQuestion(message: string, askedQuestion: string | null): string {
  if (askedQuestion) {
    const questionIndex = message.lastIndexOf(askedQuestion);
    if (questionIndex >= 0) {
      const prefix = message.slice(0, questionIndex).replace(/[?.!\s]+$/g, "").trim();
      return `${prefix ? `${prefix}. ` : ""}${askedQuestion}`.trim();
    }
  }
  const questionStart = message.indexOf("?");
  if (questionStart < 0) return message;
  const prefix = message.slice(0, questionStart).replace(/[?.!]+\s*$/g, "").trim();
  const question = askedQuestion ?? message.slice(0, questionStart + 1).trim();
  return `${prefix ? `${prefix}. ` : ""}${question}`.trim();
}

function extractLastQuestion(message: string): string | null {
  const questions = message.match(/[^.!?]+\?/g);
  return questions?.at(-1)?.trim() ?? null;
}

export function makeSyntheticSmokePayload(): { prompt: string; expectedSchema: string } {
  return {
    prompt: "Return JSON only with a short intake response and a structured field. Synthetic patient statement: 'I have had a mild headache since yesterday.' Do not diagnose or recommend treatment.",
    expectedSchema: "{assistantMessage:string, fieldId:string, value:string|null, status:string, sourceResponseIds:string[]}",
  };
}
