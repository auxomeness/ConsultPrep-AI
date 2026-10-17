# Frontend and backend integration guide

This guide records the current synthetic demo integration and the remaining production connection work.

## Current status

- `frontend/app/intake/page.tsx` and `IntakeConversation.tsx` expose a synthetic local-AI demo.
- `frontend/app/api/demo/intake/route.ts` calls the real `packages/ai` service for start, turn, brief, and local confirmation. A synthetic turn has been exercised successfully through the built route.
- Demo state remains in browser memory and is sent to the route with each request. There is no authentication, session ownership check, database persistence, durable idempotency, or clinician submission. The route is only for synthetic development.
- The demo uses `LocalQwenChatClient` and makes no AMD request. Local model files may download on first use and inference runs on the server CPU.
- Intake does not use RAG; the route supplies an empty retriever. Project-guidance RAG remains for ConsultPrep system questions and is not a clinical knowledge base.
- The authenticated Supabase session API and server-owned state coordinator for production remain unimplemented.

## Ownership

| Work | Owner |
|---|---|
| Prompting, AI service, schemas, source validation, local model | Developer 1 / `packages/ai` |
| HTTP routes, session persistence, authentication, authorization, submission state | Developer 2 / backend |
| Chat screen, loading/error states, brief review, accessibility | Developer 3 / frontend |

The backend is the only layer that imports and calls `@consultprep/ai`. The frontend calls the backend over HTTP. Do not import the AI package into a browser component.

## Current demo request flow

```text
Browser UI
  ├─ POST /api/demo/intake { operation: "start" }
  ├─ POST /api/demo/intake { operation: "turn", state, text }
  ├─ POST /api/demo/intake { operation: "brief", state }
  └─ POST /api/demo/intake { operation: "confirm", state }
                         │
                         ▼
Next.js server route / backend service
  ├─ validate request and AI state
  ├─ call the local AI service
  └─ return a UI-safe response (demo only; no persistence)
                         │
                         ▼
@consultprep/ai (Node.js runtime)
  ├─ LocalQwenChatClient (generation; no AMD calls)
  ├─ local RAG retriever (project guidance only)
  └─ contracts, validation, safety rules, structured brief
```

For production, use the existing Next.js App Router and schema in `backend/db/schema.ts`. Authenticate patients, load state from server-owned persistence, enforce ownership and status transitions, persist responses before inference, and report submission only after a successful database transition.

## Backend setup

### 1. Make the local AI package resolvable

The local package is already listed in `frontend/package.json` (path is relative to `frontend/`):

```json
{
  "dependencies": {
    "@consultprep/ai": "file:../packages/ai"
  }
}
```

Its compiled entry point is used by Next.js; the frontend `predev` and `prebuild` scripts build the package first. Keep runtime imports in server route files only.

### 2. Construct the AI service once per server process

Every AI route should reuse one service instance so the local embedding pipeline, index, and Qwen model can reuse their in-process caches. Run the route on the Node.js runtime; the package uses Node filesystem access and CPU model inference.

```ts
// Example: frontend/lib/server/ai-service.ts
import "server-only";
import {
  createAiService,
  createDefaultRetriever,
  LocalQwenChatClient,
  type AiService,
} from "@consultprep/ai";

let servicePromise: Promise<AiService> | undefined;

export function getAiService(): Promise<AiService> {
  servicePromise ??= createDefaultRetriever().then((retriever) =>
    createAiService(new LocalQwenChatClient(), retriever),
  );
  return servicePromise;
}
```

The first local call can be slow because the models may need to download and load. A process restart or another server instance can require another load; deployment storage, CPU, memory, cold starts, and model-cache behavior must be checked before hosting this on a serverless platform. Do not make a request to AMD as a fallback.

### 3. Start an intake

The demo calls `ai.startIntake()` and returns the initial state to the browser. Production must store state in an authorized server-side session and return only a session ID and the first assistant message.

Suggested API shape:

```http
POST /api/intakes
```

```json
{ "sessionId": "server-generated-id", "assistantMessage": "Hi. ... What have you been feeling?" }
```

The session ID must be random and unguessable. Associate it with the authenticated patient on the server. Do not accept a patient ID, authorization role, or initial `IntakeState` supplied by the browser as authoritative.

### 4. Process one patient message

Suggested request:

```http
POST /api/intakes/{sessionId}/messages
Content-Type: application/json
```

```json
{ "text": "I have had a headache since this morning", "idempotencyKey": "client-generated-unique-value" }
```

Backend turn coordinator responsibilities:

1. Authenticate the caller and verify they own this active intake.
2. Validate the request length and rate-limit the route.
3. Load the state from the server-side store and reject completed sessions.
4. Create the `PatientResponse` on the server. Set a unique response `id`, next `sequence`, `text`, timestamp, and `questionBankId` from the state's current `activeQuestionId`. Never trust a client-provided source ID or question ID.
5. Append that response to the state and call `ai.continueIntake({ state: stateWithResponse, latestResponseId: response.id })`.
6. If the result has a `safety` property, store `result.state`, return the safety guidance, and stop the routine intake flow.
7. Otherwise, merge the returned `fieldUpdates` into the stored fields using the exported `mergeFieldUpdates` helper. Update `activeQuestionId`, `questionsAsked`, question history, and completion state using a server-side turn adapter.
8. Persist the entire updated state atomically before returning a successful response.

