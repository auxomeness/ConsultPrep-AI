# Phase 8 — Patient review and provenance

Date: 2026-10-17. All examples and browser data are synthetic. **No live patient review was executed.** This report separates merged library/schema capability, tested presentation, and unavailable application operations.

## Merged integration assessment and delta from Phase 7

| Layer | Newly available | Still unavailable in the application |
|---|---|---|
| Member 1 AI | `packages/ai/src/contracts.ts` defines v1.0 patient responses, information statuses, intake state, structured brief facts, `sourceResponseIds`, `originalText`, and `sourceTraceability`. `service.ts` exposes start/continue/generate operations; `brief.ts` builds and validates structured evidence; `workflow.ts` has in-memory correction and confirmation. AMD client and local-model handling have tests. | No Next patient route or authenticated invocation; no persisted AI state or brief. Local/remote inference was not exercised in this phase. AMD availability was not established. |
| Member 2 application | Drizzle schema/migration define sessions, append-only responses and corrections, brief source references, cases and statuses. Provisional request parser, fail-safe errors/timeouts, authorization guards and tests exist. | No configured database, applied migration, HTTP route, server action, connected auth, response/correction persistence, review retrieval, confirmation or submission operation. |
| Shared boundary | AI v1.0 schema is concrete; Member 2 has provisional request and database shapes. | No agreed, implemented application response/review adapter. Backend `reported/unknown/skipped` input states need mapping to AI `reported/unknown/not_answered/declined` semantics. AI `correctsResponseId` and DB `supersedesResponseId` need a server contract. Source and status transitions need an authoritative response shape. |

The Phase 7 assumption that *no Member 1 information-state or source schema exists* is outdated. The assumption that no application API or persistence path is available remains correct. The five Phase 7 labels match corresponding AI v1.0 statuses; their examples remain synthetic. `ConversationTurn`, `ResponseComposer`, `IntakeConversation`, and the existing preview route remain useful for local interaction and regression testing. The static `InformationStatePreview` overlaps the new review's state presentation, but remains a separate QA example gallery; it is not used as a production data renderer. No Member 1/2 implementation was replaced or deleted.

## Actual patient workflow boundary

| Step | Classification | Evidence / limitation |
|---|---|---|
| 1. Create/start intake | Implemented but incomplete | Member 1 `startIntake()` creates in-memory AI state; Member 2 application session creation is missing. |
| 2. Enter concern | Implemented and runnable as preview | `/intake` retains a local draft and validates it; no real session. |
| 3. Save response | Missing | No persistence operation or acknowledgement. |
| 4. Receive follow-up | Implemented but incomplete | Member 1 interview service exists; app delivery and configured inference were not exercised. Existing UI question is fixed synthetic text. |
| 5. Continue answering | Implemented but incomplete | Member 1 state transition exists in a library; no app workflow or save. |
| 6. Generate brief | Implemented but incomplete | `buildStructuredBrief` runs in Member 1 tests and one UI integration test; no app operation or stored brief. |
| 7. Retrieve originals | Present only as contract/schema | AI response array and DB response table exist; no patient review retrieval endpoint. |
| 8. Show source references | Implemented and runnable in fixture preview | AI contract carries source IDs and text; `/intake/review` renders them from synthetic data. No live sources were retrieved. |
| 9. Review brief | Implemented and runnable as fixture preview | The route is a labeled synthetic review; no real generated brief is fetched. |
| 10. Correct information | Implemented but incomplete | Member 1 in-memory correction and DB append-only schema exist; no persisted application operation. UI control is disabled. |
| 11. Confirm information | Implemented but incomplete | Member 1 in-memory confirmation and DB status exist; no authoritative application operation. UI control is disabled. |
| 12. Submit intake | Present only as contract/schema | DB lifecycle values exist; no submission API, receipt, or status transition. |

## Phase 8 implementation mode

- **REAL:** TypeScript presentation is checked against Member 1's `StructuredConsultationBrief`, `PatientResponse`, and `IntakeField` types. One frontend test passes the output of the actual Member 1 `buildStructuredBrief` function to the review component. Member 1's 136 tests and Member 2's 6 contract tests were executed locally. These are library/contract evidence, not a live patient journey.
- **FIXTURE-TESTED:** `/intake/review` is an explicitly labeled, manually authored synthetic example shaped to the AI v1.0 contract. The five information states, correction history, brief facts, source inspection, missing/mismatched source handling, responsive layout, and keyboard source disclosure are presentation tests. It is separate from the `/intake` local draft.
- **BLOCKED:** Real review loading/retrieval, authenticated access, network/AI loading and error handling, saved corrections, confirmation, submission, live source correctness, and clinician handoff. No fake requests, pending state, or success state were added.

## Review UX and information integrity

`PatientReview` shows original responses in sequence before the information states and brief. A correction uses its `correctsResponseId` to identify the earlier response; both texts remain visible. Brief facts are labeled as draft wording and their information status is visible in text. The fixture is labeled **Synthetic draft wording** and explicitly says no AI generated it. For future validated AI results, the component has a distinct **AI-generated draft wording** label, but that branch has not been exercised by a live app operation. No clinician-edit/finalized claim is displayed.

