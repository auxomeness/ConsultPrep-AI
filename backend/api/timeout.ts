import { ApiError } from "./errors.ts";

/**
 * Bounds an external operation and signals its AbortSignal on timeout.
 * The provider must honor the signal to stop its underlying request. No automatic
 * retry is performed because the AI service's idempotency behavior is unknown.
 */
export async function withAiTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive finite number.");
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError("AI_TIMEOUT"));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
