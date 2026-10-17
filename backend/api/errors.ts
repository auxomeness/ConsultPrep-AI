export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE"
  | "DATABASE_UNAVAILABLE"
  | "PERSISTENCE_FAILED"
  | "INTERNAL_ERROR";

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_INVALID_RESPONSE: 502,
  DATABASE_UNAVAILABLE: 503,
  PERSISTENCE_FAILED: 500,
  INTERNAL_ERROR: 500,
};

const SAFE_MESSAGE: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: "The request is invalid. Review the highlighted fields and try again.",
  UNAUTHENTICATED: "Sign in is required to continue.",
  FORBIDDEN: "You are not allowed to perform this action.",
  NOT_FOUND: "The requested record was not found.",
  INVALID_TRANSITION: "This action is not available in the current record state.",
  AI_UNAVAILABLE: "The AI service is temporarily unavailable. Your response has not been discarded.",
  AI_TIMEOUT: "The AI service did not respond in time. Your response has not been discarded.",
  AI_INVALID_RESPONSE: "The AI service returned an unusable response. Your response has not been discarded.",
  DATABASE_UNAVAILABLE: "Secure storage is temporarily unavailable. Your intake has not been submitted.",
  PERSISTENCE_FAILED: "The intake could not be saved. It has not been submitted.",
  INTERNAL_ERROR: "The request could not be completed.",
};

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly httpStatus: number;

  constructor(
    code: ApiErrorCode,
    message = SAFE_MESSAGE[code],
  ) {
    super(message);
    this.code = code;
    this.name = "ApiError";
    this.httpStatus = HTTP_STATUS[code];
  }
}

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: false;
    requestId?: string;
  };
};

/** Never serialize dependency exception text, prompts, credentials, or stack traces. */
export function toPublicError(error: unknown, requestId?: string): { status: number; body: ApiErrorBody } {
  const safeError = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR");
  return {
    status: safeError.httpStatus,
    body: {
      error: {
        code: safeError.code,
        message: SAFE_MESSAGE[safeError.code],
        retryable: false,
        ...(requestId ? { requestId } : {}),
      },
    },
  };
}

export function isApiErrorBody(input: unknown): input is ApiErrorBody {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const error = (input as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return false;
  const body = error as Record<string, unknown>;
  return (
    typeof body.code === "string" && Object.hasOwn(HTTP_STATUS, body.code) &&
    typeof body.message === "string" &&
    body.retryable === false &&
    (body.requestId === undefined || typeof body.requestId === "string")
  );
}
