# ConsultPrep AI — Proposed Acceptance Criteria

Status: Phase 10 final frontend assessment (2026-10-18). The original criteria remain below for traceability; the Phase 4–9 sections are historical checkpoints. **No full patient or clinician application criterion is verified end to end.** The current `/api/demo/intake` route calls Member 1's AI service when configured, but this host lacks AMD credentials, and the demo has no Member 2 patient-record persistence or authenticated clinician workflow. Use synthetic data only.

These criteria describe observable outcomes. The AI v1.0 schema and Member 2 provisional database/request shapes exist; final application API shapes, authorization, persistence behavior, and status transitions remain with the responsible members or shared contract.

## Phase 10 authoritative classification

Classification is based on this checkout's 22 passing frontend component tests, 17 passing Chromium tests against a Turbopack build, 137 passing Member 1 tests, 13 passing Member 2 pure tests, code inspection, and the local demo route's observed 503 without AMD configuration. Browser AI responses in the suite are intercepted fixtures. “Presentation only” never means persistence or live AI was verified.

| Criteria | Classification | Evidence and remaining boundary |
|---|---|---|
| P01 | Blocked | “Begin intake” navigates to a development demo; no Member 2 session creation or acknowledged patient record. |
| P02 | Partially verified | Empty/whitespace input stays unsent; failure preserves editable text. No authoritative response save or final shared validation rule. |
| P03 | Partially verified | Typed answer remains editable; focused tests now preserve leading/trailing spaces in the demo request and displayed turn. Member 2's provisional parser still trims reported answers (QA-003). |
| P04 | Partially verified | The demo sends a turn through `/api/demo/intake` and exposes pending/error UI; browser tests intercept responses. No idempotent persisted response acknowledgement. |
| P05 | Partially verified | Member 1 follow-up behavior passes library tests; the browser displays a distinguishable mocked follow-up. No successful live AMD response on this host. |
| P06 | Partially verified | A browser test sees a text status only while a request is pending and sees it disappear on resolution. Initial pre-state pending feedback is limited to the Stop control; no configured live AMD inference was observed. |
| P07 | Partially verified | Mocked 503 and the unconfigured local demo route show failure handling; the original answer stays editable. Live AMD timeout/invalid-output behavior was not browser verified. |
| P08 | Blocked | Not answered appears in synthetic presentations; no skip control records an authoritative answer. |
| P09 | Blocked | Unknown appears in synthetic presentations; no uncertainty control records an authoritative answer. |
| P10 | Verified — presentation only | Synthetic correction and original are both visible; no correction save. |
| P11 | Verified — presentation only | Synthetic review and Member 1 brief-builder output expose source text; no retrieved patient brief or live inference result. |
| P12 | Blocked | No persisted brief correction/version operation. |
| P13 | Verified — presentation only | Mocked demo confirmation renders “Confirmed · Not submitted”; the separate review preview keeps confirmation disabled. No authoritative confirmation record. |
| P14 | Blocked | No submission operation or acknowledged Submitted reference. |
| P15 | Blocked | No persistence-backed failed-submission recovery. |
| P16 | Blocked | No authoritative duplicate/uncertain-submission contract. |
| C01 | Blocked | No authenticated clinician case list, empty state, or retrieval error UI. |
| C02 | Blocked | No authorized case detail route or returned brief. |
| C03 | Blocked | No authoritative case status loaded in a clinician UI. |
| C04 | Blocked | Patient fixture sources open correctly, but no clinician source-linked case retrieval exists. |
| C05 | Blocked | Patient fixture states remain distinct, but no clinician brief displays returned information states. |
| C06 | Blocked | No clinician editor or unsaved-edit distinction in an authorized case. |
| C07 | Blocked | No clinician revision save acknowledgement. |
| C08 | Blocked | No clinician save failure/conflict UI. |
| C09 | Blocked | No authorized finalization action or returned Finalized status. |
| C10 | Blocked | Pure ownership/assignment guards pass Member 2 tests; no denied authenticated browser retrieval. |
| C11 | Blocked | Pure finalization guard passes Member 2 tests; no denied browser finalization operation. |

The demo route's answer parser and composer now preserve raw nonblank text. QA-003 remains open because Member 2's separate provisional parser still returns trimmed text. The Phase 10 handoff records the integration decision needed before connecting that parser to persistence.

## Phase 6 frontend-only evidence (2026-10-17)

