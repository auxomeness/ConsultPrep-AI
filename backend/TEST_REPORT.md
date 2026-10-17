# ConsultPrep AI test report

**Run date:** 2026-10-17 (Asia/Taipei)  
**Scope:** Current repository unit/contract tests and the requested 20 workflow scenarios.  
**Data:** Synthetic test fixtures only.

## Execution summary

- Backend Node test suites: **28 passed, 0 failed** across four files.
- Frontend lint: **could not run** because the frontend dependencies are not installed; `eslint` is not recognized as a command.
- Browser end-to-end tests: **not available**; there is no configured browser test runner in `frontend/package.json`.
- Supabase/PostgreSQL integration: **not run**; no database URL/project or concrete persistence adapter is configured. The persistence and clinician services were tested against in-memory transaction adapters only.
- Application AI integration and safety-routing tests: **not available**; the standalone AI service and versioned safety/brief contracts exist in `packages/ai/`, but no application route connects them to auth, persistence, or the UI.

## Requested workflow scenarios

“Passed” below means the named test was executed and passed at the stated unit/contract level. It does not imply that an unconnected browser, AI provider, authentication service, or real database was exercised.

| # | Scenario | Test name / execution | Expected result | Actual result and status |
|---:|---|---|---|---|
| 1 | Patient starts a new intake | No automated UI test; browser test runner unavailable. | A new intake starts empty and in `in_progress`. | **Not run.** The patient page uses local component state; a browser interaction was not observed. |
| 2 | Patient submits a response | `accepts a valid patient response and normalizes surrounding whitespace` in `api-contracts.test.ts`. | A valid response is accepted, preserved, and used for the next question. | **Partial unit pass.** Request validation and whitespace normalization passed. No API route, database write, or AI call exists to verify the rest of the scenario. |
| 3 | AI service returns the next question | No application integration test exists. The standalone AI package has its own tests, but they do not test the application flow. | A valid AI response returns the next question and updates conversation state. | **Not run for this scenario.** The standalone AI service exists, but no application route or persisted conversation state connects it to the patient flow. |
| 4 | AI service is unavailable | `returns a predictable sanitized response for unavailable AI dependencies` in `api-contracts.test.ts`. | Return a safe unavailable error without exposing internals or discarding an already-saved response. | **Partial unit pass.** Safe error mapping passed. Preservation of a saved response was not exercised because no persistence route is connected. |
| 5 | Patient skips a question | `keeps unknown and skipped answers distinct and disallows attached response text` in `api-contracts.test.ts`. | A skip is accepted as `skipped`, distinct from unknown and from a denial. | **Contract test passed.** The UI interaction itself was not run in a browser. |
| 6 | Patient corrects an earlier answer | `patient correction appends a superseding response and preserves the original` in `consultation-persistence.test.ts`. | Add a correction linked to the earlier response; retain the original. | **Passed against in-memory adapter.** The original remained and the new row referenced it. PostgreSQL persistence was not tested. |
| 7 | Patient reviews and edits a brief | No frontend interaction test exists. | Patient can inspect and edit the proposed brief before confirmation. | **Not run.** The current patient page keeps edits in local state; no browser test or durable save was observed. |
| 8 | Patient submits a confirmed intake | `submission persists one case and verifies the read-back snapshot` in `consultation-persistence.test.ts`. | Only a patient-confirmed brief submits; case/session/brief/source data match after read-back. | **Passed against in-memory adapter.** The test verified its simulated transaction read-back; no real database write occurred. |
| 9 | Duplicate submission attempt | `retry with the same idempotency key returns the same case` in `consultation-persistence.test.ts`. | Repeated request with the same key returns the same case, without creating another. | **Passed against in-memory adapter.** Concurrent requests and the PostgreSQL unique constraints were not exercised. |
| 10 | Database failure during submission | `mismatched read-back fails and rolls back all writes` in `consultation-persistence.test.ts`. | A failed verification must not leave a partial submission or claim success. | **Simulated unit pass.** The fake transaction rolled back writes after mismatched read-back. A real database outage/transaction failure was not induced. |
| 11 | Patient attempts another patient's record | `prevents one patient from reading or submitting another patient's intake` in `authorization.test.ts`. | Deny access without exposing another patient's record. | **Authorization guard test passed.** Supabase RLS and live authenticated access were not tested. |
| 12 | Unauthorized user attempts clinician access | `case list and detail are scoped to the assigned clinician` and `limits case list and detail...` coverage in `clinician-review.test.ts` / authorization tests. | Only clinicians assigned to a case can list or open it; patients cannot use clinician operations. | **Service/guard tests passed.** No authenticated route or live database/RLS access was exercised. |
| 13 | Clinician opens a source-linked brief | `assigned clinician opens the brief with its original response references` in `clinician-review.test.ts`. | Assigned clinician sees the brief and its source response. | **Passed against in-memory fixture.** The brief reference resolved to the expected original response. |
| 14 | Clinician saves an edit | `saving a revision appends a snapshot and moves the case into review` in `clinician-review.test.ts`. | Append a revision, retain the source brief, and transition the case into review. | **Passed against in-memory adapter.** No durable database write was made. |
| 15 | Unauthorized finalization attempt | `unauthorized clinician cannot finalize a case` in `clinician-review.test.ts`. | Reject a clinician not assigned to the case; leave its status and revisions unchanged. | **Passed against in-memory adapter.** The operation was rejected and the case remained under review. |
| 16 | Authorized clinician finalizes a case | `finalization records a final snapshot and changes both statuses` in `clinician-review.test.ts`. | Append the final snapshot and set case/brief to finalized with a timestamp. | **Passed against in-memory adapter.** Simulated read-back confirmed the statuses and final snapshot. No database persistence was verified. |
| 17 | Invalid status transition | `lifecycle rejects skipped or reversed transitions` and `cannot finalize before review or edit after finalization` in persistence/clinician tests. | Reject skipped, reversed, premature, or post-finalization changes. | **Passed at unit level.** Invalid transition cases raised `INVALID_TRANSITION`; no database constraint/route test was run. |
| 18 | Urgent safety event interrupts routine intake | No application safety-routing integration test exists. The AI package has heuristic safety-related code, but it is not connected to the UI. | Show approved urgent guidance immediately and preserve the source statement. | **Not run.** The standalone heuristics do not establish application interruption behavior or validated safety guidance. |
| 19 | Invalid or malformed brief | `malformed brief data is rejected without creating a revision` in `clinician-review.test.ts`; `rejects malformed identifiers...` in `api-contracts.test.ts`. | Reject malformed input and never persist it as a valid brief/revision. | **Partial unit pass.** Non-object clinician brief input was rejected without a revision. Developer 1's actual structured brief schema is unavailable, so provider-output validation was not tested. |
| 20 | Reload preserves expected persisted state | No browser reload or database integration test exists. | Confirmed intake, saved revisions, and finalization remain after reload. | **Not run; persistence unavailable.** Current patient/clinician demo edits are React page state only and will not be restored from a database. This is based on code inspection, not an observed browser reload. |

## Executed test names and outcomes

Commands were run from the repository root using Node's built-in test runner with TypeScript stripping.

### `backend/persistence/clinician-review.test.ts` — 8 passed

- `case list and detail are scoped to the assigned clinician`
- `assigned clinician opens the brief with its original response references`
- `saving a revision appends a snapshot and moves the case into review`
- `finalization records a final snapshot and changes both statuses`
- `cannot finalize before review or edit after finalization`
- `unauthorized clinician cannot save a revision`
- `unauthorized clinician cannot finalize a case`
- `malformed brief data is rejected without creating a revision`

### `backend/persistence/consultation-persistence.test.ts` — 6 passed

- `submission persists one case and verifies the read-back snapshot`
- `retry with the same idempotency key returns the same case`
- `mismatched read-back fails and rolls back all writes`
- `source references must resolve to responses in this intake`
- `patient correction appends a superseding response and preserves the original`
- `lifecycle rejects skipped or reversed transitions`

### `backend/api/api-contracts.test.ts` — 7 passed

- `accepts a valid patient response and normalizes surrounding whitespace`
- `rejects malformed identifiers, missing reported text, and client-controlled fields`
- `keeps unknown and skipped answers distinct and disallows attached response text`
- `returns a predictable sanitized response for unavailable AI dependencies`
- `maps unknown dependency failures to a sanitized internal error`
- `maps authorization guard failures to safe public authorization errors`
- `aborts and returns a safe timeout error without an automatic retry`

### `backend/auth/authorization.test.ts` — 7 passed

- `rejects unauthenticated access`
- `prevents one patient from reading or submitting another patient's intake`
- `prevents a clinician from using patient-only ownership operations`
- `allows patient submission only after explicit patient confirmation`
- `limits clinician access to an explicitly assigned case`
- `prevents editing or finalizing finalized cases`
- `requires assignment and review state before clinician finalization`

## Observed failures and limitations

- `npm run lint` in `frontend/` exited with code 1: **`'eslint' is not recognized as an internal or external command`**. `frontend/node_modules` is absent.
- No backend unit test failed in this run.
- No UI/browser, live AI, Supabase Auth, RLS, PostgreSQL migration, concurrency, or reload-persistence test ran. Results from in-memory adapters must not be described as proof of real persistence or deployed security.
