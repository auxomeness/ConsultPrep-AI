# Clinician review workspace (Deliverable 7)

## Review experience

`frontend/app/clinician/page.tsx` provides a synthetic-only `/clinician` demonstration with an assigned-case queue, case status, draft brief, editable fields, source links into preserved patient responses, and visible unknown, unanswered, and conflicting information. It labels each item as AI-generated draft, patient-reported, patient-corrected, or clinician-edited. Source history stays visible and a correction does not replace the earlier statement.

The UI requires a deliberate checkbox before the finalization action. Because there is no authenticated API/database connection, Save revision and Finalize case return an explicit not-connected error and make no success/status claim. Edits are held in page state only. The page is demonstration UI, not an access-controlled clinical workspace.

## Server-side application contract

`persistence/clinician-review.ts` defines the backend operations expected when routes and the database adapter are connected:

- `listClinicianCases` returns cases assigned to the authenticated clinician only.
- `getClinicianCaseReview` requires exact clinician assignment, then validates that the brief, responses, and source references belong to the same intake.
- `saveClinicianDraft` validates a JSON object, locks the case, verifies assignment and non-finalized status, appends an immutable `draft_saved` revision, and moves `submitted` to `under_clinician_review`. It reads the revision and case state back before commit.
- `finalizeClinicianCase` requires an assigned clinician and `under_clinician_review`, appends a `finalized` snapshot from the newest clinician revision (or patient-confirmed brief if no edit was saved), updates brief and case statuses with a timestamp, then reads both states and the revision back before commit.

Revision snapshots use an explicit increasing `revision_number`, unique per case. The transaction adapter must lock the case before computing the next number, so concurrent clinician saves cannot claim the same number. Migration `0003_clinician_revision_order.sql` adds the sequence and backfills existing revision rows in a deterministic order.

Every route must obtain the user and role from server-verified Supabase Auth/profile data. Never accept clinician ID, case assignment, status, or finalized timestamp from the request body. RLS currently grants assigned clinician reads only; there are no client write policies. Server write operations must apply authorization before any privileged write and commit revision/status changes atomically.

## Verification and limits

The in-memory tests cover assigned case list/detail access, wrong-clinician rejection, append-only revision behavior, review/finalize transitions, and rejection of edits after finalization. They do not verify a live Supabase session, RLS, PostgreSQL locks, migration application, or durable revision writes. The repository still has no Supabase client, route handlers, configured database, or concrete transaction adapter. Do not present the demo workspace as secure or persisted until those pieces are implemented and integration-tested.

The brief object shape remains the generic versioned JSON contract because the actual Developer 1 structured brief schema has not been handed off. Field-level semantic validation, source path conformance, clinician revision API routes, responsive browser QA, and real database verification remain integration work.
