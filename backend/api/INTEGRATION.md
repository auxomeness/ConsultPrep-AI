# Application and AI API integration status

## Status and evidence

No Developer 1 AI service implementation, exported server function, route, package, structured output schema, safety event, or observed request/response example exists in this repository. `DEV1.md` is a requirements handoff only. No AMD credentials or service configuration are present. Therefore the actual Developer 1 service integration and success-response contract cannot yet be implemented or verified.

This folder adds a **provisional application-side input contract** and safe error/timeout primitives. It does not define or impersonate the Developer 1 AI interface. There is no AI endpoint, provider URL, request builder, response parser, authentication bypass, or mock AI response in this change.

## Current artifacts

- `contracts.ts`: strict runtime validation for a proposed patient-turn request received by the application server. It accepts only the intake session, question identifier, stable idempotency key, and a reported/unknown/skipped answer. Owner, role, status, brief, and safety-routing fields are rejected. This input contract must be aligned with the eventual app route and intake schema.
- `errors.ts`: sanitized application error codes and HTTP status mappings. Unknown exceptions become a generic internal error; dependency messages and stack traces are not serialized. All current error bodies set `retryable: false` until provider idempotency behavior is known.
- `dependencies.ts`: fail-closed helper that returns `AI_UNAVAILABLE` if an AI integration is not configured.
- `timeout.ts`: bounds an external operation, aborts its signal, and returns a safe `AI_TIMEOUT` error. The provider adapter must honor the signal to stop the underlying request. No automatic retry is performed.
- `api-contracts.test.ts`: tests invalid input, protected fields, unavailable dependency handling, sanitized errors, and timeout behavior.

The application-facing turn request shape is:

```json
{
  "intakeSessionId": "UUID",
  "questionId": "question identifier",
  "idempotencyKey": "UUID stable across a user retry",
  "answer": {
    "state": "reported",
    "text": "Synthetic patient response"
  }
}
```

For `unknown` and `skipped`, `answer.text` is omitted. These remain distinct states. This proposed application envelope is not the AI provider payload; the server should map it to Developer 1's actual contract after that implementation is available.

## Error response shape

```json
{
  "error": {
    "code": "AI_UNAVAILABLE",
    "message": "The AI service is temporarily unavailable. Your response has not been discarded.",
    "retryable": false,
    "requestId": "optional correlation id"
  }
}
```

Current mappings include invalid request (400), unauthenticated (401), forbidden (403), not found (404), invalid transition (409), unavailable AI/database (503), AI timeout (504), malformed AI output (502), persistence failure (500), and sanitized internal error (500). Messages intentionally avoid raw exceptions and sensitive request content.

## Required route behavior after contracts are aligned

The actual Next.js route is not created yet. Before implementing it, use the app's chosen route naming convention and enforce this order:

1. Parse the request with the accepted runtime schema; reject unknown/protected fields.
2. Authenticate with Supabase Auth on the server and load the caller role from `profiles`.
3. Fetch the session, verify patient ownership, and validate current status using the server-side guards in `backend/auth/authorization.ts`.
4. Persist the original patient response before calling AI, or use a transaction/outbox strategy agreed by the team, so an AI timeout cannot lose the response.
5. Invoke Developer 1's actual server-side interface with only the data required for that operation and a configured timeout.
6. Validate the actual response schema, including source references and safety-routing fields, before accepting it. Invalid or missing source references must not be represented as valid output.
7. Return a typed success response only after the app validates the actual AI result. If AI is unavailable, return the safe dependency error and preserve the saved patient response.

No privileged key may be sent to the browser. Do not retry automatically until the AI operation's statelessness/idempotency is verified. A user-initiated retry must reuse an application idempotency key where the server persists and enforces it; the current database schema does not yet provide a per-turn idempotency table/constraint, so this guarantee is not implemented.

## Authentication boundary

The shared authorization guards are policy functions, not authentication. A future route must verify the current Supabase user server-side, resolve `profiles.role`, query the target resource, and then call the guards. No API route or Supabase SSR client currently exists, so there is no live authenticated operation to exercise. Do not add a service-role route without those checks.

## Contract required from Developer 1

Before connecting a provider, obtain the implemented code/import path and verify:

- start/continue conversation behavior and state ownership;
- exact input and output types, schema version, and whether outputs use Zod or JSON Schema;
- structured brief shape and source-reference identifiers;
- safety-routing event shape and precedence over routine output;
- timeout, unavailable, rate-limit, and malformed-output errors;
- whether requests are stateless and idempotent, and how retries are safe;
- API key/base URL/model configuration variable names and server-only handling;
- synthetic examples and actual observed provider test results.

The application success-response schema, provider adapter, route, and full integration tests remain blocked until this concrete handoff is available. No provider call was made and no external service was configured by this deliverable.
