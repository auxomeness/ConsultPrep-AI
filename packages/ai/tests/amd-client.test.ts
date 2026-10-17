import { describe, expect, it, vi } from "vitest";
import { AmdChatClient } from "../src/amd-client.js";
import type { AmdConfig } from "../src/config.js";
import { AiServiceError } from "../src/errors.js";

const config: AmdConfig = { baseUrl: "https://api.example.test/v1", apiKey: "test-key", model: "test-model", timeoutMs: 5_000, reasoningEffort: "none" };

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("AMD chat client (mock transport only)", () => {
  it("sends one authenticated structured-output request and parses content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(200, { choices: [{ message: { content: "{\"ok\":true}" } }] }));
    const client = new AmdChatClient(config, fetchMock);
    await expect(client.complete([{ role: "user", content: "synthetic" }])).resolves.toBe("{\"ok\":true}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(String(init?.body)).toContain('"response_format":{"type":"json_object"}');
    expect(String(init?.body)).toContain('"reasoning_effort":"none"');
  });

  it.each([[401, "invalid_credentials"], [429, "rate_limited"], [503, "provider_unavailable"]] as const)("normalizes HTTP %i", async (status, code) => {
    const client = new AmdChatClient(config, vi.fn<typeof fetch>().mockResolvedValue(response(status, {})));
    await expect(client.complete([{ role: "user", content: "synthetic" }])).rejects.toMatchObject({ code });
  });

  it("normalizes malformed response payloads", async () => {
    const client = new AmdChatClient(config, vi.fn<typeof fetch>().mockResolvedValue(response(200, { choices: [] })));
    await expect(client.complete([{ role: "user", content: "synthetic" }])).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("explains when a reasoning model returns no answer content", async () => {
    const client = new AmdChatClient(config, vi.fn<typeof fetch>().mockResolvedValue(response(200, {
      choices: [{ message: { content: "", reasoning: "hidden reasoning" }, finish_reason: "length" }],
    })));
    await expect(client.complete([{ role: "user", content: "synthetic" }])).rejects.toMatchObject({
      code: "invalid_response",
      message: expect.stringContaining("output-token limit"),
    });
  });

  it("normalizes request timeouts without retrying", async () => {
    const timedConfig = { ...config, timeoutMs: 10 };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const client = new AmdChatClient(timedConfig, fetchMock);
    const error = await client.complete([{ role: "user", content: "synthetic" }]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect(error).toMatchObject({ code: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