The five fixture states remain separate: **Reported** is available in the real-builder test and the earlier Phase 7 gallery; **Unknown** shows explicit uncertainty and its source; **Not answered** shows no invented quote; **Unclear** keeps “Sometimes.”; **Conflicting** shows both Monday and Wednesday sources without choosing one. The corrected concern remains distinct from the original forehead statement. `informationNotEstablished` is listed under the draft. Skipped-to-denied, unknown-to-fact, unanswered-to-negative, and patient-confirmed-to-clinician-finalized transformations are not performed by this UI. Their real workflow behavior remains unverified.

Each brief fact's source action is a native `<details>/<summary>` disclosure with a meaningful response ID. The source text comes from the response array and is shown only when the same ID and exact text agree with `sourceTraceability` and the fact's `originalText`. Missing or mismatched support produces an explicit unsupported message instead of an inactive link or invented quote. The summary keeps keyboard focus when opened/closed, giving a predictable return point. The synthetic conflict entry exposes both source statements. These checks establish **presentation and local consistency**, not clinical/factual support for an AI claim. A semantically wrong source with internally matching text still requires upstream evidence review.

Correction and confirmation controls are disabled with an explanation. No correction is saved, no version is acknowledged, and no patient confirmation or submission occurs. Confirmation and submission remain separate concepts. Loading, source-retrieval failure, network failure, stale case, correction failure, and confirmation failure cannot be exercised without Member 2 operations. The component can display distinct missing/invalid/unavailable review messages, but those paths were tested only in isolation and are not wired to an API.

## Test evidence

| Check | Observed result | Evidence level |
|---|---|---|
| Frontend component suite | 21/21 passed, including 8 new review presentation tests and 1 Member 1 brief-builder-to-UI test. | Component + library-to-component integration; synthetic input. |
| Browser suite | 15/15 Chromium tests passed outside sandbox. Review navigation, preview notice, disabled actions, source keyboard open/close/focus, and no write request were observed. | Browser presentation, not patient-service integration. |
| Responsive review | 375, 768 and 1280px passed; both conflicting sources visible and no document horizontal overflow. | Chromium browser checks. |
| AI package | `npm run typecheck` and `npm test` passed; 136/136 AI tests. | Member 1 library tests; no model inference or AMD service call. |
| Backend contract | `node --test backend/api/api-contracts.test.ts` passed; 6/6. | Member 2 parser/error/timeout tests; no HTTP or database. |
| Standard build / QA-001 | Three outside-sandbox `npm run build` attempts passed, including a final build after the UI changes; original loader-worker failure did not recur. | Limited local build retest; QA-001 remains open. |

The initial sandboxed browser command built successfully but stalled before Playwright reported tests because its local server did not become reachable. It was interrupted and rerun outside the sandbox successfully. The initial sandboxed `npm ci --ignore-scripts` for `packages/ai` failed on registry DNS; the outside-sandbox rerun installed the locked dependencies. This did not change tracked files. Frontend type checking against the sibling AI source requires that AI package's dependencies to be installed in this checkout.

## Defects and blockers

- **QA-003 (Member 2, open):** The provisional `parsePatientTurnRequest` trims a reported answer before returning it. This changes exact patient wording before any future persistence/source operation. The existing backend test currently expects normalization. No live persisted loss was observed; fix and agree the raw-text contract before wiring the parser to intake saves.
- **QA-001 (Member 3, open):** Three Phase 8 standard builds passed; intermittent worker failure history prevents closure.
- Member 1: expose a validated versioned brief and source payload through the agreed application boundary; confirm AI error/pending semantics for the UI. AMD/live model availability remains unverified.
- Member 2: provide session, response/correction save, review retrieval, source integrity, confirmation, submission and authenticated access operations with authoritative acknowledgements. Apply and verify a development DB only under the agreed deployment process.
- Shared: align skip/unknown/declined mapping, response IDs and correction linkage, raw statement preservation, brief versions, source mismatch handling, and patient-confirmed versus submitted/finalized statuses.

## Acceptance criteria at Phase 8

| Criterion | Status | Reason |
|---|---|---|
| P02 | Partially verified | Existing local validation, retention and no-send tests pass; no real save operation. |
| P03 | Partially verified | Existing local draft and exact wording tests pass; no persisted question association. |
| P05 | Blocked | Fixed synthetic follow-up remains; Member 1 service exists but no integrated saved-response-to-question path. |
| P06 | Blocked | No real pending signal or inference request in the app. |
| P10 | Verified presentation only | Original and correction are distinct in a fixture; no correction persistence. |
| P11 | Verified presentation only | Brief labels and source disclosures are tested using contract-shaped fixture and real builder output; no retrieved AI draft. |
| P12 | Blocked | No brief-correction persistence/version contract or recoverable operation. |
| P13 | Blocked | No authoritative confirmation operation; disabled preview control. |

No full patient integration criterion is passed. Recommended Phase 9: **clinician workflow integration + major UI/UX refinement**, starting only after Member 2's authorized case/revision/finalization operations and a stable shared brief/source contract exist. Verify the real case flow, source-linked review, clinician edit/save and finalization, then refine the integrated application's visual design.