| Criterion | Evidence | Full criterion |
|---|---|---|
| P02 | Verified local empty/whitespace rejection, linked error, focus, preserved input, and no request from the local check in component/Chromium tests. | Blocked by Member 2 persistence and shared final validation rules. |
| P03 | Verified first and second local drafts remain editable; exact locally checked first response appears in the preview. | Integrated question/response association and persistence remain blocked by Members 1 and 2. |
| P05 | A fixed **synthetic follow-up presentation prototype** was verified with explicit fixture provenance. This is UI evidence only. | Blocked by Member 1; no saved response or valid AI result was tested. |
| P06 | No loading UI was simulated or evaluated. | Blocked/not evaluated; no AI request or pending signal exists. |

See [Phase 6 patient interaction evidence](phase-6-patient-interaction-preview.md) and the [test plan](test-plan.md). All other criteria remain unpassed.

## Phase 7 synthetic information-state evidence (2026-10-17)

The static `/intake/states` prototype verifies presentation of five **provisional** labels with synthetic content: Reported retains a patient statement; Unknown retains explicit uncertainty; Not answered invents no response; Unclear retains ambiguous wording; Conflicting displays both statements without choosing one. Text labels and explanations carry meaning without relying on color. See [Phase 7 scenario evidence](phase-7-information-state-preview.md).

This is **synthetic presentation prototype verified**, not integrated behavior. C05 remains blocked by Member 1 information-state/source contracts, Member 2 authorized clinician data, and shared state semantics. P08 skip and P09 uncertainty interactions were not implemented or evaluated. No criterion is newly passed in full.

## Phase 8 merged-contract review evidence (2026-10-17)

Member 1's v1.0 `InformationStatusSchema` now includes the five Phase 7 labels; their semantics are no longer wholly provisional on the AI side. The Phase 7 sentence above records its historical gate at the time. Member 2's authorized case/review data and the shared application mapping remain unavailable. `/intake/review` is a visibly synthetic, contract-shaped preview and one component test renders a real Member 1 brief-builder result from made-up input. Neither is a live patient review. See [Phase 8 evidence](phase-8-patient-review-provenance.md).

| Criterion | Phase 8 classification | Observed evidence / remaining gate |
|---|---|---|
| P02 | Partially verified | Existing local empty/whitespace validation and preservation tests still pass; no real response save. |
| P03 | Partially verified | Existing local draft and exact-text tests still pass; no persisted question association. |
| P05 | Blocked | AI interview library now exists, but no saved-response-to-valid-follow-up application path was run. The UI follow-up remains a fixed synthetic example. |
| P06 | Blocked | No app AI pending signal or inference operation was observed. |
| P10 | Verified presentation only | Fixture correction points to a prior response and keeps both statements visible; no persistence acknowledgement. |
| P11 | Verified presentation only | Draft labels and source disclosure passed component/Chromium tests; one component test used `buildStructuredBrief`. No authenticated brief retrieval or real AI inference was run. |
| P12 | Blocked | No brief correction/version save operation or failure recovery. |
| P13 | Blocked | No authoritative patient confirmation operation; preview control is disabled. |

No criterion was upgraded to **verified by actual integration**. The review browser checks are fixture presentation checks, not service integration tests.

## Phase 9 UI refinement evidence (2026-10-17)

The redesigned landing, conversation, information-state gallery, and review passed 21 component and 17 Chromium tests using synthetic data. The landing concern is carried once within the same browser tab; no patient session is created or response persisted. The review still displays original statements, a later correction, draft wording, source disclosures, and distinct answer states. Source mismatch and missing-source handling remain covered. See [Phase 9 evidence](phase-9-ui-ux-clinician.md).

| Criterion | Phase 9 classification | Remaining gate |
|---|---|---|
| P01 | Blocked | The landing action opens a preview; Member 2 session creation and acknowledgement are unavailable. |
| P02 | Partially verified | Local empty/whitespace validation, preserved input, focus, and no write request pass; final shared validation and real submission are absent. |
| P03 | Partially verified | Exact editable local concern and second draft pass; no persisted question/response association. |
| P04–P07 | Blocked | No response save or application AI request/pending/failure path. The displayed follow-up is fixed and synthetic. |
| P08–P09 | Blocked | Static unanswered and unknown examples do not implement skip or uncertainty choices. |
| P10–P11 | Verified presentation only | Correction history, draft labels, and source disclosure pass with synthetic data; no authenticated retrieval or live AI draft. |
| P12–P13 | Blocked | No saved correction or authoritative confirmation operation. |
| P14–P16 | Blocked | No submission operation, acknowledgement, or recovery/deduplication contract. |
| C01–C11 | Blocked at application level | Member 2 has schema and pure authorization guards but no clinician UI, authenticated case operations, revision save, or finalization route. No clinician browser workflow could run. |

No full patient or clinician integration criterion passed in Phase 9. A future UI working state remains conditional on a real pending AI operation.

## Patient criteria

