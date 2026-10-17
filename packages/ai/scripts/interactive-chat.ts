import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDefaultRetriever } from "../src/rag.js";
import { createAiService } from "../src/service.js";
import { LocalQwenChatClient } from "../src/local-fallback-client.js";
import type { IntakeField, IntakeState, QuestionHistoryEntry } from "../src/contracts.js";
import { COMPLETENESS_QUESTION, nextRequiredInterviewQuestion } from "../src/service.js";
import { assessSafety, urgentGuidanceForText } from "../src/safety.js";
import { classifyConversationIntent, isNoAdditionalInformation } from "../src/conversation.js";
import { extractPatientFacts, mergeFieldUpdates } from "../src/intake-facts.js";
import { buildStructuredBrief, formatStructuredBrief, PROFESSIONAL_ADVICE_WARNING } from "../src/brief.js";
import { confirmPatientBrief, recordPatientCorrection } from "../src/workflow.js";
import { QUESTION_BANK } from "../src/question-bank.js";

const confirmation = process.env.LOCAL_INTAKE_CHAT_CONFIRM;
if (confirmation !== "START_INTERACTIVE_CHAT") {
  console.error("Refusing to start. Set LOCAL_INTAKE_CHAT_CONFIRM=START_INTERACTIVE_CHAT to start the local interview.");
  process.exitCode = 2;
} else {
  await startChat();
}

