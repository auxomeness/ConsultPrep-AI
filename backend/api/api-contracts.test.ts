import assert from "node:assert/strict";
import test from "node:test";
import { parsePatientTurnRequest } from "./contracts.ts";
import { requireConfiguredAiDependency } from "./dependencies.ts";
import { ApiError, isApiErrorBody, toPublicError } from "./errors.ts";
import { withAiTimeout } from "./timeout.ts";
import { AuthorizationError } from "../auth/authorization.ts";

const validRequest = {
  intakeSessionId: "10000000-0000-4000-8000-000000000001",
  questionId: "q-main-concern",
  idempotencyKey: "20000000-0000-4000-8000-000000000001",
  answer: { state: "reported", text: "Synthetic test response." },
};

test("accepts a valid patient response and normalizes surrounding whitespace", () => {
  const result = parsePatientTurnRequest({ ...validRequest, answer: { state: "reported", text: "  Synthetic test response.  " } });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.answer.text, "Synthetic test response.");
});

test("rejects malformed identifiers, missing reported text, and client-controlled fields", () => {
  const result = parsePatientTurnRequest({
    ...validRequest,
    intakeSessionId: "not-a-uuid",
    answer: { state: "reported", text: "   " },
    status: "submitted",
    patientId: "another-user",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((issue) => issue.path === "intakeSessionId"));
    assert.ok(result.issues.some((issue) => issue.path === "answer.text"));
    assert.ok(result.issues.some((issue) => issue.path === "status"));
    assert.ok(result.issues.some((issue) => issue.path === "patientId"));
  }
});

test("keeps unknown and skipped answers distinct and disallows attached response text", () => {
  const unknown = parsePatientTurnRequest({ ...validRequest, answer: { state: "unknown" } });
  const skipped = parsePatientTurnRequest({ ...validRequest, answer: { state: "skipped" } });
  const invalid = parsePatientTurnRequest({ ...validRequest, answer: { state: "unknown", text: "No idea" } });
  assert.equal(unknown.success, true);
  assert.equal(skipped.success, true);
  assert.equal(invalid.success, false);
});

test("returns a predictable sanitized response for unavailable AI dependencies", () => {
  let unavailable: unknown;
  try {
    requireConfiguredAiDependency(undefined);
  } catch (error) {
    unavailable = error;
  }
  const response = toPublicError(unavailable, "req-synthetic-1");
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, "AI_UNAVAILABLE");
  assert.equal(response.body.error.retryable, false);
  assert.equal(response.body.error.requestId, "req-synthetic-1");
  assert.equal(response.body.error.message.includes("secret"), false);
  assert.equal(isApiErrorBody(response.body), true);
});

test("maps unknown dependency failures to a sanitized internal error", () => {
  const response = toPublicError(new Error("API key abc123 failed"));
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_ERROR");
  assert.equal(response.body.error.message.includes("abc123"), false);
});

test("maps authorization guard failures to safe public authorization errors", () => {
  const response = toPublicError(new AuthorizationError("NOT_FOUND", "Hidden case identifier", 404));
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.equal(response.body.error.message.includes("Hidden case"), false);
});

test("aborts and returns a safe timeout error without an automatic retry", async () => {
  let wasAborted = false;
  await assert.rejects(
    withAiTimeout((signal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        wasAborted = true;
        reject(new Error("underlying request aborted"));
      }, { once: true });
    }), 5),
    (error: unknown) => error instanceof ApiError && error.code === "AI_TIMEOUT" && error.httpStatus === 504,
  );
  assert.equal(wasAborted, true);
});
