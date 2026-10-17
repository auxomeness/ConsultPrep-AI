# ConsultPrep AI — Frontend Architecture Proposal

Status: Approved Phase 3 planning baseline for incremental frontend work. This document is a design proposal, not verification of an implemented workflow. All lifecycle names, information schemas, source references, and operation contracts remain **provisional/shared contracts** until agreed with Members 1 and 2. Fixture-only UI must be labeled as such. No acceptance criterion is passed by this document or by a fixture preview.

Related documents: [Product requirements](product-requirements.md) and [Acceptance criteria](acceptance-criteria.md).

## Minimum screen map

Do not create a route for each conversational step. Each screen below states purpose, user, entry, content/actions, operation states, information, accessibility/responsive concerns, dependencies, and implementation readiness.

### S1 — Product introduction

- Purpose/user/entry: explain the product to a prospective patient at `/`, without an active intake.
- Content/actions: purpose, limitations, clinician role, and a clearly labeled preview action. A real Start intake action is unavailable until Member 2 provides session creation.
- Loading/empty/error/disabled: only normal page loading; empty is not applicable; page failure is recoverable by reload; any real Start action remains disabled with an explanation.
- Information/accessibility/responsive: no case facts; semantic main heading, named keyboard action, concise single-column mobile copy.
- Dependencies/readiness: no Member 1 data; Member 2 is required for real start. Introduction is implementable now; real start is blocked.

### S2 — Patient intake workspace

- Purpose/user/entry: initial concern and later one-question-at-a-time conversation at `/intake`; real entry follows an acknowledged session start.
- Content/actions: active prompt, labeled multiline response, Send, uncertainty, conditional Skip, response history/correction. Full review belongs to S3.
- Loading/empty/error/disabled: response-save and AI-generation progress are separate; first prompt is the empty-history state; field, save, and AI errors identify the failed operation; duplicate Send and unpermitted Skip are unavailable.
- Information/accessibility/responsive: distinguish patient text from AI question and unknown from skip; announce meaningful updates; keep form and actions usable at narrow widths.
- Dependencies/readiness: Member 1 question, failure, safety, completion contracts; Member 2 session, persistence, correction, permissions. Initial form is implementable now; conversation can be fixture-previewed; real flow is blocked.

### S3 — Patient review and confirmation

- Purpose/user/entry: review collected statements and valid AI draft, correct, then confirm a version at `/intake/review`.
- Content/actions: original answers, structured brief, information/provenance labels, source links, corrections, explicit confirmation, and allowed return to intake.
- Loading/empty/error/disabled: show true generation/retrieval/correction progress; absent brief says not generated; invalid brief or missing source is explicit; Confirm is unavailable until agreed prerequisites hold.
- Information/accessibility/responsive: distinguish original, AI wording, and patient correction; use navigable headings and source targets; stack brief and sources on smaller screens.
- Dependencies/readiness: Member 1 versioned brief/source contract; Member 2 versions, correction and confirmation operations. Fixture presentation possible; real review blocked.

### S4 — Submission result

- Purpose/user/entry: show authoritative outcome at `/intake/submitted` only after acknowledged submission.
- Content/actions: returned status/reference and next step; optional allowed return to status view.
- Loading/empty/error/disabled: verify uncertain status; direct navigation without a confirmed record cannot display success; failure and unknown outcomes remain separate; repeat submission is unavailable while outcome is unresolved.
- Information/accessibility/responsive: announce result in text; simple bounded single column.
- Dependencies/readiness: Member 2 submission, receipt, duplicate protection, status lookup/access; no Member 1 result proves submission. Fixture preview possible; real result blocked.

### S5 — Clinician case list

- Purpose/user/entry: find authorized submitted cases at `/clinician`.
- Content/actions: permitted case metadata, text status, open action, and optional agreed filter/refresh.
- Loading/empty/error/disabled: list retrieval, true no-cases state, access/retrieval error, and unavailable row action.
- Information/accessibility/responsive: status from Member 2, keyboard-operable rows, stacked mobile items without primary horizontal scrolling.
- Dependencies/readiness: Member 2 authentication, authorization, list/status; fixture list possible, real list blocked.

