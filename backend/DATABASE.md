# Database setup and operations

## Model status and boundaries

This is a proposed v1 application-persistence model based on the product documents. The standalone `packages/ai/` package now defines a versioned structured brief contract (`schemaVersion: "1.0"`), source identifiers, and safety events. The mapping of that AI contract into these tables, final application status vocabulary, and identity/authorization model still needs team agreement and implementation. These migration files are not evidence that a database is configured or has been changed.

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
- `db/migrations/0003_clinician_revision_order.sql`: adds a positive, unique per-case clinician revision number for deterministic history/finalization.
- `db/seed.sql`: idempotent synthetic case fixture only.
- `drizzle.config.ts`: Drizzle Kit configuration. It expects `DATABASE_URL` and Drizzle Kit to be installed in the backend workspace.

RLS policies grant authenticated users read access to their own patient records and clinicians read access only to cases explicitly assigned to them. No authenticated client write policies are defined. The intended write boundary is the server API, which must authenticate the caller, verify role/ownership, enforce permitted transitions, and use a server-only privileged connection only where required. The assignment helper lives in the `private` schema; verify that schema is not added to Supabase's exposed API schemas. If direct-to-Postgres app access is later chosen, add narrowly scoped write policies and test them before use.

## Local setup (Supabase CLI)

Prerequisites: Supabase CLI and Docker installed; run commands from the repository root. This repository does not currently have `supabase/config.toml`, so run `supabase init` once and review the generated local configuration before `supabase start`. These commands target the local Supabase stack.

1. Start Supabase locally: `supabase start`.
2. Apply the migration using the local database URL shown by `supabase status`:

   ```powershell
   $env:DATABASE_URL = "<local-supabase-postgres-url>"
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0001_initial.sql
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0002_submission_receipts.sql
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0003_clinician_revision_order.sql
   ```

3. To run the RLS authorization script, create four synthetic Auth users in local Supabase Auth (or via the local Auth API): `patient.demo@consultprep.test`, `patient.other@consultprep.test`, `clinician.demo@consultprep.test`, and `clinician.other@consultprep.test`. Use disposable local-only passwords. The migration trigger creates all profiles with the `patient` role. The local seed promotes only the exact synthetic clinician account.
4. If you want the demo case fixture, seed it locally:

   ```powershell
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/seed.sql
   ```

5. Run the RLS check and verify rows and relationships with read-only queries before using the fixture. The seed's UUIDs are deterministic and its inserts use `ON CONFLICT DO NOTHING`; to reseed after intentionally changing fixture content, edit the fixture IDs or remove only those known local fixture rows in dependency order.

The root `frontend/` package does not currently include Drizzle or Drizzle Kit. If the team adopts Drizzle for runtime queries and migration generation, install compatible versions in the chosen application workspace and add explicit scripts before using `drizzle.config.ts`. The hand-authored SQL migration remains the authoritative migration in this deliverable; regenerate and review SQL when the Drizzle schema changes.

## Remote setup

Use this procedure for a dedicated development or staging project. It is a setup checklist, not authorization to change a database. Do not use a production or shared project for this prototype.

