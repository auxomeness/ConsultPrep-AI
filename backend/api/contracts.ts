export type PatientAnswerState = "reported" | "unknown" | "skipped";

/**
 * Provisional application-to-server request shape, not Developer 1's AI payload.
 * It intentionally excludes owner, role, status, brief, and safety-routing fields.
 */
export type PatientTurnRequest = {
  intakeSessionId: string;
  questionId: string;
  idempotencyKey: string;
  answer: {
    state: PatientAnswerState;
    text?: string;
  };
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_REQUEST_KEYS = new Set(["intakeSessionId", "questionId", "idempotencyKey", "answer"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateUuid(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    issues.push({ path, message: "Must be a valid UUID." });
  }
}

/** Validates untrusted client input before any application or AI service call. */
export function parsePatientTurnRequest(input: unknown): ParseResult<PatientTurnRequest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { success: false, issues: [{ path: "", message: "Expected an object." }] };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      issues.push({ path: key, message: "Unknown or protected field." });
    }
  }

  validateUuid(input.intakeSessionId, "intakeSessionId", issues);
  validateUuid(input.idempotencyKey, "idempotencyKey", issues);

  if (typeof input.questionId !== "string" || input.questionId.trim().length === 0 || input.questionId.length > 120) {
    issues.push({ path: "questionId", message: "Must be between 1 and 120 characters." });
  }

  let answer: PatientTurnRequest["answer"] | undefined;
  if (!isRecord(input.answer)) {
    issues.push({ path: "answer", message: "Expected an answer object." });
  } else {
    const answerKeys = Object.keys(input.answer);
    for (const key of answerKeys) {
      if (key !== "state" && key !== "text") {
        issues.push({ path: `answer.${key}`, message: "Unknown field." });
      }
    }

    const state = input.answer.state;
    const text = input.answer.text;
    if (state !== "reported" && state !== "unknown" && state !== "skipped") {
      issues.push({ path: "answer.state", message: "Must be reported, unknown, or skipped." });
    } else if (state === "reported") {
      if (typeof text !== "string" || text.trim().length === 0 || text.length > 2000) {
        issues.push({ path: "answer.text", message: "A reported answer must contain 1 to 2000 characters." });
      } else {
        answer = { state, text: text.trim() };
      }
    } else {
      if (text !== undefined) {
        issues.push({ path: "answer.text", message: "Unknown and skipped answers must not include response text." });
      } else {
        answer = { state };
      }
    }
  }

  if (issues.length > 0 || !answer) return { success: false, issues };

  return {
    success: true,
    data: {
      intakeSessionId: input.intakeSessionId as string,
      questionId: (input.questionId as string).trim(),
      idempotencyKey: input.idempotencyKey as string,
      answer,
    },
  };
}