### S6 — Clinician case detail

- Purpose/user/entry: inspect brief against original responses, edit authorized draft, save, explicitly finalize at `/clinician/cases/[id]`.
- Content/actions: brief, source viewer, information/provenance labels, conflict group, editor, unsaved indicator, save and finalization dialog.
- Loading/empty/error/disabled: separate retrieval/save/finalization progress; name missing brief/source; denied access and failed operations stay explicit; controls reflect authoritative eligibility.
- Information/accessibility/responsive: correct source targets and version relationships; side-by-side comparison on roomy desktop, stacked or switchable panels on smaller screens.
- Dependencies/readiness: Member 1 brief/state/source semantics; Member 2 access/edit/save/version/finalization. Fixture presentation possible; real actions blocked.

## Proposed App Router routes

| Route | Purpose and separation | Expected access | Synthetic fixture use |
|---|---|---|---|
| `/` | Public introduction without an active case. | Public presentation proposed; Member 2 confirms access policy. | Yes. |
| `/intake` | Initial concern and conversation share one route. | Patient session/access policy TBD; Member 2 enforces. | Yes, visibly labeled UI preview only. |
| `/intake/review` | Distinct review boundary for statements, draft, corrections and confirmation. | Patient access to relevant draft enforced by Member 2. | Presentation only. |
| `/intake/submitted` | Stable acknowledged result; route alone cannot prove success. | Member 2 verifies status and access. | Labeled preview only. |
| `/clinician` | Case-list workspace. | Clinician authentication/authorization by Member 2. | Synthetic list preview only. |
| `/clinician/cases/[id]` | Brief, sources, editing and finalization share one detail route. | Case-level authorization by Member 2. | Synthetic case preview only. |

No API route, authentication middleware, or authorization implementation is specified here.

## Component plan

Conceptual inputs are presentation props, not final service schemas. Build a component when its first use exists; do not scaffold this entire list in the first slice.

| Component / scope | Responsibility and conceptual inputs | Important states / accessibility | Data dependency |
|---|---|---|---|
| App shell / shared | Landmarks and bounded content; children/audience. | Reading and navigation order. | None. |
| Page header / shared | Title, description, optional action. | Heading hierarchy and wrapping. | None. |
| Text status / shared | Case, information or provenance label/meaning. | Text always present, never color only. | Shared M1/M2 semantics. |
| Operation feedback / shared | Loading, empty, error, retry message/action. | Announced change and named retry. | Real error contract. |
| Form field / shared | Label, instructions, control and error. | Focus, associated error, disabled/pending. | None. |
| Confirm dialog / shared | Explicit high-consequence action and consequence. | Focus entry/return and keyboard behavior. | Member 2 eligibility/result. |
| Brief section / shared | Heading, entries and labels. | Empty/missing entry; semantic section. | M1 brief, M2 version. |
| Source link / shared | Navigate from entry to original response. | Missing-source state and target focus. | Shared source contract. |
| Product introduction / patient | Purpose, limits and preview/real start availability. | Clear static copy and action name. | Member 2 for real start. |
| Intake progress / patient | Current stage and permitted next step. | Text progress, no invented percentage. | Member 2 status. |
| Conversation turn / patient | Question or response, speaker, text, state. | Pending/saved/corrected reading order. | M1 question; M2 response. |
| Response composer / patient | Draft, local validation, Send, unknown and conditional Skip. | Field error, pending, focus. | M2 save; shared skip/unknown. |
| Response history / patient | Earlier answers and correction entry. | Current/prior versions and keyboard edit. | Member 2 history. |
| Patient review / patient | Collected statements and draft. | Missing brief/source, correction, headings. | M1/M2. |
| Confirmation/result / patient | Explicit confirmation and authoritative receipt. | Eligibility, pending, failure, announced outcome. | Member 2. |
| Case list/row / clinician | Authorized cases and navigation. | Loading/empty/error, keyboard row action. | Member 2. |
| Source viewer / clinician | Original response supporting selected entry. | Missing source and focus return. | Shared M1/M2 source data. |
| Conflict group / clinician | All unresolved statements and sources. | Distinct text labels and navigation. | Shared contract. |
| Clinician editor / clinician | Authorized edit and unsaved state. | Read-only/editing/saving/conflict. | Member 2. |
| Finalization control / clinician | Eligibility, confirmation and result. | Disabled/pending/error/finalized. | Member 2. |