| ID | Given / When / Then |
|---|---|
| P01 — Start | **Given** the introduction is open, **when** the patient starts an intake, **then** the UI shows progress and shows an active session only after Member 2 acknowledges creation. |
| P02 — Initial response validation | **Given** the initial concern field is empty or invalid, **when** submission is attempted, **then** the field explains the problem and no response is sent. Exact validation limits require agreement. |
| P03 — Enter response | **Given** a question is active, **when** the patient types, **then** the text remains visible, editable, and associated with that question. |
| P04 — Submit response | **Given** a valid draft answer, **when** it is submitted, **then** the UI shows pending state, prevents accidental duplicates, and marks it saved only after acknowledgement. |
| P05 — AI follow-up | **Given** a saved response and valid AI result, **when** generation completes, **then** one distinguishable follow-up question is shown. |
| P06 — AI loading | **Given** inference is pending, **when** the patient views the conversation, **then** progress is visible and no invented question or completion is displayed. |
| P07 — AI failure | **Given** inference fails, times out, or returns invalid output, **when** the result is handled, **then** the UI explains failure, retains answers, and offers only an agreed retry. |
| P08 — Skip | **Given** skipping is permitted, **when** the patient skips, **then** the question is recorded under the agreed unanswered/skipped representation, never as denied. |
| P09 — Uncertainty | **Given** an active question, **when** the patient selects “I don't know,” **then** the UI records and displays Unknown distinctly from skip, denial, and Not asked. |
| P10 — Correct answer | **Given** an earlier answer, **when** a correction is saved, **then** the current version changes only after acknowledgement and the original remains traceable. |
| P11 — Review brief | **Given** a valid draft, **when** the patient opens review, **then** the brief is labeled AI-generated and grounded entries expose agreed source information. |
| P12 — Correct brief | **Given** an inaccurate draft entry, **when** the patient proposes a correction, **then** the proposed text survives a recoverable failure and the acknowledged version is distinguishable from the original. |
| P13 — Confirm | **Given** a reviewable draft, **when** the patient confirms, **then** the UI identifies the confirmed version but does not call it Submitted or Finalized. Whether confirmation is separately persisted is a shared decision. |
| P14 — Successful submission | **Given** an eligible confirmed version, **when** submission succeeds and persistence is acknowledged, **then** the UI displays the returned Submitted status/reference. |
| P15 — Failed submission | **Given** submission fails, **when** the result is shown, **then** no success message appears and confirmed information remains available for recovery. |
| P16 — Duplicate/uncertain submission | **Given** repeated activation or an uncertain network result, **when** the patient retries, **then** the UI prevents an accidental duplicate and checks the authoritative result under Member 2's contract. |

## Clinician criteria

| ID | Given / When / Then |
|---|---|
| C01 — Case list | **Given** an authorized clinician, **when** cases are requested, **then** the UI shows returned cases, a true empty state, or a clear retrieval error. |
| C02 — Authorized open | **Given** an available authorized case, **when** it is opened, **then** its returned brief and current status appear without implying a status transition merely from viewing. |
| C03 — Status | **Given** a case, **when** its status is displayed, **then** the label matches authoritative application status. |
| C04 — Sources | **Given** a grounded brief entry, **when** its source is opened, **then** the correct original patient response is shown; missing support is not silently concealed. |
| C05 — Information states | **Given** Unknown, Not answered, Unclear, or Conflicting data, **when** the brief is viewed, **then** each is named distinctly and conflicting sources remain inspectable. |
| C06 — Edit | **Given** an authorized editable draft, **when** the clinician changes it, **then** the UI identifies unsaved clinician edits separately from patient corrections and AI text. |
| C07 — Save | **Given** valid unsaved edits, **when** save succeeds, **then** the UI marks the acknowledged version saved. |
| C08 — Failed save | **Given** save fails or conflicts, **when** the result is shown, **then** edited text remains available and is not labeled saved. |
| C09 — Finalize | **Given** an eligible authorized draft, **when** the clinician explicitly confirms finalization and it succeeds, **then** the returned version displays Finalized. |
| C10 — Unauthorized access | **Given** access is denied, **when** case retrieval is attempted, **then** the UI shows an access result without exposing protected case content. |
| C11 — Unauthorized finalization | **Given** finalization is denied or invalid, **when** it is attempted, **then** the UI retains the prior status and never displays finalized success. |

## Evidence rule

A fixture or mock can verify presentation and component interaction only. It cannot pass an acceptance criterion that asserts actual persistence, authorization, live AI output, source correctness across real integration, or a case-status transition. For every eventual test, record the environment, synthetic input, expected and observed result, and whether dependencies were real or mocked.
