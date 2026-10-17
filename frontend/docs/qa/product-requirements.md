# ConsultPrep AI — Proposed Product Requirements

Status: Phase 2 proposal, persisted for Phase 3 planning. No workflow or integration described here is claimed to be implemented or verified. All examples and future test data must be synthetic.

Core principle: **AI documents. Clinicians decide.** The product organizes patient-reported information before a consultation. It does not diagnose, prescribe, recommend treatment, or replace professional judgment.

## Ownership and contract status

- **Member 1:** AI inference, follow-up questions, structured brief generation, AI validation and safety results, and AI response contracts.
- **Member 2:** application APIs, persistence, authentication and authorization, patient and clinician workflow infrastructure, submission integrity, and case status transitions.
- **Member 3:** observable product behavior, UI/UX and accessibility, frontend states, synthetic UI testing, integration evaluation, and quality evidence.
- **Shared contract:** semantics or behavior that must be agreed before implementation. Status names, skip representation, corrections, source references, error retryability, and safety presentation remain provisional.

The current repository is a Next.js App Router starter with no ConsultPrep workflow. These requirements describe target observable behavior, not current functionality.

## Patient journey

Each item states the patient goal, starting state, action, visible response, operation states, validation and accessibility requirements, information-integrity rule, and primary dependency owner. Member 3 is responsible for the visible experience even when the primary dependency is another member.

