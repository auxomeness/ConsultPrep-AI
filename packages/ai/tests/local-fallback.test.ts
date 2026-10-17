import { describe, expect, it, vi } from "vitest";
import type { ChatCompleter } from "../src/amd-client.js";
import { AiServiceError } from "../src/errors.js";
import { FailoverChatClient } from "../src/local-fallback-client.js";

describe("configured local failover", () => {
  it("announces a material provider change once and sends the same request to the fallback", async () => {
    const primary: ChatCompleter = { complete: vi.fn().mockRejectedValue(new AiServiceError("rate_limited", "rate limit")) };
    const fallback: ChatCompleter = { complete: vi.fn().mockResolvedValue("local answer") };
    const onFallback = vi.fn();
    const client = new FailoverChatClient(primary, fallback, onFallback);

    await expect(client.complete([{ role: "user", content: "hello" }])).resolves.toBe("local answer");
    await expect(client.complete([{ role: "user", content: "again" }])).resolves.toBe("local answer");
    expect(fallback.complete).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});
