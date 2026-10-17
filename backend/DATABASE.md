# Database setup and operations

## Model status and boundaries

This is a proposed v1 application-persistence model based on the product documents. The Developer 1 structured brief, source-reference and safety contracts, the final status vocabulary, and the team identity/authorization model have not yet been delivered or agreed in repository artifacts. Align those contracts before connecting the schema to production application flows. This migration is not evidence that any database is configured or has been changed.

The model includes:

- `profiles`: Supabase Auth identity plus trusted application role; new identities default to `patient` regardless of user metadata.
- `intake_sessions`: owner, lifecycle state, schema version, and timestamps.
- `patient_responses`: append-only original/unknown/skipped response records; corrections point to the superseded response rather than overwriting it.
- `consultation_briefs`: versioned JSON object drafts and confirmed/finalized snapshots, separate from the case.
- `brief_source_references`: field-to-response links with same-session foreign keys.
- `consultation_cases`: one case per intake; links one submitted brief and optional assigned clinician.
- `clinician_revisions`: immutable clinician save/finalization snapshots.

Lifecycle transitions are enforced by application server code, not just enum values or RLS. The initial contract allows sessions to reach `submitted`, cases to reach `under_clinician_review` or `finalized`, and briefs to distinguish `draft`, `patient_confirmed`, and `clinician_finalized`. Finalized content must be represented by an explicit clinician revision/snapshot; AI generation must never overwrite it.

## Files

- `db/schema.ts`: Drizzle definitions for enums, tables, foreign keys, indexes, and checks.
- `db/migrations/0001_initial.sql`: versioned initial PostgreSQL migration, including Supabase Auth profile provisioning and RLS policies.
- `db/migrations/0002_submission_receipts.sql`: additive submission idempotency receipt and same-session case relationship.
- `db/seed.sql`: idempotent synthetic case fixture only.
- `drizzle.config.ts`: Drizzle Kit configuration. It expects `DATABASE_URL` and Drizzle Kit to be installed in the backend workspace.

RLS policies grant authenticated users read access to their own patient records and clinicians read access only to cases explicitly assigned to them. No authenticated client write policies are defined. The intended write boundary is the server API, which must authenticate the caller, verify role/ownership, enforce permitted transitions, and use a server-only privileged connection only where required. The assignment helper lives in the `private` schema; verify that schema is not added to Supabase's exposed API schemas. If direct-to-Postgres app access is later chosen, add narrowly scoped write policies and test them before use.

## Local setup (Supabase CLI)

Prerequisites: Supabase CLI and Docker installed; run commands from the repository root. These commands target the local Supabase stack.

1. Start Supabase locally: `supabase start`.
2. Apply the migration using the local database URL shown by `supabase status`:

   ```powershell
   $env:DATABASE_URL = "<local-supabase-postgres-url>"
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0001_initial.sql
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0002_submission_receipts.sql
   ```

3. Create two synthetic Auth users in local Supabase Auth (or via the local Auth API): `patient.demo@consultprep.test` and `clinician.demo@consultprep.test`. Use disposable local-only passwords. The migration trigger creates both profiles with the `patient` role. The trusted local seed script promotes only the exact synthetic clinician account.
4. Seed the synthetic case:

   ```powershell
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/seed.sql
   ```

5. Verify the rows and relationships with read-only queries before using the fixture. The seed's UUIDs are deterministic and its inserts use `ON CONFLICT DO NOTHING`; to reseed after intentionally changing fixture content, edit the fixture IDs or remove only those known local fixture rows in dependency order.

The root `frontend/` package does not currently include Drizzle or Drizzle Kit. If the team adopts Drizzle for runtime queries and migration generation, install compatible versions in the chosen application workspace and add explicit scripts before using `drizzle.config.ts`. The hand-authored SQL migration remains the authoritative migration in this deliverable; regenerate and review SQL when the Drizzle schema changes.

## Remote setup

1. Create or select the intended Supabase development project and verify its owner, region, backup status, and target environment.
2. Store the direct PostgreSQL connection string in a secret manager or inject it into the shell as `DATABASE_URL`; do not save it in the repository, expose it through `NEXT_PUBLIC_`, or paste it into logs.
3. Review `0001_initial.sql` and the RLS behavior against the actual auth/clinician assignment workflow. Apply to a disposable local project first, then a dedicated staging project and verify tables, policies, trigger behavior, constraints, and read/write access with synthetic accounts.
4. Only after explicit confirmation of the target and approval to mutate it, apply this additive migration to the selected remote project using the team's approved migration runner. Do not use the local `psql` example pointed at production or a shared project by accident.
5. Promote clinician roles and assign demo cases only using a trusted operator/server process. Never allow a client to write its own role.

No remote or local migration was run as part of this deliverable.

## Recovery and rollback

- `0001_initial.sql` creates types, tables, trigger/function, indexes, and policies. It is intentionally additive and contains no `DROP`, truncate, or data rewrite.
- `0002_submission_receipts.sql` adds an empty table and constraints in a transaction. It does not modify existing intake data. Consult `persistence/CONSULTATION_PERSISTENCE.md` for the submission transaction contract and its unimplemented database adapter.
- There is no automatic down migration. For an unapplied migration, do not run it. For a failed transaction, PostgreSQL rolls back the transaction only if the runner wrapped the migration transaction; this SQL file itself does not open a transaction because migration tools manage that boundary differently. Inspect the target catalog before retrying.
- If already applied, prefer a new forward migration for corrections. Do not drop these tables or enum types to “roll back” a shared/production database. First take/verify a backup, capture the failure and affected objects, and get explicit approval for any destructive recovery.
- Preserve intake responses, source links, and clinician revisions. Deleting a session is restricted by foreign keys. Any retention/deletion process needs an explicitly approved policy and audited procedure.
- Before relying on unique constraints for submission idempotency, make the server submission operation transactional and verify duplicate-request behavior against the target database.