1. **Introduction.** Goal: understand the tool and its limits. Start: no intake. Action: read and choose to begin. UI: explain information gathering and clinician review; offer a clear start action. Loading: none for static content. Success: patient can choose to start. Error/retry: a failed page load is recoverable by reload. Validation: none. Accessibility: semantic heading and keyboard-accessible action. Integrity: do not imply diagnosis or clinician approval. Owner: **Member 3**.
2. **Start intake.** Goal: create a session. Start: introduction. Action: activate Start intake. UI/loading: show pending creation and prevent repeat activation. Success: show the first prompt after Member 2 acknowledges creation. Error/retry: do not claim a session exists on failure; retry only under a duplicate-safe contract. Validation: any start prerequisites need agreement. Accessibility: announce pending and outcome, retain predictable focus. Integrity: navigation alone is not proof of creation. Owner: **Member 2**.
3. **Enter initial concern.** Goal: describe a concern in the patient's own words. Start: first prompt. Action: type in a labeled field. UI: keep text visible and editable; no loading while typing. Success: a local draft is ready. Error/retry: preserve text through recoverable interruption and allow editing. Validation: requiredness and length limits require agreement. Accessibility: associated label, instructions, and focus. Integrity: do not silently paraphrase the original. Owner: **Member 3**.
4. **Submit response.** Goal: record the answer. Start: valid draft. Action: submit. UI/loading: distinguish pending from saved and prevent repeat activation. Success: show saved only after Member 2 acknowledges the response. Error/retry: preserve the draft, show failure, and retry safely. Validation: block invalid input with field-specific feedback. Accessibility: announce status and errors. Integrity: retain response identity and original wording. Owner: **Member 2**.
5. **Wait for AI follow-up.** Goal: know that a next question is being prepared. Start: response acknowledged. Action: wait. UI/loading: show actual generation progress. Success: advance only on a valid question. Error/retry: show timeout or service failure and an agreed retry. Validation: malformed output must not be rendered as a question. Accessibility: announce material state changes without repeated interruptions. Integrity: keep accepted answers visible; invent no replacement question. Owner: **Member 1**.
6. **Display follow-up.** Goal: understand the next question. Start: valid AI result. Action: read. UI: show one primary question distinct from patient messages; end loading. Success: question becomes active. Error/retry: unusable output produces an error and agreed regeneration path. Validation: require agreed question identity and content. Accessibility: clear reading order. Integrity: do not present it as clinician advice. Owner: **Member 1**.
7. **Provide another response.** Goal: continue intake. Start: active follow-up. Action: enter and submit answer. UI/loading: associate answer with question and show save progress. Success: advance after acknowledgement. Error/retry: keep text and permit safe retry. Validation: agreed limits. Accessibility: current question labels the answer control. Integrity: preserve exact question/answer relationship. Owner: **Member 2**.
8. **Indicate uncertainty.** Goal: say “I don't know” without guessing. Start: active question. Action: choose an explicit uncertainty control. UI/loading: show a distinct unknown selection and save progress if needed. Success: advance after acknowledgement. Error/retry: retain selection; retry safely. Validation: do not demand invented free text. Accessibility: named control and text status. Integrity: unknown is neither skip nor denial. Owner: **Shared contract**.
9. **Skip when permitted.** Goal: proceed without an answer. Start: skippable question. Action: choose Skip. UI/loading: show pending record and then unanswered/skipped status. Success: advance after acknowledgement. Error/retry: retain active question and retry safely. Validation: honor agreed skip permission. Accessibility: separate named control. Integrity: never transform skip into denial; stored representation is provisional. Owner: **Shared contract**.
10. **Correct earlier response.** Goal: fix a statement. Start: response history. Action: edit and submit correction. UI/loading: distinguish proposed and saved correction. Success: show acknowledged version. Error/retry: retain proposed text for safe retry. Validation: agreed field rules. Accessibility: identify edited response and restore focus meaningfully. Integrity: original remains traceable. Owner: **Member 2**.
11. **Handle AI failure or timeout.** Goal: recover without losing information. Start: AI operation failed. Action: read error, retry or stop if offered. UI/loading: stop prior pending indicator; start another only during retry. Success: resume on a valid result. Error/retry: repeated failure remains explicit; retry policy is contractual. Validation: reject malformed output. Accessibility: announce error once and expose a keyboard-accessible action. Integrity: preserve accepted answers and invent no follow-up. Owner: **Member 1**.
12. **Review collected information.** Goal: verify original answers. Start: intake paused or ready for review. Action: open review. UI/loading: show responses, questions, and unresolved states; show retrieval progress if needed. Success: complete readable review. Error/retry: do not show an incomplete view as complete; retry retrieval. Validation: none until editing. Accessibility: navigable headings and answer groups. Integrity: keep patient statements separate from summaries. Owner: **Member 3**.
13. **Review generated brief.** Goal: inspect a proposed summary. Start: validated draft available. Action: open brief. UI/loading: label AI-generated draft, show source links and actual retrieval/generation progress. Success: render valid draft. Error/retry: explain missing or invalid output; regeneration needs agreement. Validation: schema and sources are integration requirements. Accessibility: structured sections and usable source navigation. Integrity: unsupported entries cannot appear as patient-reported fact. Owner: **Shared contract**.
14. **Correct information before submission.** Goal: repair inaccurate brief content. Start: reviewable draft. Action: propose correction. UI/loading: distinguish original, draft, and correction; show save/regeneration progress. Success: show acknowledged corrected version. Error/retry: retain proposed text and retry safely. Validation: agreed field rules. Accessibility: field label and result announcement. Integrity: preserve sources and correction history. Owner: **Shared contract**.
15. **Confirm information.** Goal: explicitly complete review. Start: reviewable draft. Action: confirm a specific version. UI/loading: explain meaning and show pending if stored separately. Success: show acknowledged confirmation. Error/retry: remain in review on failure; safe retry. Validation: agreed preconditions. Accessibility: clear action and feedback. Integrity: confirmation is not submission or finalization. Owner: **Member 2**.
16. **Submit intake.** Goal: send confirmed case for clinician review. Start: confirmed, eligible version. Action: Submit intake. UI/loading: show pending and prevent repeat activation. Success: submitted only after Member 2 verifies required writes. Error/retry: retain confirmed information; use duplicate-safe recovery. Validation: agreed submission preconditions. Accessibility: announce outcome. Integrity: submit the confirmed version. Owner: **Member 2**.
17. **Show truthful result.** Goal: know whether submission succeeded. Start: success, failure, or uncertain network outcome. Action: read result/check status. UI/loading: show returned reference/status on success; keep uncertainty distinct from failure. Success: verified persisted submission. Error/retry: check authoritative status before another attempt when outcome is uncertain. Validation: Member 2 response contract. Accessibility: announce outcome and next action. Integrity: AI text is never proof of submission. Owner: **Member 2**.

## Clinician journey

Only Member 2 defines and enforces authorization. These are visible behaviors for an authorized clinician.

| Step | Observable behavior | Primary owner |
|---|---|---|
| View cases | Show returned cases with loading, true empty, and retrieval-error states. | Member 2 |
| Identify status | Show an authoritative text status, never one inferred from brief text. | Shared contract |
| Open case | Open the selected authorized record; show denied/unavailable outcomes without exposing protected content. | Member 2 |
| View brief | Use structured sections and explicit draft/submitted/finalized labeling. | Member 3 |
| View original responses | Expose patient wording alongside or from the brief. | Member 3 |
| Inspect sources | Navigate from a grounded entry to correct original responses; flag absent support. | Shared contract |
| Identify unknown | Display Unknown as a text state. | Member 3 |
| Identify unanswered | Keep Not answered distinct from Unknown and Not asked. | Member 3 |
| Identify unclear | Show the clarification need and relevant original wording. | Member 3 |
| Identify conflicting | Make all relevant statements inspectable; do not silently resolve them. | Shared contract |
| Separate patient from AI | Label the provenance of substantive entries. | Member 3 |
| Separate corrections from edits | Distinguish patient corrections, clinician edits, and prior versions. | Shared contract |
| Edit authorized draft | Offer editing only when allowed; show unsaved changes. | Member 2 |
| Save | Show pending, then saved only after acknowledgement. | Member 2 |
| Handle failed save | Retain unsaved text, state failure, and offer safe retry/conflict handling. | Member 2 |
| Finalize explicitly | Require a distinct action and confirmation; viewing/saving never finalizes. | Member 2 |
| Verify finalized status | Display Finalized only after authorized operation and returned status/version. | Member 2 |

