import type { ConversationIntent } from "./conversation.js";

export interface TurnQuestionCandidate {
  required: boolean;
  safetyRelevant: boolean;
}

export interface IntakeTurnPolicyInput {
  intent: ConversationIntent;
  candidate: TurnQuestionCandidate | null;
  hasClinicalUpdate: boolean;
  hasConcern: boolean;
  promptAssessment: boolean;
  openingNoSymptoms?: boolean;
}

export interface IntakeTurnDecision {
  askFollowUp: boolean;
  offerSummary: boolean;
}

/**
 * Decides whether the interview should advance after the assistant handles the
 * patient's current message. A planned question is only a candidate; it is not
 * permission to append a question to every response.
 */
export function decideIntakeTurn(input: IntakeTurnPolicyInput): IntakeTurnDecision {
  if (input.promptAssessment) return { askFollowUp: false, offerSummary: false };

  const candidateIsWorthAsking = Boolean(input.candidate
    && (input.candidate.required || input.candidate.safetyRelevant));
  const canAsk = ["greeting", "vague_opening", "ambiguous_opening"].includes(input.intent) || input.openingNoSymptoms
    || input.intent === "continue"
    || input.intent === "correction" && input.hasClinicalUpdate
    || input.intent === "decline" && candidateIsWorthAsking
    || ["guidance_request", "personal_concern"].includes(input.intent)
      && (candidateIsWorthAsking || input.hasConcern);
  const askFollowUp = Boolean(input.candidate && canAsk);
  const offerSummary = !askFollowUp && input.hasConcern
    && ["continue", "correction", "decline", "guidance_request", "personal_concern"].includes(input.intent);

  return { askFollowUp, offerSummary };
}
