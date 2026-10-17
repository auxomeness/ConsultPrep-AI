# Frontend and backend integration guide

This guide describes how to connect the existing AI package to the ConsultPrep frontend through a server-side API. It is an integration plan and contract, not a claim that these API routes already exist.

## Current status

- `frontend/app/intake/page.tsx` is a preview. It does not create a session or call an API.
- There are no implemented `/api/intake/*` backend routes or persistent intake sessions yet.
- `packages/ai` provides the AI service and versioned Zod contracts, but it does not provide HTTP routes, authentication, database persistence, or a complete server-side turn/session coordinator.
- Intake should use `LocalQwenChatClient` as the only generation provider for now. That path makes no AMD request. Local model files may download on first use and inference runs on the server CPU.
- `createDefaultRetriever()` also loads local MiniLM embeddings and the project-owned Markdown corpus. Retrieval is for ConsultPrep system questions; it is not a clinical knowledge base.

## Ownership

| Work | Owner |
|---|---|
| Prompting, AI service, schemas, source validation, local model | Developer 1 / `packages/ai` |
| HTTP routes, session persistence, authentication, authorization, submission state | Developer 2 / backend |
| Chat screen, loading/error states, brief review, accessibility | Developer 3 / frontend |

The backend is the only layer that imports and calls `@consultprep/ai`. The frontend calls the backend over HTTP. Do not import the AI package into a browser component.

## Recommended request flow

```text
Browser UI
  ├─ POST /api/intakes                 start and store a session
  ├─ POST /api/intakes/:id/messages    append a patient answer and get one turn
  ├─ POST /api/intakes/:id/brief       create a source-linked draft
  └─ POST /api/intakes/:id/confirm     record patient confirmation
                         │
                         ▼
Next.js server route / backend service
  ├─ authenticate and authorize
  ├─ load and update the server-owned intake state
  ├─ call the AI service with validated data
  ├─ persist the updated state and audit data
  └─ return a small UI-safe response
                         │
                         ▼
@consultprep/ai (Node.js runtime)
  ├─ LocalQwenChatClient (generation; no AMD calls)
  ├─ local RAG retriever (project guidance only)
  └─ contracts, validation, safety rules, structured brief
```

Use the existing Next.js App Router. Suggested route files are `frontend/app/api/intakes/route.ts`, `frontend/app/api/intakes/[intakeId]/messages/route.ts`, `frontend/app/api/intakes/[intakeId]/brief/route.ts`, and `frontend/app/api/intakes/[intakeId]/confirm/route.ts`. These are proposed locations, not existing files.

## Backend setup

### 1. Make the local AI package resolvable

When implementation begins, add the local package to `frontend/package.json` (path is relative to `frontend/`):

```json
{
  "dependencies": {
    "@consultprep/ai": "file:../packages/ai"
  }
}
```

Install from `frontend/` and update its lockfile. If Next.js does not transpile the local TypeScript package automatically, add `transpilePackages: ["@consultprep/ai"]` to `frontend/next.config.ts`. Keep imports in server route files only.

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

The backend calls `ai.startIntake()`, stores the returned `state` in the application’s authorized session store, and returns only the session ID and first assistant message to the browser.

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

`continueIntake()` returns a turn delta, not a complete replacement state. The CLI has its own state-update helpers inside `scripts/interactive-chat.ts`; they are not a backend session manager. Extract or implement a shared server-side transition helper before wiring the route. In particular, preserve original responses and source IDs, mark the answer to the previously active question, and do not overwrite an urgent safety state with a normal turn.

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

Do not put model code, model weights, retrieval implementation, AMD credentials, or server-side session state in a client component. The present intake preview explicitly says it does not save or send answers; remove or replace that preview messaging only after the corresponding real route has been implemented and verified.

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

Do not claim the frontend/backend/AI integration is complete until requests reach the real server route, session state is persisted by the backend, and the patient can review a source-linked brief. A mocked route test is not live integration evidence.