## Information and provenance states

The first seven rows describe information completeness/evidence. The last four describe provenance or review. **Shared contract:** these should not automatically be forced into one exclusive enum.

| State | Meaning and conceptual display | Must not become | Required support | Accessibility |
|---|---|---|---|---|
| Reported | Patient explicitly supplied it; label Patient reported. | Verified clinical fact or AI inference. | Patient response reference. | Text label, not color alone. |
| Patient denied | Explicit negative answer to a specific question. | Missing, skipped, or unknown. | Question and response. | Read subject and state together. |
| Unknown | Patient explicitly does not know. | Not answered or Not asked. | Response or explicit uncertainty event. | Say Unknown in text. |
| Not answered | Asked but no answer obtained. | Denial or Not asked. | Question identity and skip reason if recorded. | Keep question and status together. |
| Not asked | Information never requested. | Negative finding or unanswered question. | Coverage/question metadata if available; no patient source. | Say Not asked in text. |
| Unclear | Response exists but needs clarification. | Confirmed interpretation. | Ambiguous response. | Explain clarification need. |
| Conflicting | Statements appear inconsistent and unresolved. | Silently selected answer. | All relevant responses. | Make each statement navigable. |
| AI-generated interpretation | AI-organized or inferred draft wording. | Patient quotation or clinician conclusion. | Sources for patient-grounded claims; flag unsupported output. | State provenance in text. |
| Patient-corrected | Patient revised prior information. | Original answer or clinician edit. | Original and correction references. | Identify current and historical versions. |
| Clinician-edited | Authorized clinician changed draft wording. | Patient correction or AI draft. | Revision/version and prior context. | Identify edit provenance and save status. |
| Clinician-finalized | Explicit authorized finalization of a version. | AI draft, patient confirmation, or saved edit. | Finalization record/version; factual sources remain. | Announce status and date if provided. |

## Provisional case lifecycle — shared contract with Member 2

Names and transitions are **not final**. Temporary loading, timeout, and save failure are operation states, not necessarily case statuses. “Draft generated” and “awaiting patient confirmation” may be one case state with different UI wording. “Confirmed by patient” may be a persisted state or part of atomic submission.

| Proposed state | Meaning / actor reaching it | Available actions | Disabled actions | Member 2 support required |
|---|---|---|---|---|
| Intake in progress | Session exists; patient provides information. | Answer, permitted skip/unknown, correct, resume if supported. | Completed submission and clinician finalization. | Create/resume and response persistence. |
| Draft ready for review | Valid draft exists; patient has not confirmed. | Review, correct, confirm. | Submitted/finalized claims. | Draft validation, storage, version retrieval. |
| Confirmed by patient | Patient accepted a specific version. | Submit or inspect that version. | Silent rewrite and finalization. | Confirmation/version transaction or atomic submission. |
| Submitted | Required writes succeeded. | Patient receipt/status; authorized clinician access. | Ordinary patient edit unless amendment agreed. | Duplicate-safe submission and verified result. |
| Under clinician review | Authorized review explicitly began if this state is adopted. Merely opening a page need not transition. | Authorized edit/save/source inspection/finalize when eligible. | Patient or unauthorized clinician edits. | Permitted transition and version rules. |
| Finalized | Authorized clinician explicitly finalized a version. | View documentation and sources. | Ordinary draft edit or silent AI overwrite. | Finalization result and amendment policy. |

## Interface operation states

Every important interaction should account for idle, loading, empty, success, validation error, operation error, disabled, and retry states where applicable. Loading corresponds to an actual operation; success follows acknowledgement; errors preserve user text where feasible.

