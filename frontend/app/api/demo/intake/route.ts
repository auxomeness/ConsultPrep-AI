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
  type IntakeState,
} from "@consultprep/ai";
import { getAiService } from "@/lib/server/ai-service";

type DemoRequest =
  | { operation: "start" }
  | { operation: "turn"; state: IntakeState; text: string }
  | { operation: "brief"; state: IntakeState }
  | { operation: "confirm"; state: IntakeState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseRequest(value: unknown): DemoRequest | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  if (value.operation === "start") {
    return hasOnlyKeys(value, ["operation"]) ? { operation: "start" } : null;
  }
  if (!["turn", "brief", "confirm"].includes(value.operation)) return null;

  const allowedKeys = value.operation === "turn" ? ["operation", "state", "text"] : ["operation", "state"];
  if (!hasOnlyKeys(value, allowedKeys)) return null;
  const parsedState = IntakeStateSchema.safeParse(value.state);
  if (!parsedState.success) return null;

  if (value.operation === "turn") {
    if (typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > 8_000) return null;
    return { operation: "turn", state: parsedState.data, text: value.text.trim() };
  }
  return value.operation === "brief"
    ? { operation: "brief", state: parsedState.data }
    : { operation: "confirm", state: parsedState.data };
}

export async function POST(request: Request) {
  let body: unknown;
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
        if (input.state.completion === "emergency_interrupted" || input.state.safety?.routed) {
          const guidance = input.state.safety?.guidance
            ?? "This intake was interrupted for urgent medical guidance. Please contact emergency services or seek urgent medical help. This tool cannot assess or rule out an emergency.";
          return NextResponse.json({ state: input.state, assistantMessage: guidance, safety: true });
        }
        const recorded = recordPatientAnswer(input.state, input.text);
        const safety = assessSafety(recorded.state, emergencyContactFromEnvironment());
        if (safety.routed) {
          const state = interruptIntakeForSafety(recorded.state, safety);
          return NextResponse.json({
            state,
            assistantMessage: safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.",
            safety: true,
          });
        }
        const service = await getAiService();
        const result = await service.continueIntake(
          { state: recorded.state, latestResponseId: recorded.responseId },
          request.signal,
        );
        if ("safety" in result) {
          return NextResponse.json({
            state: result.state,
            assistantMessage: result.safety.guidance ?? "Please seek urgent medical help now. This tool cannot assess or rule out an emergency.",
            safety: true,
          });
        }
        const state = applyIntakeTurn(recorded.state, result);
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
    const isAiError = error instanceof AiServiceError;
    if (isAiError && error.code === "cancelled") return new Response(null, { status: 499 });
    const code = isAiError && error.code === "timeout" ? "AI_TIMEOUT"
      : isAiError && error.code === "invalid_response" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
    const status = code === "AI_TIMEOUT" ? 504 : code === "AI_INVALID_RESPONSE" ? 502 : 503;
    const message = code === "AI_TIMEOUT" ? "The AI service did not respond in time. Your answer is still in this browser; you can try again."
      : code === "AI_INVALID_RESPONSE" ? "The AI service returned an unusable response. Your answer is still in this browser; you can try again."
        : "The AI service is unavailable or not configured. Your answer is still in this browser; you can try again.";
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
