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
    expect(assistantTurns[0].textContent).toContain("What have you been feeling?");
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
    const originalAnswer = "  Synthetic stomach discomfort  ";
    const nextState = { ...startState, concern: originalAnswer, responses: [{ id: "response-1", text: originalAnswer }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nextState, assistantMessage: "When did it begin?", safety: false }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), originalAnswer);
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    expect(await screen.findByText("When did it begin?")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Your response" }).textContent).toContain(originalAnswer);
    const sentTurn = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as { operation: string; text: string; state: typeof startState };
    expect(sentTurn).toMatchObject({ operation: "turn", text: originalAnswer, state: startState });
  });

  it("keeps the answer in the field and shows a safe error if the server fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: startState, assistantMessage: "What have you been feeling?" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "The AI service could not process this answer." } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntakeConversation />);

    const answer = screen.getByRole("textbox", { name: "Your answer" });
    await user.type(answer, "Synthetic answer retained after failure");
    await user.click(screen.getByRole("button", { name: "Send answer" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The AI service could not process this answer.");
    expect(answer).toHaveProperty("value", "Synthetic answer retained after failure");
  });
});
