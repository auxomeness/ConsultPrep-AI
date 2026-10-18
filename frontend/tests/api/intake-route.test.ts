import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStructuredBrief, type IntakeState } from "@consultprep/ai";

const getAiServiceMock = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-service", () => ({ getAiService: getAiServiceMock }));

import { POST } from "../../app/api/demo/intake/route";

const stateWithOffer = (): IntakeState => ({
  schemaVersion: "1.0",
  concern: "",
  responses: [{ id: "response-1", text: "I have a mild sore throat since yesterday.", sequence: 0 }],
  recentAssistantMessages: ["Would you like me to generate a draft consultation summary now? You can show it to your doctor."],
  fields: [
    { fieldId: "primary_concern", value: "Sore throat", status: "reported", sourceResponseIds: ["response-1"] },
    { fieldId: "sore_throat", value: "Sore throat", status: "reported", sourceResponseIds: ["response-1"] },
    { fieldId: "symptom_onset_sore_throat", value: "Yesterday", status: "reported", sourceResponseIds: ["response-1"] },
  ],
  questionsAsked: ["Would you like me to generate a draft consultation summary now? You can show it to your doctor."],
  completion: "ready_for_review",
});

function mockAiService(overrides: { failSummary?: boolean } = {}) {
  const service = {
    startIntake: vi.fn(),
    continueIntake: vi.fn(async () => ({ assistantMessage: "Routine response", askedQuestion: null, askedQuestionId: null, fieldUpdates: [] })),
    generateBrief: vi.fn(async ({ state }: { state: IntakeState }) => {
      if (overrides.failSummary) throw new Error("synthetic builder failure");
      return buildStructuredBrief(state);
    }),
    answerQuestion: vi.fn(),
  };
  getAiServiceMock.mockResolvedValue(service);
  return service;
}

async function postTurn(state: IntakeState, text: string) {
  const request = new Request("http://localhost/api/demo/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "turn", state, text }),
  });
  return POST(request);
}

describe("intake summary action route", () => {
  beforeEach(() => {
    getAiServiceMock.mockReset();
  });

  it("executes and returns a validated draft after a typoed contextual acceptance", async () => {
    const service = mockAiService();
    const response = await postTurn(stateWithOffer(), "yes pleae");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summaryStatus).toBe("local_draft");
    expect(body.brief.status).toBe("ai_generated_draft");
    expect(body.brief.sourceTraceability).toContainEqual({ responseId: "response-1", originalText: "I have a mild sore throat since yesterday." });
    expect(body.assistantMessage).toContain("hasn’t been sent to a clinician");
    expect(body.assistantMessage).not.toMatch(/would you like me to generate/i);
    expect(service.generateBrief).toHaveBeenCalledOnce();
    expect(service.continueIntake).not.toHaveBeenCalled();
  });

  it.each(["draft consultation summary now", "show me my consultation notes", "I want to review my notes"]) (
    "executes an explicit summary action without relying on a pending offer: %s",
    async (text) => {
      const service = mockAiService();
      const state = { ...stateWithOffer(), recentAssistantMessages: ["Have you noticed anything else?"], questionsAsked: ["Have you noticed anything else?"] };
      const response = await postTurn(state, text);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.summaryStatus).toBe("local_draft");
      expect(body.brief.sourceTraceability).toContainEqual({ responseId: "response-1", originalText: "I have a mild sore throat since yesterday." });
      expect(service.generateBrief).toHaveBeenCalledOnce();
      expect(service.continueIntake).not.toHaveBeenCalled();
    },
  );

  it("returns an honest, retryable error when summary generation fails", async () => {
    const service = mockAiService({ failSummary: true });
    const response = await postTurn(stateWithOffer(), "yes please");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("SUMMARY_GENERATION_FAILED");
    expect(body.error.message).toMatch(/couldn’t generate the draft summary/i);
    expect(body.pendingResponseId).toBe("response-2");
    expect(body.state.responses.at(-1).text).toBe("yes please");
    expect(service.generateBrief).toHaveBeenCalledOnce();
    expect(service.continueIntake).not.toHaveBeenCalled();
  });
});