1. **Create or select the Supabase project.** Confirm the project name and ID, organization/owner, region, and that it is the intended non-production environment. Record the project ID in team documentation; never put passwords or connection strings there.
2. **Check recovery readiness.** Confirm an appropriate backup/restore point exists and that the project owner knows how to recover it. Confirm whether any data already exists. Do not apply the initial schema over a database with unknown tables or policies.
3. **Rehearse on a disposable local Supabase database.** Apply `0001_initial.sql`, `0002_submission_receipts.sql`, and `0003_clinician_revision_order.sql` in order. Review the resulting table definitions, foreign keys, constraints, trigger, and RLS policies. Run `db/tests/authorization_rls.sql` with its four required synthetic Auth users. The repo has no Supabase CLI project configuration or migration runner, so use the manual SQL workflow documented under Local setup; do not run `drizzle-kit migrate`.
4. **Review the exact SQL and access model.** Check all three migration files and confirm that the `private` schema is not exposed in Supabase API settings. The current RLS policies are read-only, and the application has no authenticated API/database adapter. Do not connect a patient-facing app or enable client-side writes on this basis alone.
5. **Agree who is applying the change.** Obtain explicit project-owner approval for the exact staging project and migration set. Choose the team's approved migration runner and document the operator, target project ID, migration order, and recovery contact. No remote migration runner is configured in this repository. If the team chooses direct `psql`, use only a dedicated staging connection after checking its project identity; never reuse a production/shared connection.
6. **Secure the connection.** Retrieve the Supabase direct PostgreSQL connection string through the project's secret manager/settings and inject it into the operator's shell as `DATABASE_URL`. Do not save it in `.env.example`, source control, browser variables, chat, terminal transcripts, or logs. Use a database role with only the privileges needed to apply the approved migrations.
7. **Apply migrations in order after target re-verification.** The operator should verify the connection points to the approved staging project immediately before running SQL. Use the team's approved runner and record each migration's success/failure. The migration files are `0001_initial.sql`, then `0002_submission_receipts.sql`, then `0003_clinician_revision_order.sql`. Stop on the first error; inspect the database catalog and transaction outcome before retrying. Do not blindly rerun a partially applied migration.
8. **Verify the resulting schema and policies.** Read the database catalog to confirm the expected tables, enum types, indexes, foreign keys, and RLS-enabled state. Confirm the Auth-user trigger creates a `patient` profile and that an authenticated patient cannot read another patient's records. Confirm an assigned clinician can read only assigned cases. The SQL RLS test is an integration check to run with synthetic identities; it has not been run against a remote database as part of this work.
9. **Create synthetic identities through Supabase Auth.** Use non-real test accounts and disposable credentials. The trigger gives new accounts the `patient` role. Do not let users set their own role through user metadata or client requests. Promote a clinician and assign demo cases only through a trusted operator/server process after the authorization design is approved.
10. **Seed only an isolated demo project, if needed.** `db/seed.sql` promotes the exact `clinician.demo@consultprep.test` identity and inserts a synthetic case. It is documented as local-only; do not run it on shared staging or production. For a dedicated remote demo project, create a separately reviewed seed/migration that cannot promote arbitrary accounts, and get owner approval before running it.
11. **Record the outcome and remaining gaps.** Note the project ID, migration versions applied, verification results, and any failures without recording secrets or patient data. Database setup alone does not complete application integration: authentication routes, server-side authorization, a concrete transaction adapter, and live persistence tests are still required.

No remote or local migration was run as part of this deliverable.

## Recovery and rollback

- `0001_initial.sql` creates types, tables, trigger/function, indexes, and policies. It is intentionally additive and contains no `DROP`, truncate, or data rewrite.
- `0002_submission_receipts.sql` adds an empty table and constraints in a transaction. It does not modify existing intake data. Consult `persistence/CONSULTATION_PERSISTENCE.md` for the submission transaction contract and its unimplemented database adapter.
- `0003_clinician_revision_order.sql` assigns sequential numbers to any existing clinician revisions, then makes the number required and unique per case. It does not delete or rewrite revision content. Inspect the assigned ordering on a disposable local copy first; the migration has not been run here.
- There is no automatic down migration. For an unapplied migration, do not run it. For a failed transaction, PostgreSQL rolls back the transaction only if the runner wrapped the migration transaction; this SQL file itself does not open a transaction because migration tools manage that boundary differently. Inspect the target catalog before retrying.
- If already applied, prefer a new forward migration for corrections. Do not drop these tables or enum types to “roll back” a shared/production database. First take/verify a backup, capture the failure and affected objects, and get explicit approval for any destructive recovery.
- Preserve intake responses, source links, and clinician revisions. Deleting a session is restricted by foreign keys. Any retention/deletion process needs an explicitly approved policy and audited procedure.
- Before relying on unique constraints for submission idempotency, make the server submission operation transactional and verify duplicate-request behavior against the target database.
