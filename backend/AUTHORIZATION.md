# Authentication and authorization

## Current status

The repository does not yet have Supabase Auth dependencies, a Supabase project configuration, Next.js API handlers, or a running database. This deliverable adds server-side authorization guard functions and tests plus a Supabase RLS integration test script. It does not claim that login is wired into the Next.js UI or that any database policy has been applied.

The implementation model is Supabase Auth for identity, `public.profiles.role` for application roles, server-side record checks, and PostgreSQL RLS for authenticated reads. Never trust a role, owner ID, assigned clinician ID, or status sent by a browser. Resolve the user with Supabase Auth on the server, load their role from `public.profiles`, then load the target record and apply the guards in `auth/authorization.ts`.

## Authentication setup

1. Create a Supabase project for development. Use synthetic users only. Keep local and hosted projects separate.
2. Configure the following server environment variables in the Next.js deployment environment (and local ignored environment configuration):

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
   ```

   The service role key bypasses RLS. Keep it out of client components, `NEXT_PUBLIC_` variables, logs, and responses. Prefer user-scoped Supabase clients for reads; use service access only inside server routes when required, after checking the authenticated actor and resource permissions.

3. Install `@supabase/supabase-js` and `@supabase/ssr` in the Next.js `frontend/` workspace when the application integration is implemented. The current frontend has neither dependency, so no Supabase client is created by this deliverable.
4. Implement the standard Supabase SSR split: a browser client only for browser-auth flows; a server client using Next.js request cookies for route handlers/server components. For every sensitive handler, call `supabase.auth.getUser()` on the server (do not authorize from an unverified decoded token or `getSession()` alone), query the caller's `public.profiles` row, and reject missing/unknown roles.
5. Apply the reviewed SQL migration to local Supabase first, then a dedicated staging project. New Auth accounts receive the `patient` role from the migration trigger; user metadata cannot choose a role. Provision clinician roles only through a trusted operator/server process. The SQL demo seed promotes only its exact synthetic clinician identity and is for local use.
6. Configure redirect URLs and email/password or approved demo login settings in Supabase Auth. Do not disable verification or weaken production auth settings as an undocumented shortcut.

## Server-side authorization contract

`auth/authorization.ts` provides pure guards intended to run after the caller identity, application role, and record row have been read from trusted server-side sources:

- Patient reads/updates require role `patient` and `actor.userId === intake_sessions.patient_id`. Ownership failures return not-found to avoid confirming another patient's record exists.
- Intake submission requires the patient to own the session and its current status to be `confirmed_by_patient`.
- Clinician review/edit/finalize requires role `clinician` and exact equality with `consultation_cases.assigned_clinician_id`. Unassigned or differently assigned cases return not-found.
- Clinician finalization requires status `under_clinician_review`; finalized cases cannot be saved or finalized again.
- All database updates must use a transaction where multiple rows/statuses/revisions must move together. Derive actor, owner, assignment and status from server-side reads; ignore equivalents in request JSON.
- Return only the guard's safe error code/status to clients. Do not return query errors, role metadata for other users, or privileged database details.

An API handler should follow this order:

1. Validate request data with the agreed request schema.
2. Resolve the authenticated Supabase user server-side and retrieve the app role from `profiles`.
3. Fetch the target session/case from the database; return not-found if inaccessible or absent.
4. Call the relevant guard from `auth/authorization.ts`.
5. Perform the write and state transition transactionally; record the actor for revisions/finalization.
6. Confirm the write result before returning success.

Do not accept role/owner/status/finalization fields from client input. A service-role database client does not remove the need for these checks.

## Patient and clinician access rules

| Action | Required authorization |
|---|---|
| Read an intake session, responses, brief, or case as patient | Authenticated `patient`; session owner equals authenticated user ID |
| Submit intake | Patient owns session; explicit patient-confirmed state; submission is idempotent |
| Read clinician case | Authenticated `clinician`; case assigned to that exact clinician |
| Save clinician revision | Assigned clinician; case not finalized |
| Finalize case | Assigned clinician; current case status is `under_clinician_review`; save revision, finalizer ID, timestamp, brief and case statuses atomically |
| Set a user role or case assignment | Trusted server/admin provisioning only; never patient/client-controlled |

The migration enables RLS on all application tables. Authenticated users have select policies only for their own records and clinicians for assigned cases. It deliberately provides no client write policies. The `private.is_assigned_clinician` helper is `SECURITY DEFINER` to avoid recursive RLS and must remain in a schema not exposed through Supabase's Data API.

## Unauthorized-access tests

### Pure server guard tests

Run with Node 22's built-in test runner and TypeScript stripping:

```powershell
node --experimental-strip-types backend/auth/authorization.test.ts
```

These tests cover unauthenticated access, cross-patient access, wrong role, unassigned clinician access, incomplete patient confirmation, unauthorized finalization, and changes to finalized cases. They test the guard functions only; they do not prove Supabase login or RLS works.

### Supabase RLS integration checks

1. Apply `db/migrations/0001_initial.sql` and `db/seed.sql` to local Supabase.
2. Create synthetic accounts for `patient.other@consultprep.test` and `clinician.other@consultprep.test`; the seed/test SQL provisions their local roles.
3. Run from the repository root using a trusted local database URL:

   ```powershell
   $env:DATABASE_URL = "<local-supabase-postgres-url>"
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/tests/authorization_rls.sql
   ```

The RLS script impersonates Supabase's `authenticated` database role inside a rolled-back transaction. It checks that another patient and an unassigned clinician cannot read the synthetic case, an assigned clinician can read the case and source links, patients cannot promote their own role, and direct client response writes are rejected. It has not been run because no Supabase project or local database is configured in this repository.

## Demonstration-only shortcuts and limitations

- Synthetic demo accounts and a local seed are convenience fixtures only; do not use their credentials or role-promotion procedure in a hosted environment.
- Assignments are explicit. There is no shared clinician queue or administrator console. A trusted operator must assign the clinician before their RLS visibility begins.
- `authorization.ts` is not yet wired into Next.js route handlers because no handlers or Supabase SDK are present. The DB schema's RLS read rules are not a substitute for server-side authorization on service-role writes.
- RLS has not been applied or exercised against a database, and Supabase Auth settings have not been configured. The checks are implementation artifacts, not evidence of deployed security.
- This prototype has no production security, privacy, regulatory, or clinical approval. Use synthetic data only.
