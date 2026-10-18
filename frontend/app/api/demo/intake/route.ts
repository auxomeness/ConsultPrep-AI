import { NextResponse } from "next/server";
import {
  AiServiceError,
  IntakeStateSchema,
  StructuredConsultationBriefSchema,
  assessSafety,
  applyIntakeTurn,
  buildStructuredBrief,
  confirmPatientBrief,
  emergencyContactFromEnvironment,
  interruptIntakeForSafety,
  recordPatientAnswer,
  classifyConversationIntent,
  type IntakeState,
} from "@consultprep/ai";
import { getAiService } from "@/lib/server/ai-service";

type DemoRequest =
  | { operation: "start" }
  | { operation: "turn"; state: IntakeState; text: string }
  | { operation: "retry"; state: IntakeState; latestResponseId: string }
  | { operation: "brief"; state: IntakeState }
  | { operation: "confirm"; state: IntakeState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isSummaryDisplayFollowUp(text: string, state: IntakeState): boolean {
  const asksToSeeIt = /\b(?:show|see|view|display|open|where|here|in chat|find)\b/i.test(text)
    && /\b(?:it|this|that|here|chat|notes?|summary|brief|consultation)\b/i.test(text);
  const recentSummaryRequest = state.responses.slice(-8).some((response) => classifyConversationIntent({ text: response.text }) === "summary");
  return asksToSeeIt && recentSummaryRequest;
}

async function generateSummaryResponse(state: IntakeState) {
  const service = await getAiService();
  const brief = await service.generateBrief({ state });
  const assistantMessage = "Here’s your draft consultation summary. Review it below and correct anything that doesn’t match what you shared. It hasn’t been sent to a clinician.";
  const nextState: IntakeState = {
    ...state,
    completion: "ready_for_review",
    currentIntent: "summary",
    recentAssistantMessages: [...(state.recentAssistantMessages ?? []), assistantMessage].slice(-8),
  };
  return NextResponse.json({ state: nextState, assistantMessage, brief, summaryStatus: "local_draft", safety: false });
}

type TurnDiagnostic = {
  event: "intake_turn";
  responseId: string | null;
  intent: string | null;
  previousPendingAction: "OFFER_SUMMARY" | null;
  selectedAction: "EMERGENCY_INTERRUPT" | "GENERATE_SUMMARY" | "CONTINUE_INTAKE" | "RETRY_SUMMARY" | "RETRY_INTAKE";
  safetyEvaluated: boolean;
  safetyRouted: boolean;
  modelInferenceCalled: boolean;
  summaryBuilderCalled: boolean;
  summaryValidationSucceeded: boolean | null;
  artifactRendered: false;
  persistenceAttempted: false;
  outcome: "success" | "error";
  reason?: string;
};

function logTurnDiagnostic(diagnostic: TurnDiagnostic) {
  if (process.env.NODE_ENV === "development") {
    // Deliberately exclude patient text and extracted health facts.
    console.info("[consultprep:intake]", JSON.stringify(diagnostic));
  }
}

function parseRequest(value: unknown): DemoRequest | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  if (value.operation === "start") {
    return hasOnlyKeys(value, ["operation"]) ? { operation: "start" } : null;
  }
  if (!["turn", "retry", "brief", "confirm"].includes(value.operation)) return null;

  const allowedKeys = value.operation === "turn" ? ["operation", "state", "text"]
    : value.operation === "retry" ? ["operation", "state", "latestResponseId"] : ["operation", "state"];
  if (!hasOnlyKeys(value, allowedKeys)) return null;
  const parsedState = IntakeStateSchema.safeParse(value.state);
  if (!parsedState.success) return null;

  if (value.operation === "turn") {
    if (typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > 8_000) return null;
    return { operation: "turn", state: parsedState.data, text: value.text.trim() };
  }
  if (value.operation === "retry") {
    const latestResponse = parsedState.data.responses.at(-1);
    if (typeof value.latestResponseId !== "string" || !latestResponse || value.latestResponseId !== latestResponse.id) return null;
    return { operation: "retry", state: parsedState.data, latestResponseId: value.latestResponseId };
  }
  return value.operation === "brief"
    ? { operation: "brief", state: parsedState.data }
    : { operation: "confirm", state: parsedState.data };
}