The first implementation slice only needs the product introduction, initial response composer, and minimal shared page styling. Do not install a component library simply because planning documents mention one.

## Frontend state boundaries

| Information | State owner | Presentation rule |
|---|---|---|
| Typed unsaved answer | Local component | Preserve through validation and recoverable in-page error; never call saved. |
| Active question | Workflow result mediated by Member 2 | Member 1 defines AI content; current question must be agreed/valid. |
| Response save and AI progress/error | Separate page operation states | Never show fake loading or infer success from AI text. |
| Persisted response/identity | Member 2 authoritative result | Replace pending only after acknowledgement. |
| Unknown/skip selection | Local until accepted, then Member 2 | Semantics and permission remain shared decisions. |
| Proposed correction | Local until Member 2 acknowledgement | Preserve original and version relationship. |
| Generated brief/sources | Member 1 result validated/exposed by Member 2 | Draft, versioned, provenance labeled. |
| Case status/allowed actions | Member 2 authoritative result | Do not derive from route, click, or model wording. |
| Clinician unsaved edit | Local detail-page state | Keep separate from saved version. |
| Save/finalization progress/error | Detail-page operation state | Failure retains prior authoritative status. |
| Labels/grouping/formatting | Presentation derivation | Map agreed values; client controls do not enforce authorization. |

Begin with React component state, page-level workflow state, URL identity where appropriate, and authoritative application results. A global-state library is not justified by the starter.

## Information and provenance presentation

Hierarchy: **case status → section → field value → information state → provenance → source/revision history**. An entry may carry both an information-state label and provenance label. Reported and denied require explicit patient sources. Unknown, Not answered, and Not asked use distinct text. Unclear retains original wording. Conflicting shows every relevant statement; do not visually choose a winner. AI interpretation is labeled draft text. Patient corrections and clinician edits retain previous versions. Finalized is shown only from Member 2's result. Missing support is named, never represented as a valid link. No distinction depends on color alone. Exact colors and final vocabulary remain provisional.

## Minimal visual foundation

Use existing Tailwind CSS. Establish readable page/section/label/body hierarchy; bounded conversation and review widths; modest mobile padding; a small consistent spacing, border and radius vocabulary; labeled fields; one primary action per stage; secondary actions that remain reachable; explicit high-consequence finalization; text-first status; restrained panels and conversation messages; visible focus. Design mobile first and enhance at existing responsive breakpoints. Avoid another CSS framework or a large component system for the first slice.

## Responsive specification

| Category | About 375px | About 768px | About 1280px |
|---|---|---|---|
| Introduction/intake | Single column, modest padding, full-width field, stacked/wrapped actions, keyboard-safe controls. | Bounded conversation column. | Bounded lines with surrounding breathing room. |
| Patient review | Statements, draft and sources stack. | One main reading flow. | Optional brief/source side-by-side comparison. |
| Submission result | Single clear outcome column. | Same with comfortable spacing. | Same; avoid oversized line length. |
| Clinician list | Stacked case items, no primary horizontal scroll. | Compact rows/cards. | May show more permitted metadata. |
| Clinician detail | Stack or accessibly switch brief/source panels. | Stack or two columns if width permits. | Side-by-side brief/source comparison. |
| Dialogs/sticky actions | Fit viewport; never cover field/error/action. | Bounded dialog. | Readable width and managed background focus. |

## Accessibility implementation expectations

Use semantic main/navigation landmarks, one clear page heading, ordered sections, actual links/buttons, associated form labels/instructions/errors, logical tab order, visible focus, and text status. Announce meaningful operation outcomes without repeatedly announcing the conversation. Keep focus predictable after new questions, corrections and dialogs. Dialogs require accessible title/consequence and focus management. Source links need descriptive names and target/return focus. Test stacked and side-by-side reading order. These are implementation expectations, **not a WCAG compliance claim**.

