export type AiErrorCode =
  | "configuration_error"
  | "invalid_credentials"
  | "invalid_request"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "invalid_response"
  | "safety_routed";

export class AiServiceError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(code: AiErrorCode, message: string, options: { retryable?: boolean; statusCode?: number } = {}) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
  }
}