async function startChat(): Promise<void> {
  try {
    const retriever = await createDefaultRetriever();
    const client = new LocalQwenChatClient();
    const service = createAiService(client, retriever);
    const terminal = createInterface({ input: stdin, output: stdout });
    let state: IntakeState = service.startIntake().state;
    let phase: "interview" | "confirming_symptoms" | "confirming_summary" = "interview";
    let draftSummary = "";

    console.log(`ConsultPrep local intake interview is ready. I’m an AI assistant, not a doctor. ${PROFESSIONAL_ADVICE_WARNING} Replies are generated on this device. No AMD or other hosted inference API is called. The first reply may take longer while local models load. Type /summary to review or /exit to stop.`);
    console.log(`\nConsultPrep: ${state.questionsAsked[0]}`);
    try {
      while (true) {
        let patientText: string;
        try {
          patientText = (await terminal.question("\nYou: ")).trim();
        } catch {
          break;
        }
        if (!patientText) continue;
        if (patientText.toLowerCase() === "/exit") break;

        const incomingUrgentGuidance = urgentGuidanceForText(patientText);
        if (incomingUrgentGuidance) {
          appendPatientResponse(patientText);
          const safety = assessSafety(state);
          state = { ...state, safety, completion: "ready_for_review" };
          console.log(`\nConsultPrep: ${incomingUrgentGuidance}`);
          break;
        }

        const intent = classifyConversationIntent({ text: patientText, isFirstPatientTurn: state.responses.length === 0 });
        if (intent === "ambiguous_opening") {
          console.log(`\nConsultPrep: I’m not sure what you mean by “${patientText}.” What health concern would you like to organize for your consultation?`);
          continue;
        }

        if (intent === "greeting") {
          console.log("\nConsultPrep: Hi! What health concern would you like to talk through today?");
          continue;
        }

        if (intent === "identity_question") {
          console.log("\nConsultPrep: I’m ConsultPrep, an AI assistant—not a doctor. I can help organize what you share into a draft for a healthcare professional. What would you like to talk about today?");
          continue;
        }

        if (intent === "eye_care_navigation") {
          appendPatientResponse(patientText);
          const question = "When did the soreness start?";
          recordAskedQuestion(question, "onset");
          console.log("\nConsultPrep: An optometrist or eye clinic can assess sore eyes. If you have severe pain, sudden vision changes, an eye injury, or something stuck in your eye, seek urgent medical care. When did the soreness start?");
          continue;
        }

        if (intent === "frightened_about_dying") {
          appendPatientResponse(patientText);
          const question = "What are you noticing right now that makes you feel this way?";
          recordAskedQuestion(question, "patient_goal");
          console.log("\nConsultPrep: I’m really sorry you’re feeling this scared. That sounds frightening, and I’m here to listen. If you feel in immediate danger, please contact your local emergency service or ask someone nearby to help now. What are you noticing right now that makes you feel this way?");
          continue;
        }

        if (intent === "vague_opening") {
          console.log("\nConsultPrep: I’m sorry things feel difficult right now. You can share only what you’re comfortable with. Is this mainly about your physical health, how you’re feeling emotionally, or something else?");
          continue;
        }

        if (intent === "care_service_request") {
          appendPatientResponse(patientText);
          console.log("\nConsultPrep: I’ve noted that request in your summary for the clinician. This demo can’t search for or book local services, or order tests. A clinician can help you decide the next step.");
          continue;
        }

        if (intent === "summary") {
          if (state.responses.length === 0) console.log("\nThere are no answers to summarize yet.");
          else console.log(`\nConsultPrep summary (AI-generated draft; based only on what you shared):\n${formatPatientSummary(state)}\n\nThis terminal demo only displays the draft; it does not save or send it.`);
          continue;
        }

        const existingSafety = assessSafety(state);
        if (existingSafety.routed) {
          console.log(`\nConsultPrep: ${existingSafety.guidance}`);
          break;
        }

        if (intent === "finish") {
          if (state.responses.length === 0) console.log("\nThere are no patient details to summarize. The interview is finished.");
          else {
            state = { ...state, completion: "ready_for_review" };
            console.log(`\nConsultPrep summary (AI-generated draft; not confirmed):\n${formatPatientSummary(state)}`);
            console.log("\nConsultPrep: The interview is finished. This terminal demo has not saved or sent the draft; you would need to share it with a clinician yourself. The clinician determines any assessment and next steps.");
          }
          break;
        }

        if (intent === "workflow_question") {
          appendPatientResponse(patientText);
          console.log("\nConsultPrep: This intake organizes what you have shared into a draft. Type /summary to view it or /exit to stop. This terminal demo does not save or send the information to a clinician, so you would need to share it yourself. A clinician can advise you about your personal situation; if symptoms feel severe or rapidly worsen, seek urgent local medical care.");
          continue;
        }

        if (phase === "confirming_symptoms" && (isConfirmation(patientText) || isNoAdditionalInformation(patientText))) {
          draftSummary = formatPatientSummary(state);
          console.log(`\nConsultPrep summary (draft, based on what you shared):\n${draftSummary}`);
          console.log("\nConsultPrep: Does this accurately capture what you’ve told me? Say yes to confirm, or tell me what to correct.");
          phase = "confirming_summary";
          continue;
        }

        if (phase === "confirming_summary" && isConfirmation(patientText)) {
          state = confirmPatientBrief(state);
          console.log(`\nConsultPrep: Thank you for confirming. This summary is confirmed locally, but this terminal demo has not sent it to a clinician.\n\n${formatPatientSummary(state, true)}`);
          break;
        }

        if (phase === "confirming_summary") {
          state = recordPatientCorrection(state, patientText);
          draftSummary = formatPatientSummary(state);
          console.log(`\nConsultPrep: Thanks for correcting that. Here’s the updated draft:\n\n${draftSummary}\n\nDoes this updated summary look accurate? Say yes to confirm, or tell me what still needs correcting.`);
          continue;
        }

        const alreadyAnswered = /\b(i already answered|i told you|i said that already|as i said)\b/i.test(patientText);
        if (alreadyAnswered) {
          const nextQuestion = nextRequiredInterviewQuestion(state);
          if (nextQuestion) {
            phase = "interview";
            recordAskedQuestion(nextQuestion);
            console.log(`\nConsultPrep: You’re right—I’ll use the information you already gave me. ${nextQuestion}`);
          } else {
            phase = "confirming_symptoms";
            console.log(`\nConsultPrep: You’re right—I’ll use the information you already gave me. ${COMPLETENESS_QUESTION}`);
          }
          continue;
        }

        const answeringQuestionDuringWrapUp = phase === "confirming_symptoms" && patientText.includes("?");
        if (phase === "confirming_symptoms" && !isConfirmation(patientText) && !answeringQuestionDuringWrapUp) {
          phase = "interview";
        }

        try {
          const wasConfirmingSymptoms = phase === "confirming_symptoms" || answeringQuestionDuringWrapUp;
          const responseId = appendPatientResponse(patientText);
          const result = await service.continueIntake({ state, latestResponseId: responseId });
          if ("safety" in result) {
            state = result.state;
            console.log(`\nConsultPrep: ${result.safety.guidance}`);
            break;
          }
          state = applyIntakeTurn(state, result);
          if (wasConfirmingSymptoms || isCompletenessQuestion(result.askedQuestion)) phase = "confirming_symptoms";
          console.log(`\nConsultPrep: ${result.assistantMessage}`);
        } catch (error) {
          // No retry; another request happens only after another user-entered question.
          console.error(`\nInterview request failed: ${error instanceof Error ? error.message : "AI service error."}`);
        }
      }
    } finally {
      terminal.close();
    }

    function appendPatientResponse(text: string, correctsResponseId?: string): string {
      const activeQuestion = state.questionsAsked.at(-1) ?? "";
      const activeQuestionId = state.activeQuestionId;
      const responseId = `response-${state.responses.length + 1}`;
      state = {
        ...state,
        concern: state.concern || text,
        responses: [...state.responses, {
          id: responseId,
          text,
          sequence: state.responses.length,
            ...(state.questionsAsked.at(-1) ? { questionId: state.questionsAsked.at(-1)! } : {}),
          ...(activeQuestionId ? { questionBankId: activeQuestionId } : {}),
          ...(correctsResponseId ? { correctsResponseId } : {}),
          createdAt: new Date().toISOString(),
        }],
      };
      const response = state.responses.at(-1)!;
      const factUpdates = extractPatientFacts(response, activeQuestion, activeQuestionId);
      state = { ...state, fields: mergeFieldUpdates(state.fields, factUpdates) };
      if (activeQuestionId) state = markQuestionAnswered(state, activeQuestionId, responseId, factUpdates, text);
      return responseId;
    }

    function recordAskedQuestion(question: string, questionId?: string): void {
      const resolvedQuestionId = questionId ?? QUESTION_BANK.find((candidate) => normalize(candidate.question) === normalize(question))?.id ?? "completion_check";
      if (state.questionsAsked.some((existing) => normalize(existing) === normalize(question))) {
        state = { ...state, activeQuestionId: resolvedQuestionId };
        return;
      }
      if (!state.questionsAsked.some((existing) => normalize(existing) === normalize(question))) {
        const history = state.questionHistory ?? [];
        state = {
          ...state,
          activeQuestionId: resolvedQuestionId,
          questionsAsked: [...state.questionsAsked, question],
          questionHistory: [...history, { questionId: resolvedQuestionId, targetField: QUESTION_BANK.find((item) => item.id === resolvedQuestionId)?.targetField ?? resolvedQuestionId, status: "asked", sourceResponseIds: [] }],
        };
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not start the Q&A chat.");
    process.exitCode = 1;
  }
}

function applyIntakeTurn(state: IntakeState, result: { fieldUpdates: IntakeField[]; askedQuestion: string | null; askedQuestionId?: string | null | undefined }): IntakeState {
  const fields = new Map(state.fields.map((field) => [field.fieldId, field]));
  for (const field of result.fieldUpdates) fields.set(field.fieldId, field);
  const questionId = result.askedQuestionId ?? "completion_check";
  const alreadyLogged = (state.questionHistory ?? []).some((entry) => entry.questionId === questionId && entry.status === "asked");
  return {
    ...state,
    fields: [...fields.values()],
    activeQuestionId: questionId,
    questionHistory: alreadyLogged ? state.questionHistory : [...(state.questionHistory ?? []), {
      questionId,
      targetField: QUESTION_BANK.find((item) => item.id === questionId)?.targetField ?? questionId,
      status: "asked",
      sourceResponseIds: [],
    }],
    questionsAsked: result.askedQuestion && !state.questionsAsked.some((question) => normalize(question) === normalize(result.askedQuestion!))
      ? [...state.questionsAsked, result.askedQuestion]
      : state.questionsAsked,
  };
}

function markQuestionAnswered(state: IntakeState, questionId: string, responseId: string, updates: IntakeField[], responseText: string): IntakeState {
  const target = QUESTION_BANK.find((question) => question.id === questionId)?.targetField ?? (questionId.startsWith("symptom_onset__") ? "symptom_onset" : questionId);
  const fact = updates.find((field) => field.fieldId === target || (target === "symptom_onset" && field.fieldId.startsWith("symptom_onset_")));
  const prior = (state.questionHistory ?? []).filter((entry) => entry.questionId === questionId).at(-1);
  const status: QuestionHistoryEntry["status"] = fact?.status === "declined" ? "declined"
    : fact?.status === "unclear" ? "requires_clarification"
      : fact?.status === "unknown" || fact?.status === "patient_denied" || fact?.status === "reported" || fact?.status === "patient_corrected" ? "answered"
        : prior && ["requires_clarification", "partially_answered"].includes(prior.status) ? "answered"
          : responseText.trim().length < 3 ? "partially_answered" : "requires_clarification";
  const history = [...(state.questionHistory ?? [])];
  const index = history.map((entry) => entry.questionId).lastIndexOf(questionId);
  const entry: QuestionHistoryEntry = {
    questionId,
    targetField: target,
    status,
    sourceResponseIds: [responseId],
  };
  if (index >= 0) history[index] = entry;
  else history.push(entry);
  return { ...state, questionHistory: history };
}

function isConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (/\b(no|not|but|except|correction|change|wrong|inaccurate|forgot|also|add)\b/i.test(normalized)) return false;
  return /^(yes|yeah|yep|none\b|nothing\b|nope\b|that'?s all\b|that is all\b|that is everything\b|that'?s everything\b|everything i'?ve been feeling\b|nothing else\b|all i have\b|all i'?m feeling\b|correct\b|looks accurate\b|accurate\b|everything is accurate\b)/i.test(normalized);
}

function isCompletenessQuestion(question: string | null): boolean {
  return question !== null && normalize(question) === normalize(COMPLETENESS_QUESTION);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatPatientSummary(state: IntakeState, confirmed = false): string {
  return formatStructuredBrief(buildStructuredBrief(state, confirmed));
}

