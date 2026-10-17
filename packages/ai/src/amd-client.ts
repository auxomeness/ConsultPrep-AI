import { AiServiceError } from "./errors.js";
import type { AmdConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequestOptions {
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  signal?: AbortSignal;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown; reasoning?: unknown }; finish_reason?: unknown }>;
}

export interface ChatCompleter {
  complete(messages: ChatMessage[], options?: ChatRequestOptions): Promise<string>;
}

export class AmdChatClient implements ChatCompleter {
  constructor(
    private readonly config: AmdConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(messages: ChatMessage[], options: ChatRequestOptions = {}): Promise<string> {
    if (options.signal?.aborted) throw new AiServiceError("cancelled", "The AI request was cancelled.");
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: options.maxTokens ?? 700,
          temperature: options.temperature ?? 0.2,
          // Qwen3.8-Flash-Next otherwise uses xhigh reasoning by default, which can
          // consume the output budget before a user-facing answer is produced.
          reasoning_effort: options.reasoningEffort ?? this.config.reasoningEffort ?? "none",
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = mapHttpError(response.status);
        throw error;
      }
      const payload = (await response.json()) as ChatCompletionResponse;
      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        const reasoning = choice?.message?.reasoning;
        const detail = choice?.finish_reason === "length"
          ? " The response reached the output-token limit before producing an answer."
          : typeof reasoning === "string" && reasoning.trim()
            ? " AMD returned internal reasoning without a user-facing answer."
            : " The provider response did not contain a text answer.";
        throw new AiServiceError("invalid_response", `AMD returned no answer content.${detail}`);
      }
      return content;
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      if (options.signal?.aborted) throw new AiServiceError("cancelled", "The AI request was cancelled.");
      if (timedOut) throw new AiServiceError("timeout", "AMD inference request timed out.", { retryable: true });
      throw new AiServiceError("provider_unavailable", "AMD inference could not be reached.", { retryable: true });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function mapHttpError(status: number): AiServiceError {
  if (status === 401 || status === 403) {
    return new AiServiceError("invalid_credentials", "AMD rejected the configured API credentials.", { statusCode: status });
  }
  if (status === 429) return new AiServiceError("rate_limited", "AMD rate limit reached; retry only after an explicit user action.", { statusCode: status });
  if (status === 400 || status === 404 || status === 422) {
    return new AiServiceError("invalid_request", "AMD rejected the configured model or request.", { statusCode: status });
  }
  return new AiServiceError("provider_unavailable", `AMD service returned HTTP ${status}.`, { retryable: status >= 500, statusCode: status });
}
