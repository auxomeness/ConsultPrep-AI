import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  template: vi.fn(() => "prompt"),
  generate: vi.fn(async (_prompt: string, _options: { stopping_criteria: { criteria: Array<{ interrupted?: boolean }> } }) => [{ generated_text: '{"assistantMessage":"You reported 37.5 degrees.","askedQuestion":null}' }]),
}));
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(async () => Object.assign(mocks.generate, { tokenizer: { apply_chat_template: mocks.template } })),
  InterruptableStoppingCriteria: class {
    interrupted = false;
    interrupt() { this.interrupted = true; }
  },
  StoppingCriteriaList: class {
    criteria: Array<unknown> = [];
    push(criterion: unknown) { this.criteria.push(criterion); }
  },
}));
import { LocalQwenChatClient } from "../src/local-fallback-client.js";

describe("local model conversation context", () => {
  it("retains all original answers and facts, including early details beyond the old eight-field limit", async () => {
    const responses = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, text: i === 0 ? `${"x".repeat(400)} 37.5 degrees` : `answer ${i}`, questionId: `question ${i}` }));
    const fields = Array.from({ length: 20 }, (_, i) => ({ fieldId: `fact${i}`, value: `value ${i}`, status: "reported" }));
    await new LocalQwenChatClient().complete([{ role: "user", content: JSON.stringify({
      task: "Conduct a brief pre-consultation interview", data: { state: { concern: `${"x".repeat(400)} 37.5 degrees`, responses, fields }, latestResponse: { text: "WHAT IS IT" }, patientIntent: "recall_request", recallEvidence: "37.5 degrees" },
    }) }], { maxTokens: 180 });
    const messages = mocks.template.mock.calls[0] as unknown as [Array<{ role: string; content: string }>];
    const data = JSON.parse(messages[0][1]!.content).data;
    expect(data.conversation).toHaveLength(20);
    expect(data.conversation[0].answer).toContain("37.5 degrees");
    expect(data.recordedFacts).toHaveLength(20);
    expect(data.conversation[0].answer).toHaveLength(413);
    expect(data).not.toHaveProperty("concern");
    expect(data).not.toHaveProperty("latestResponse");
    expect(data.recallEvidence).toBe("37.5 degrees");
    expect(messages[0][0]!.content).toContain("do not echo a full answer");
    expect(messages[0][0]!.content).toContain("no labels, JSON, or markdown");
    expect(messages[0][0]!.content).toContain("Use plain text only: a concise patient-facing sentence");
    expect(messages[0][0]!.content).toContain("Never recommend or name a medication, pain reliever, or dose");
    expect(mocks.generate).toHaveBeenCalledWith("prompt", expect.objectContaining({ max_new_tokens: 180, do_sample: false, stopping_criteria: expect.any(Object) }));
  });

  it("wraps local plain-text intake generation after generation to avoid truncating a JSON envelope", async () => {
    mocks.generate.mockImplementationOnce(async () => [{ generated_text: "That sounds uncomfortable." }]);
    const client = new LocalQwenChatClient();
    const result = await client.complete([{ role: "user", content: JSON.stringify({
      task: "Conduct a brief pre-consultation interview", data: { state: { responses: [], fields: [] }, latestResponse: { text: "My head hurts" }, patientIntent: "continue" },
    }) }], { maxTokens: 32 });

    expect(JSON.parse(result)).toEqual({ assistantMessage: "That sounds uncomfortable.", askedQuestion: null });
    const messages = mocks.template.mock.calls.at(-1) as unknown as [Array<{ role: string; content: string }>];
    expect(messages[0][1]!.content).toContain('"outputFormat":"plain_text"');
    expect(messages[0][1]!.content).not.toMatch(/Return JSON|Reply in JSON/);
  });

  it.each([
    '{"assistantMessage":"I have a crushing headache and cramping. Where do you feel the headache?',
    JSON.stringify({ assistantMessage: JSON.stringify({ assistantMessage: "I’ve noted that detail." }), askedQuestion: null }),
  ])("recovers nested or truncated local-model JSON as patient-facing text", async (raw) => {
    mocks.generate.mockImplementationOnce(async () => [{ generated_text: raw }]);
    const client = new LocalQwenChatClient();
    const result = await client.complete([{ role: "user", content: JSON.stringify({
      task: "Conduct a brief pre-consultation interview",
      data: { state: { responses: [], fields: [] }, latestResponse: { text: "I have a headache" }, patientIntent: "continue" },
    }) }], { maxTokens: 18 });

    const parsed = JSON.parse(result) as { assistantMessage: string };
    expect(parsed.assistantMessage).not.toMatch(/^\s*\{/);
    expect(parsed.assistantMessage).not.toContain('"assistantMessage"');
    expect(parsed.assistantMessage).toMatch(/headache|noted that detail/i);
  });

  it("puts the exact latest patient message next to the full history for direct questions", async () => {
    const client = new LocalQwenChatClient();
    await client.complete([{ role: "user", content: JSON.stringify({
      task: "Conduct a brief pre-consultation interview",
      data: {
        state: { responses: [{ id: "r1", text: "I have a headache" }], fields: [] },
        latestResponse: { text: "What can I do to ease the pain?" },
        patientIntent: "guidance_request",
      },
    }) }], { maxTokens: 36 });

    const messages = mocks.template.mock.calls.at(-1) as unknown as [Array<{ role: string; content: string }>];
    const payload = JSON.parse(messages[0][1]!.content);
    expect(payload.data.latestPatientMessage).toBe("What can I do to ease the pain?");
    expect(payload.data.conversation).toEqual([{ answer: "I have a headache" }]);
    expect(payload.task).toContain("Answer latestPatientMessage directly");
    expect(payload.task).toContain("safe non-medication next step");
  });

  it("interrupts local token generation when the request is stopped", async () => {
    let finishGeneration!: (output: Array<{ generated_text: string }>) => void;
    let notifyStarted!: () => void;
    let generationOptions: { stopping_criteria: { criteria: Array<{ interrupted?: boolean }> } } | undefined;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    mocks.generate.mockImplementationOnce((_prompt, options) => new Promise((resolve) => {
      generationOptions = options;
      finishGeneration = resolve;
      notifyStarted();
    }));
    const controller = new AbortController();
    const client = new LocalQwenChatClient();
    const pending = client.complete([{ role: "user", content: "hello" }], { signal: controller.signal });
    await started;
    controller.abort();
    expect(generationOptions?.stopping_criteria.criteria[0]?.interrupted).toBe(true);
    finishGeneration([{ generated_text: '{"assistantMessage":"partial' }]);
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});