`continueIntake()` returns a turn delta, not a complete replacement state. Shared response/turn transition helpers now live in `src/workflow.ts`. Production still needs to load authoritative state on the server and persist transitions atomically. Preserve original responses and source IDs, and do not overwrite an urgent safety state with a normal turn.

Suggested normal response:

```json
{
  "status": "in_progress",
  "assistantMessage": "When did the headache begin?",
  "askedQuestion": "When did the headache begin?",
  "askedQuestionId": "symptom_onset__headache"
}
```

Suggested safety response:

```json
{
  "status": "urgent_guidance",
  "assistantMessage": "Seek urgent medical help now...",
  "canContinue": false
}
```

The exact HTTP DTOs are owned by the backend and should be Zod-validated. Do not send internal model prompts, retrieved chunks, API errors, or server stack traces to the browser.

### 5. Generate, review, and confirm the brief

The backend loads the authoritative server-side state and calls `ai.generateBrief({ state })`. It returns the structured brief as an **AI-generated draft**. Render its fields as data; `formatStructuredBrief()` is for terminal output, not the web UI.

The UI should distinguish reported facts, unknown or unclear items, corrections, source references, and draft status. For a source reference, show the matching original patient statement from `brief.sourceTraceability`. Do not remove source IDs or show AI text as patient-reported evidence.

On patient correction, the backend records a new response linked to the earlier response and updates the relevant field. The package has a basic `recordPatientCorrection()` helper; verify its field targeting for each correction before relying on it. Never silently replace the original response.

On confirmation, the backend calls `confirmPatientBrief(state)`, persists `patientConfirmed` and `completion: "completed"`, then builds the patient-confirmed display using the updated state. Confirmation is not clinician review, case submission, or finalization. Those transitions and any eventual handoff remain application/backend responsibilities.

### 6. Optional educational Q&A

If the frontend exposes Q&A, send each question to a separate backend route, for example `POST /api/ai/answer`, which calls `ai.answerQuestion({ question, conversationHistory })`. The returned scope is `medical`, `system`, or `out_of_scope`. The current general medical Q&A is not grounded in vetted clinical references. It is a prototype, not an approved clinical advice feature. System answers can use the local project-guidance RAG index. Keep it distinct from the intake session and never use it to diagnose or recommend personalized treatment.

## Frontend behavior

The browser should:

- display the assistant's first message returned from the start route;
- submit one patient answer per request and render the returned assistant turn;
- show a real loading state while local inference is running and prevent accidental duplicate submits;
- retain the typed answer if the request fails;
- render safety guidance immediately and stop routine questions when `status` is `urgent_guidance`;
- request and display the brief only when the backend says it is ready for review;
- allow review and correction before explicit patient confirmation;
- display honest states such as “Draft,” “Confirmed by you,” “Submitted,” and “Clinician reviewed” only when the backend state supports each one;
- never claim that the brief was forwarded unless a separately implemented handoff succeeds.

Example browser request:

```ts
const response = await fetch(`/api/intakes/${intakeId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: answer, idempotencyKey }),
});

if (!response.ok) {
  // Keep the text in the composer and show a retryable, non-sensitive error.
  throw new Error("Your response could not be sent. Please try again.");
}

const turn = await response.json();
```

Do not put model code, model weights, retrieval implementation, AMD credentials, or authoritative server-side session state in a client component. The demo page now explicitly discloses that synthetic answers go to the local AI route and are not saved or submitted.

## Validation, errors, and privacy

- Parse backend request DTOs before calling the AI package; the package also validates `IntakeState`, turn inputs, and brief output.
- Keep `AiServiceError` codes on the server and map them to safe HTTP responses: invalid input → 400, unauthenticated → 401, unauthorized → 403, missing session → 404, rate-limited → 429, timeout/unavailable → 503, invalid AI output → 502, unexpected internal error → 500.
- Do not automatically retry generation. A retry must be an explicit patient action and must not append a duplicate patient response; use the idempotency key.
- Never log API keys, raw prompts, or sensitive intake text by default. Use synthetic data during development and demonstrations.
- Keep database persistence, authorization, clinician access, submission, and finalization in the backend. The AI package does not perform these operations.
- Add CSRF/origin protections appropriate to the selected auth model, request-size limits, abuse controls, and audit events before deployment.

## Local integration checks

1. Type-check and test `packages/ai` offline: `cd packages/ai && npm run typecheck && npm test && npm run build`.
2. Type-check and lint the frontend after adding the server routes and package dependency.
3. Mock the AI service in route and component tests to cover success, malformed/invalid inputs, unavailable local models, duplicate submits, safety routing, and brief source rendering.
4. Run one local synthetic end-to-end conversation using the local model only, after the route is connected. This uses local CPU and may download model files, but must not call AMD.
5. Verify the browser network panel contains only your application API routes and never includes an API key or model provider URL.

The local AI-to-Next.js demo connection is implemented and has passed a real synthetic turn through the built route. Do not claim the production frontend/backend/AI integration is complete until authenticated server-owned sessions, database persistence, and authorized clinician review/submission are implemented. Component mocks are not proof of production integration.