| Feature | Idle/empty | Loading/success | Validation/operation error | Disabled/retry and preservation |
|---|---|---|---|---|
| Start | Intro; no session. | Creation progress; first prompt after acknowledgement. | Explain prerequisites or creation failure. | Prevent repeats; safe retry per Member 2. |
| Answer/follow-up | Active question and draft; unanswered is explicit. | Separate save and AI progress; next valid question. | Keep draft; identify failed operation or malformed AI result. | Prevent duplicate send; preserve answers. |
| Brief | No brief means not generated. | Actual generation/retrieval; valid labeled draft. | Explain invalid/unavailable draft. | Preserve responses/corrections; agreed regeneration. |
| Submit | Confirmed version. | Pending; verified submitted receipt. | Explain incomplete or failed submission; distinguish unknown outcome. | Prevent repeats; check status before uncertain retry. |
| Clinician retrieval | True empty list or selected case. | Retrieval; authorized current record. | Explain failure/denial without case leakage. | Retry retrieval. |
| Clinician save | Unsaved authorized edit. | Pending; acknowledged saved version. | Mark invalid field or retain unsaved work on failure. | Prevent duplicate save; handle conflict by contract. |
| Finalize | Eligible authorized draft. | Pending; returned finalized version. | Explain unmet preconditions/failure; keep prior status. | Prevent repeats; resolve uncertain result before retry. |

Navigation away from unsaved work requires a deliberate warning or an agreed save/resume mechanism.

## Accessibility expectations

- Semantic landmarks and headings, associated form labels, instructions, named controls, logical reading and tab order, visible focus, and sufficient contrast.
- Field errors associated with inputs; important loading completion, errors, and status changes announced without repeated noise.
- Keyboard-accessible corrections, source links, retries, and confirmation dialogs; predictable focus after dialogs and edits.
- Information states, provenance, case status, and operation outcomes expressed in text, not only color or icons.
- Conversation, brief, source, and clinician comparison views usable at mobile, tablet, and desktop widths. These are implementation expectations, not an accessibility audit or compliance claim.

## Safety-related frontend expectations

- Describe information gathering accurately; never label AI output as diagnosis, treatment, medically verified finding, or clinician-approved record.
- If the agreed safety contract returns an urgent guidance state, display its approved message promptly. Routine intake loading or brief-generation failure must not hide it.
- Preserve the triggering patient statement where permitted. Do not generate substitute safety advice or infer safety from an absent flag.
- Member 1 and the shared product safety contract own detection and result semantics. Member 3 evaluates visibility and wording; no clinical thresholds are defined here.

## Member 1 contracts required

No final endpoint or schema is presumed.

| Contract | Minimum needed / why | Frontend work blocked |
|---|---|---|
| Follow-up result | Question identity, text, sequence/completion signal, validity. | Question display and answer association. |
| Structured brief | Versioned fields, draft status, information states, validation result. | Truthful brief review/correction. |
| Source references | Stable mapping from grounded entries to responses and missing-source behavior. | Source inspection and provenance checks. |
| Uncertainty/conflict | Distinct unknown, unclear, conflicting, unanswered semantics. | Accurate labels and tests. |
| AI failures | Timeout, unavailable, malformed, retryability. | Error and retry states. |
| Safety routing | Machine-readable state, interruption priority, approved guidance source. | Prompt safety UI and synthetic testing. |
| Correction/regeneration | Effect on draft, current version, retained history. | Safe pre-submission corrections. |

## Member 2 contracts required

| Contract | Minimum needed / why | Frontend work blocked |
|---|---|---|
| Intake create/resume | Acknowledged identity, status, allowed actions. | Truthful start/resume UI. |
| Response save/correction | Acknowledgement, identity/order, correction relationship, failure. | Saved-state feedback and traceability. |
| Case lifecycle | Final statuses, transitions, actor permissions, authoritative response. | Correct labels and controls. |
| Confirm/submit | Confirmed version, receipt, duplicate-safe behavior, uncertain-outcome recovery. | Truthful submission. |
| Clinician list/detail | Authorized records, status, brief/responses, empty/denied result. | Case workspace. |
| Edit/save | Eligibility, acknowledged version, validation, failure/conflict behavior. | Saved/unsaved state. |
| Finalization | Explicit eligibility, acknowledgement, resulting status/version, repeat-call behavior. | Finalization UI. |
| Authorization outcomes | Denied/unavailable/expired distinctions without leaking records. | Safe access feedback and negative tests. |
| Test environment | Synthetic accounts/records and safe failure cases. | Integrated acceptance/regression tests. |

## Shared decisions and current blockers

Agree on final status and field names; whether confirmation is separately persisted; skip representation and permission; post-confirmation corrections; missing/invalid source handling; retry and duplicate behavior; approved safety wording and interruption; when clinician review status begins; clinician revision/finalized amendment rules; and permitted local draft retention.

The current repository cannot yet support a real intake, AI follow-up, brief, source-linked review, persisted submission, clinician operation, or product end-to-end test. Member 3 can develop and evaluate clearly labeled UI-only components with synthetic fixtures. Such work cannot verify live AI or backend behavior.