export async function POST(request: Request) {
  let body: unknown;
  let recovery: { state: IntakeState; latestResponseId: string } | null = null;
  let activeDiagnostic: TurnDiagnostic | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Send a valid JSON request." } }, { status: 400 });
  }

  const input = parseRequest(body);
  if (!input) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The intake request is invalid." } }, { status: 400 });
  }

  try {
    switch (input.operation) {
      case "start": {
        const service = await getAiService();
        const result = service.startIntake();
        return NextResponse.json({ state: result.state, assistantMessage: result.assistantMessage });
      }
      case "turn": {
        const diagnostic: TurnDiagnostic = {
          event: "intake_turn",
          responseId: null,
          intent: null,
          previousPendingAction: input.state.recentAssistantMessages?.at(-1)
            && /\b(?:would you like|want me to|shall i)\b[^.!?]{0,120}\b(?:generate|prepare|make|create|show)\b/i.test(input.state.recentAssistantMessages.at(-1)!)
            && /\b(?:summary|notes?|brief|report)\b/i.test(input.state.recentAssistantMessages.at(-1)!) ? "OFFER_SUMMARY" : null,
          selectedAction: "CONTINUE_INTAKE",
          safetyEvaluated: false,
          safetyRouted: false,
          modelInferenceCalled: false,
          summaryBuilderCalled: false,
          summaryValidationSucceeded: null,
          artifactRendered: false,
          persistenceAttempted: false,
          outcome: "success",
        };
        activeDiagnostic = diagnostic;
        if (input.state.completion === "emergency_interrupted" || input.state.safety?.routed) {
          const guidance = input.state.safety?.guidance
            ?? "This intake was interrupted for urgent medical guidance. Please contact emergency services or seek urgent medical help. This tool cannot assess or rule out an emergency.";
          return NextResponse.json({ state: input.state, assistantMessage: guidance, safety: true });
        }
        const recorded = recordPatientAnswer(input.state, input.text);
        diagnostic.responseId = recorded.responseId;
        diagnostic.intent = recorded.state.currentIntent ?? null;
        diagnostic.selectedAction = recorded.state.currentIntent === "summary" ? "GENERATE_SUMMARY" : "CONTINUE_INTAKE";
        recovery = { state: recorded.state, latestResponseId: recorded.responseId };
        const safety = assessSafety(recorded.state, emergencyContactFromEnvironment());
        diagnostic.safetyEvaluated = true;
        if (safety.routed) {
          diagnostic.selectedAction = "EMERGENCY_INTERRUPT";
          diagnostic.safetyRouted = true;
          logTurnDiagnostic(diagnostic);
          const state = interruptIntakeForSafety(recorded.state, safety);
          return NextResponse.json({
            state,
            assistantMessage: safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.",
            safety: true,
          });
        }
        if (recorded.state.currentIntent === "summary" || isSummaryDisplayFollowUp(input.text, recorded.state)) {
          diagnostic.selectedAction = "GENERATE_SUMMARY";
          diagnostic.summaryBuilderCalled = true;
          const response = await generateSummaryResponse(recorded.state);
          diagnostic.summaryValidationSucceeded = true;
          logTurnDiagnostic(diagnostic);
          return response;
        }
        const service = await getAiService();
        diagnostic.modelInferenceCalled = true;
        const result = await service.continueIntake(
          { state: recorded.state, latestResponseId: recorded.responseId },
          request.signal,
        );
        if ("safety" in result) {
          diagnostic.selectedAction = "EMERGENCY_INTERRUPT";
          diagnostic.safetyRouted = true;
          logTurnDiagnostic(diagnostic);
          return NextResponse.json({
            state: result.state,
            assistantMessage: result.safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.",
            safety: true,
          });
        }
        const state = applyIntakeTurn(recorded.state, result);
        logTurnDiagnostic(diagnostic);
        return NextResponse.json({ state, assistantMessage: result.assistantMessage, safety: false });
      }
      case "retry": {
        const isSummaryRetry = input.state.currentIntent === "summary";
        const diagnostic: TurnDiagnostic = {
          event: "intake_turn",
          responseId: input.latestResponseId,
          intent: input.state.currentIntent ?? null,
          previousPendingAction: null,
          selectedAction: isSummaryRetry ? "RETRY_SUMMARY" : "RETRY_INTAKE",
          safetyEvaluated: true,
          safetyRouted: false,
          modelInferenceCalled: !isSummaryRetry,
          summaryBuilderCalled: isSummaryRetry,
          summaryValidationSucceeded: null,
          artifactRendered: false,
          persistenceAttempted: false,
          outcome: "success",
        };
        activeDiagnostic = diagnostic;
        if (input.state.completion === "emergency_interrupted" || input.state.safety?.routed) {
          const guidance = input.state.safety?.guidance
            ?? "This intake was interrupted for urgent medical guidance. Please contact emergency services or seek urgent medical help. This tool cannot assess or rule out an emergency.";
          return NextResponse.json({ state: input.state, assistantMessage: guidance, safety: true });
        }
        recovery = { state: input.state, latestResponseId: input.latestResponseId };
        const safety = assessSafety(input.state, emergencyContactFromEnvironment());
        if (safety.routed) {
          const state = interruptIntakeForSafety(input.state, safety);
          return NextResponse.json({ state, assistantMessage: safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.", safety: true });
        }
        if (isSummaryRetry) {
          const response = await generateSummaryResponse(input.state);
          diagnostic.summaryValidationSucceeded = true;
          logTurnDiagnostic(diagnostic);
          return response;
        }
        const service = await getAiService();
        const result = await service.continueIntake(
          { state: input.state, latestResponseId: input.latestResponseId },
          request.signal,
        );
        if ("safety" in result) {
          return NextResponse.json({
            state: result.state,
            assistantMessage: result.safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.",
            safety: true,
          });
        }
        const state = applyIntakeTurn(input.state, result);
        logTurnDiagnostic(diagnostic);
        return NextResponse.json({ state, assistantMessage: result.assistantMessage, safety: false });
      }
      case "brief": {
        if (input.state.safety?.routed || input.state.completion === "emergency_interrupted") {
          return NextResponse.json({ error: { code: "SAFETY_ROUTED", message: "Routine summary generation is stopped so you can focus on getting help." } }, { status: 409 });
        }
        const service = await getAiService();
        const brief = await service.generateBrief({ state: input.state });
        return NextResponse.json({ brief: StructuredConsultationBriefSchema.parse(brief) });
      }
      case "confirm": {
        if (input.state.safety?.routed || input.state.completion === "emergency_interrupted") {
          return NextResponse.json({ error: { code: "SAFETY_ROUTED", message: "This intake was stopped for urgent guidance." } }, { status: 409 });
        }
        const confirmedState = confirmPatientBrief(input.state);
        const brief = buildStructuredBrief(confirmedState, true);
        return NextResponse.json({ state: confirmedState, brief: StructuredConsultationBriefSchema.parse(brief) });
      }
    }
  } catch (error) {
    if (activeDiagnostic) {
      activeDiagnostic.outcome = "error";
      activeDiagnostic.reason = error instanceof AiServiceError ? error.code : "unexpected_error";
      if (activeDiagnostic.summaryBuilderCalled) activeDiagnostic.summaryValidationSucceeded = false;
      logTurnDiagnostic(activeDiagnostic);
    }
    const isAiError = error instanceof AiServiceError;
    if (isAiError && error.code === "cancelled") return new Response(null, { status: 499 });
    const code = isAiError && error.code === "timeout" ? "AI_TIMEOUT"
      : isAiError && error.code === "invalid_response" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
    const status = code === "AI_TIMEOUT" ? 504 : code === "AI_INVALID_RESPONSE" ? 502 : 503;
    const summaryFailure = activeDiagnostic?.summaryBuilderCalled === true;
    const message = summaryFailure ? "I couldn’t generate the draft summary. Your answer is saved in this browser; choose Try again to retry the summary."
      : code === "AI_TIMEOUT" ? "The AI service did not respond in time. Your answer is still in this browser; you can try again."
      : code === "AI_INVALID_RESPONSE" ? "The AI service returned an unusable response. Your answer is still in this browser; you can try again."
        : "The AI service is unavailable or not configured. Your answer is still in this browser; you can try again.";
    return NextResponse.json({
      ...(recovery ? { state: recovery.state, pendingResponseId: recovery.latestResponseId } : {}),
      error: { code: summaryFailure ? "SUMMARY_GENERATION_FAILED" : code, message },
    }, { status: summaryFailure ? 500 : status });
  }
}
