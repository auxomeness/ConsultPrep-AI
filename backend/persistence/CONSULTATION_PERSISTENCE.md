# Consultation brief persistence (Deliverable 6)

## What is implemented

- `consultation_briefs` stores versioned JSON objects separately from clinician revisions. The standalone AI package defines structured brief schema version `1.0`; the field-to-column/reference mapping and integration validation still need implementation. `schema_version` allows the application to reject unsupported or malformed data instead of treating arbitrary JSON as valid.
- `brief_source_references` stores field paths, source response IDs, and optional excerpts. Composite foreign keys require the brief and response to belong to the same intake. Submission rechecks that every referenced response exists in that intake, and verifies the source links on read-back.
- Patient corrections append a new `patient_responses` record whose `supersedes_response_id` points to the earlier response. The prior statement is retained. Corrections are accepted only before patient confirmation. The application must then update/revalidate the proposed brief and source links before the patient confirms it.
- Submission is expressed as a single transaction through `ConsultationPersistenceDatabase`. The adapter contract requires locking the intake row, writing the case, status transition, and receipt atomically, and reading the records back before commit.
- `consultation_cases.intake_session_id` is already unique. Migration `0002_submission_receipts.sql` adds one globally unique idempotency key and one receipt per intake/case. Replaying the same key for the same submission returns the verified saved snapshot; reusing the key for another session or submitting with a new key after completion is rejected. The unique case constraint remains the backstop against concurrent duplicate cases.
- `lifecycle.ts` defines permitted forward transitions. Brief generation alone does not submit. Patient confirmation is required before submission; clinician finalization is a separate case/brief transition.

## Persistence contract

`submitConfirmedIntake` accepts the authenticated patient actor, intake session ID, patient-confirmed brief ID, and a UUID idempotency key. It requires a server-verified actor; callers must not construct `Actor.role` from request JSON. In one transaction it:

1. Locks and loads the session, then verifies patient ownership.
2. Verifies the brief belongs to that session and is `patient_confirmed`.
3. Verifies all brief source response IDs exist in the same session.
4. Inserts the submitted case, transitions the session to `submitted`, and inserts the idempotency receipt.
5. Reads the saved session, brief, source references, case, and receipt back; compares the structured brief JSON, schema version, source links, status, and relationships to the intended submission. A mismatch throws and must roll back the transaction.

The database adapter is intentionally not present yet. `ConsultationPersistenceTransaction` is an application contract, not a Drizzle/Supabase implementation. The repository currently has no database URL, installed Drizzle runtime, or configured Supabase project, so a real database transaction and persistence read-back have not been run. Do not report a case as saved until the production adapter's transaction commits successfully.

## Migration and verification

Apply `0002_submission_receipts.sql` after `0001_initial.sql` in a disposable local Supabase database, then inspect the constraints. Do not point the command at production or a shared database without the required approval. No migration has been applied by this work.

The unit tests use an in-memory transaction adapter. They verify append-only corrections, source-reference ownership checks, transaction rollback on read-back mismatch, same-key retry behavior, and lifecycle rules. They do **not** prove PostgreSQL locking, constraints, RLS, or network/database persistence. Before claiming database verification, add an integration test against local Supabase/PostgreSQL that races duplicate submissions and confirms exactly one case/receipt and byte-equivalent JSON/source references after a fresh read.

## Remaining integration work

1. Agree with Developer 1 on mapping the AI package's brief object, source identifiers, validation behavior, and schema version into these persistence tables.
2. Implement the transaction adapter using the agreed database access layer and the server-verified Supabase identity.
3. Ensure writes to briefs and source references occur as one transaction, and only validated structured outputs are marked `draft` or `patient_confirmed`.
4. Add route/server-action request validation and call this service only after explicit patient confirmation.
5. Run migration 0002 locally and add a real PostgreSQL integration test for concurrent duplicate submissions and rollback.
