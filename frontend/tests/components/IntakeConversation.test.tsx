import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IntakeConversation from "../../components/patient/IntakeConversation";

const startState = {
  schemaVersion: "1.0",
  concern: "",
  responses: [],
  fields: [],
  questionsAsked: ["What have you been feeling?"],
  activeQuestionId: "main_concern",
  completion: "in_progress",
};

afterEach(() => vi.unstubAllGlobals());

describe("IntakeConversation", () => {
  it("starts an AI intake from the centered first-message composer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "When did it start?", safety: false }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Synthetic concern");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    const assistantTurns = await screen.findAllByRole("article", { name: "ConsultPrep" });
    const opening = assistantTurns[0]!;
    expect(opening.textContent).toContain("What have you been feeling?");
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/intake", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ operation: "start" }),
    }));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/demo/intake", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"text":"Synthetic concern"'),
    }));
  });

  it("sends a patient answer to the server and renders its next AI turn", async () => {
    const user = userEvent.setup();
    const nextState = { ...startState, concern: "Synthetic stomach discomfort", responses: [{ id: "response-1", text: "Synthetic stomach discomfort" }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nextState, assistantMessage: "When did it begin?", safety: false }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Synthetic stomach discomfort");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    expect(await screen.findByText("When did it begin?")).toBeTruthy();
    expect(screen.getAllByText("Synthetic stomach discomfort").length).toBeGreaterThan(0);
    const sentTurn = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as { operation: string; text: string; state: typeof startState };
    expect(sentTurn).toMatchObject({ operation: "turn", text: "Synthetic stomach discomfort", state: startState });
  });

  it("keeps a failed answer in the conversation and retries it without adding it twice", async () => {
    const user = userEvent.setup();
    const recordedState = {
      ...startState,
      responses: [{ id: "response-1", text: "Synthetic answer retained after failure", sequence: 0 }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({
        state: recordedState,
        pendingResponseId: "response-1",
        error: { message: "The AI service could not process this answer." },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        state: recordedState,
        assistantMessage: "When did it begin?",
        safety: false,
      }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    const answer = screen.getByRole("textbox", { name: "Your answer" });
    await user.type(answer, "Synthetic answer retained after failure");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The AI service could not process this answer.");
    expect(answer).toHaveProperty("value", "");
    expect(screen.getByText("Synthetic answer retained after failure")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("When did it begin?")).toBeTruthy();
    const retry = JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string) as Record<string, unknown>;
    expect(retry).toMatchObject({ operation: "retry", latestResponseId: "response-1", state: recordedState });
    expect(screen.getAllByText("Synthetic answer retained after failure")).toHaveLength(1);
  });

  it("does not render malformed JSON as an assistant chat message and keeps the answer retryable", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        state: { ...startState, responses: [{ id: "response-1", text: "Synthetic headache", sequence: 0 }] },
        assistantMessage: '{"assistantMessage":"partial patient-facing reply',
        safety: false,
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        state: { ...startState, responses: [{ id: "response-1", text: "Synthetic headache", sequence: 0 }] },
        assistantMessage: "When did it begin?",
        safety: false,
      }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Synthetic headache");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/response was malformed/i);
    expect(screen.queryByText(/\{"assistantMessage"/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("When did it begin?")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/demo/intake", expect.objectContaining({
      body: expect.stringContaining('"latestResponseId":"response-1"'),
    }));
  });
});