## Synthetic UI-development fixtures

Fixtures are not final API schemas and must never be presented as live integration evidence. Minimal scenarios: routine concern; explicit unknown; allowed skip; original plus correction; ambiguous wording; two conflicting responses; AI-labeled draft; correct source link; missing source; AI timeout/unavailable; failed submission; clinician unsaved edit; failed clinician save; finalized synthetic case. Use made-up information only and visibly label preview routes.

## Acceptance traceability

All criteria below are unpassed. “Implementable with fixture” means presentation/component testing only. The listed gate describes what is needed for the full criterion.

| Criterion | Screen/component | Dependency | Test level | Gate |
|---|---|---|---|---|
| P01 | S1→S2; introduction/start feedback | Member 2 session | End-to-end | Blocked by Member 2 |
| P02 | S2; response composer/field | Shared validation limits | Component | Implementable with fixture |
| P03 | S2; response composer | None for local draft | Component | Implementable with fixture |
| P04 | S2; composer/feedback | Member 2 save | Integration | Blocked by Member 2 |
| P05 | S2; conversation turn | Member 1 question | Integration | Blocked by Member 1 |
| P06 | S2; operation feedback | AI pending signal for real run | Component | Implementable with fixture |
| P07 | S2; feedback/composer | Member 1 error contract | Integration | Blocked by Member 1 |
| P08 | S2; composer/status | Shared skip rule | Component | Blocked by shared contract |
| P09 | S2; composer/status | Shared unknown rule | Component | Blocked by shared contract |
| P10 | S2/S3; history/correction | Member 2 history | Integration | Blocked by Member 2 |
| P11 | S3; review/brief/source | Member 1 brief/source | Integration | Blocked by Member 1 |
| P12 | S3; review/correction | Shared version rule | Integration | Blocked by shared contract |
| P13 | S3; confirmation | Member 2 confirmation | Integration | Blocked by Member 2 |
| P14 | S3→S4; confirmation/result | Member 2 submission | End-to-end | Blocked by Member 2 |
| P15 | S3; feedback/confirmation | Member 2 failure | Integration | Blocked by Member 2 |
| P16 | S3/S4; confirmation/result | Member 2 duplicate lookup | End-to-end | Blocked by Member 2 |
| C01 | S5; case list/row | Member 2 list | Integration | Blocked by Member 2 |
| C02 | S5→S6; case detail | Member 2 authorized detail | End-to-end | Blocked by Member 2 |
| C03 | S5/S6; text status | Shared lifecycle | Unit/component | Blocked by shared contract |
| C04 | S6; source link/viewer | Shared source format | Integration | Blocked by shared contract |
| C05 | S6; status/conflict group | Shared state examples | Component | Implementable with fixture |
| C06 | S6; clinician editor | Member 2 edit eligibility | Integration | Blocked by Member 2 |
| C07 | S6; editor/feedback | Member 2 save | Integration | Blocked by Member 2 |
| C08 | S6; editor/feedback | Member 2 failure/conflict | Integration | Blocked by Member 2 |
| C09 | S6; finalization/dialog | Member 2 finalization | End-to-end | Blocked by Member 2 |
| C10 | S6; access feedback | Member 2 authorization | End-to-end | Blocked by Member 2 |
| C11 | S6; finalization feedback | Member 2 authorization | End-to-end | Blocked by Member 2 |

## Dependencies, blockers and first slice

Member 1 must supply question, brief/source, state, AI error and approved safety contracts. Member 2 must supply session, persistence, authoritative status, submission and clinician authorization/operations. Shared decisions include status vocabulary, skip/unknown, source-missing, corrections, retry, safety wording and review transitions. The current starter cannot support a real product end-to-end test.

The first implementation slice is **introduction → clearly labeled intake UI preview → initial-concern field → local validation**. It may prove responsive presentation, keyboard/focus behavior, and retention through validation errors. It must not claim session creation, saved response, AI follow-up, review, submission or clinician operation. P02 and P03 may be evaluated for their frontend portions only; all full integration criteria remain unpassed until their dependencies are actually verified.
