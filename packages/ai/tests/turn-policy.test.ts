import { describe, expect, it } from "vitest";
import { decideIntakeTurn } from "../src/turn-policy.js";

const candidate = { required: false, safetyRelevant: false };

describe("centralized intake turn policy", () => {
  it("asks a relevant next question after a patient continues with health information", () => {
    expect(decideIntakeTurn({
      intent: "continue", candidate, hasClinicalUpdate: true, hasConcern: true, promptAssessment: false,
    })).toEqual({ askFollowUp: true, offerSummary: false });
  });

  it.each(["acknowledgement", "workflow_question", "recall_request", "summary", "clarification_request"] as const)(
    "does not append an intake question to a %s turn",
    (intent) => {
      expect(decideIntakeTurn({
        intent, candidate, hasClinicalUpdate: false, hasConcern: true, promptAssessment: false,
      })).toEqual({ askFollowUp: false, offerSummary: false });
    },
  );

  it("answers medical guidance first and may continue only when the documented concern has a candidate", () => {
    expect(decideIntakeTurn({
      intent: "guidance_request", candidate, hasClinicalUpdate: true, hasConcern: true, promptAssessment: false,
    }).askFollowUp).toBe(true);
    expect(decideIntakeTurn({
      intent: "guidance_request", candidate, hasClinicalUpdate: true, hasConcern: true, promptAssessment: true,
    })).toEqual({ askFollowUp: false, offerSummary: false });
  });

  it("offers a draft summary when no useful question remains after an intake update", () => {
    expect(decideIntakeTurn({
      intent: "continue", candidate: null, hasClinicalUpdate: true, hasConcern: true, promptAssessment: false,
    })).toEqual({ askFollowUp: false, offerSummary: true });
  });

  it("offers the summary after answering a medical question when the planner has no useful candidate", () => {
    expect(decideIntakeTurn({
      intent: "guidance_request", candidate: null, hasClinicalUpdate: false, hasConcern: true, promptAssessment: false,
    })).toEqual({ askFollowUp: false, offerSummary: true });
  });

  it("does not manufacture an intake question when there is no concern or candidate", () => {
    expect(decideIntakeTurn({
      intent: "continue", candidate: null, hasClinicalUpdate: false, hasConcern: false, promptAssessment: false,
    })).toEqual({ askFollowUp: false, offerSummary: false });
  });
});
