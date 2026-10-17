# ConsultPrep AI — Proposed Acceptance Criteria

Status: Phase 2 proposal, persisted for Phase 3 traceability. **No criterion has been executed or passed.** The repository currently contains no ConsultPrep patient or clinician workflow. Integration criteria are blocked until Members 1 and 2 deliver the corresponding contracts and runnable services. Use synthetic data only.

These criteria describe observable outcomes. Final API shapes, authorization rules, persistence behavior, AI behavior, and case status values remain with the responsible members or shared contract.

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
