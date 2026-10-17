import { pipeline } from "@huggingface/transformers";
import type { ChatCompleter, ChatMessage, ChatRequestOptions } from "./amd-client.js";
import { AiServiceError } from "./errors.js";

const LOCAL_MODEL_ID = "onnx-community/Qwen3-0.6B-ONNX";
type LocalMessage = { role: string; content: string };
type LocalGenerator = (
  messages: LocalMessage[],
  options: { max_new_tokens: number; do_sample: boolean; temperature: number; top_p: number; top_k: number; repetition_penalty: number },
) => Promise<Array<{ generated_text: string | LocalMessage[] }>>;

/**
 * Local open-weights generation client. The model is downloaded and cached by
 * Transformers.js on first use, then reused for subsequent requests.
 */
export class LocalQwenChatClient implements ChatCompleter {
  private pipelinePromise: Promise<LocalGenerator> | undefined;

  async complete(messages: ChatMessage[], options: ChatRequestOptions = {}): Promise<string> {
    try {
      this.pipelinePromise ??= pipeline("text-generation", LOCAL_MODEL_ID, { dtype: "q4", device: "cpu" })
        .then((generator) => generator as unknown as LocalGenerator);
      const generator = await this.pipelinePromise;
      const localMessages = messages.map((message) => ({ ...message }));
      const systemMessage = localMessages.find((message) => message.role === "system");
      if (systemMessage) {
        systemMessage.content += "\nYou are the local backup model. Follow all safety and output-format rules above. Do not expose reasoning; return only the requested concise answer. /no_think";
      }
      const output = await generator(
        localMessages,
        {
          max_new_tokens: Math.min(options.maxTokens ?? 300, 600),
          do_sample: true,
          temperature: 0.7,
          top_p: 0.8,
          top_k: 20,
          repetition_penalty: 1.08,
        },
      );
      const generated = output[0]?.generated_text;
      if (typeof generated === "string" && generated.trim()) return normalizeLocalOutput(generated.trim(), messages);
      if (Array.isArray(generated)) {
        const assistantMessages = generated.filter((message): message is LocalMessage =>
          typeof message === "object" && message !== null && "role" in message && "content" in message
          && typeof message.role === "string" && typeof message.content === "string" && message.role === "assistant",
        );
        const answer = assistantMessages.at(-1)?.content.trim();
        if (answer) return normalizeLocalOutput(answer, messages);
      }
      throw new AiServiceError("invalid_response", "The local backup model returned no usable answer.");
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      throw new AiServiceError("provider_unavailable", "The local backup model could not be loaded or run.");
    }
  }
}

function normalizeLocalOutput(raw: string, messages: ChatMessage[]): string {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Some compact local models follow the requested format less reliably than
    // the hosted API. Wrap a plain response for the two simple chat contracts.
  }

  let task = "";
  try {
    const payload = JSON.parse(messages.at(-1)?.content ?? "") as { task?: unknown };
    if (typeof payload.task === "string") task = payload.task;
  } catch {
    return cleaned;
  }

  if (/assistantMessage \(string\)/i.test(task)) {
    const questions = cleaned.match(/[^?]*\?/g) ?? [];
    const askedQuestion = questions.at(-1)?.trim() ?? null;
    const assistantMessage = askedQuestion && !cleaned.includes(askedQuestion)
      ? `${cleaned} ${askedQuestion}`
      : cleaned;
    return JSON.stringify({ assistantMessage, askedQuestion });
  }
  if (/exactly one property: answer/i.test(task)) {
    return JSON.stringify({ answer: cleaned });
  }
  return cleaned;
}

/** Silently switches to the local model for AMD credential, quota, or service failures. */
export class FailoverChatClient implements ChatCompleter {
  private fallbackAnnounced = false;

  constructor(
    private readonly primary: ChatCompleter,
    private readonly fallback: ChatCompleter,
    private readonly onFallback?: () => void,
  ) {}

  async complete(messages: ChatMessage[], options: ChatRequestOptions = {}): Promise<string> {
    try {
      return await this.primary.complete(messages, options);
    } catch (error) {
      if (!(error instanceof AiServiceError) || ![
        "invalid_credentials",
        "rate_limited",
        "timeout",
        "provider_unavailable",
      ].includes(error.code)) throw error;
      if (!this.fallbackAnnounced) {
        this.fallbackAnnounced = true;
        this.onFallback?.();
      }
      try {
        return await this.fallback.complete(messages, options);
      } catch {
        // Let the service produce its deterministic no-network intake turn.
        throw error;
      }
    }
  }
}
