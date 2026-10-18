# ConsultPrep AI — setup and handoff

**Purpose:** practical setup steps for the current repository, with the line between working previews, standalone AI tooling, and unfinished application integrations made explicit.  
**Use synthetic data only.** This prototype is not a diagnostic or treatment system and is not approved for real patient information.

## Repository and package layout

There is no root `package.json` or npm workspace. Install and run each package from its own directory:

- `frontend/`: Next.js 16, React 19, TypeScript, Tailwind, UI component and Playwright tests. The patient and clinician pages are local preview experiences.
- `packages/ai/`: standalone TypeScript AI package with Zod contracts, a local Qwen intake client, project-guidance retrieval, safety heuristics, and an optional AMD client. It is not imported by the frontend and has no HTTP routes or persistence.
- `backend/`: SQL migrations, Drizzle schema/config, authorization helpers, and persistence/review service contracts/tests. It has a local package for backend tests and Drizzle tooling, but no Supabase client, API route, or concrete database adapter yet.

The detailed contracts and limitations are in [AI integration](packages/ai/docs/frontend-backend-integration.md), [database setup](backend/DATABASE.md), [authentication](backend/AUTHORIZATION.md), [clinician review](backend/persistence/CLINICIAN_REVIEW.md), and the [test report](backend/TEST_REPORT.md).

## Prerequisites

- Node.js 22 LTS and npm.
- Git.
- Optional local database work: Supabase CLI, Docker, and PostgreSQL `psql` client.
- Optional AI local-model checks: network access for initial model downloads, disk space, and a CPU capable of running the quantized Qwen model.
- Optional AMD tests: AMD Token Factory credentials and a model/configuration approved for the project. These are not needed for the local intake CLI or the frontend preview.

## Project installation

Install frontend, AI, and backend package dependencies separately:

```powershell
Set-Location frontend
npm ci

Set-Location ../packages/ai
npm ci

Set-Location ../../backend
npm ci
```

There is no root `npm install`, root dev command, or shared dependency install. Backend tests use Node's built-in test runner; Drizzle schema checks and generation are available through the backend package scripts.

## Environment files

The root [`.env.example`](.env.example) is a reference inventory; it is not automatically loaded by either package. It contains blank placeholders only. Do not copy credentials into source code, commit a filled environment file, or put a server secret in a `NEXT_PUBLIC_` variable.

### Frontend

The current frontend preview runs without environment variables. Supabase variables are listed in `.env.example` for a future integration but no frontend Supabase client, login page, or authenticated API currently consumes them. If a future Next.js integration requires local values, place only the required values in `frontend/.env.local`.

### AI package

The AI package includes its own [`packages/ai/.env.example`](packages/ai/.env.example). For optional AMD-backed scripts, copy it to `packages/ai/.env` and fill `RADEON_API_KEY` and `RADEON_MODEL`; `RADEON_BASE_URL`, `RADEON_TIMEOUT_MS`, and `RADEON_REASONING_EFFORT` have documented defaults. The package's current interactive intake uses local Qwen and does not read these AMD settings or call AMD.

The AMD smoke and Q&A scripts require explicit one-request opt-ins. Do not set those flags by default. A live smoke sends one synthetic request and does not retry. Do not run it until offline checks pass and the project owner approves the chosen model/request.

### Database and authentication placeholders

`DATABASE_URL` is for applying local SQL or the uninstalled Drizzle Kit configuration; no runtime adapter uses it. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are reserved for future Supabase Auth integration. `SUPABASE_SERVICE_ROLE_KEY` is intentionally commented out in the example; only add it to a server-side secret store if a reviewed server implementation actually requires it. It must never reach the browser.

## Local database setup

The repository has SQL migrations, but no Supabase CLI project directory (`supabase/config.toml`) and no configured database. For a new local Supabase stack, initialize it once and review its generated configuration before starting:

```powershell
supabase init
supabase start
supabase status
```

Alternatively, use a dedicated disposable local Supabase project. Copy its local PostgreSQL connection string from the local status output into the current PowerShell session, then apply migrations in order from the repository root:

```powershell
$env:DATABASE_URL = "<local-supabase-postgres-connection-string>"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0001_initial.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0002_submission_receipts.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/migrations/0003_clinician_revision_order.sql
```

`0001` creates the core schema/RLS policies, `0002` adds submission receipts, and `0003` adds per-case clinician revision numbering. These are hand-authored SQL files. Do not run `drizzle-kit migrate`: Drizzle Kit is not installed/configured as a project script, and the runtime query adapter is not implemented.

### Synthetic seed and RLS check

1. In the local Supabase Auth UI/API, create four disposable synthetic users: `patient.demo@consultprep.test`, `patient.other@consultprep.test`, `clinician.demo@consultprep.test`, and `clinician.other@consultprep.test`. Use non-real credentials and do not reuse passwords.
2. The migration trigger creates profiles as patients. The local seed script promotes only the exact demo clinician and inserts one synthetic case:

   ```powershell
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/seed.sql
   ```

3. The optional read/RLS integration script impersonates authenticated users and rolls its test transaction back:

   ```powershell
   psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f backend/db/tests/authorization_rls.sql
   ```

These SQL commands and policies have not been run against a live local database in this handoff. Inspect the target and verify table/policy state before proceeding. Never use the demo role-promotion seed against a shared or production project.

### Remote / staging database

Create a separate Supabase development or staging project. Store its database connection in a secret manager, verify the project and backup, and first apply/test the migrations against a disposable local database. Apply migrations to staging only after the team verifies the target and approves the mutation. There is no deployment migration runner. Do not point local `psql` examples at production or a shared database. No migrations have been applied remotely.

## Authentication configuration

Supabase Auth and clinician login are not wired into the frontend or API. Setting Supabase environment values does not enable authentication. The intended design is:

1. Create Supabase users and resolve the identity using a server-side Auth call.
2. Load role from `public.profiles`; never accept a role or owner ID from browser JSON.
3. Check patient ownership or exact clinician assignment in every server operation.
4. Keep RLS enabled. Current SQL defines read policies only and deliberately no authenticated client writes.
5. Use a privileged server connection only after server-side identity/authorization checks. Never return service credentials.

See [AUTHORIZATION.md](backend/AUTHORIZATION.md) for setup details and the access policy. The guard functions are unit-tested, but there is no authenticated route, SSR client, live Supabase login, or RLS test execution yet. This is not production-ready authentication.

## Development commands

### Frontend preview

```powershell
Set-Location frontend
npm run dev
```

Open `http://localhost:3000`. The patient experience is under `/intake`, the information-state preview is `/intake/states`, and the clinician demo is `/clinician`. The pages use synthetic/local state; they do not call AI, authenticate, save, submit, or finalize records.

### Standalone AI intake CLI

From `packages/ai/`, build and start the local intake demo:

```powershell
$env:LOCAL_INTAKE_CHAT_CONFIRM = "START_INTERACTIVE_CHAT"
npm run chat:intake
Remove-Item Env:LOCAL_INTAKE_CHAT_CONFIRM
```

The first call can download/cache Qwen and embedding weights and may take time on CPU. It is a separate terminal demo; responses remain in process memory and are not sent to the frontend or persisted. It does not call AMD.

### Optional AMD smoke check

Only after successful offline AI checks, valid credentials/model configuration, and project-owner approval:

```powershell
$env:AMD_LIVE_SMOKE_CONFIRM = "RUN_SINGLE_REQUEST"
npm run smoke:amd
Remove-Item Env:AMD_LIVE_SMOKE_CONFIRM
```

Run from `packages/ai/`. This sends exactly one synthetic request; it is optional and not part of the normal local intake flow. Keep credentials in the package's ignored `.env` or a secret manager.

## Test and build commands

### Frontend (`frontend/`)

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
```

For browser tests, install the Chromium browser once if needed, then run:

```powershell
npx playwright install chromium
npm run test:e2e
```

`test:e2e` builds with the Webpack option and starts its own local production server on port 3217. Frontend tests cover the current synthetic previews, not real AI, auth, or persistence.

### AI package (`packages/ai/`)

```powershell
npm run typecheck
npm test
npm run build
```

Optional local embedding/retrieval check (may download model weights):

```powershell
npm run embeddings:check
```

### Backend contracts (`repository root`)

Using Node 22:

```powershell
node --experimental-strip-types backend/api/api-contracts.test.ts
node --experimental-strip-types backend/auth/authorization.test.ts
node --experimental-strip-types backend/persistence/consultation-persistence.test.ts
node --experimental-strip-types backend/persistence/clinician-review.test.ts
```

These backend persistence/review tests use in-memory transaction adapters. They do not establish PostgreSQL durability, locking, migrations, or RLS behavior. See [TEST_REPORT.md](backend/TEST_REPORT.md) for scenario-by-scenario evidence and gaps.

## AI service configuration and handoff

The server-side package is `@consultprep/ai` in `packages/ai/`. Its public service includes `startIntake()`, `continueIntake({ state, latestResponseId? })`, `generateBrief({ state })`, and `answerQuestion({ question, conversationHistory? })`; the corresponding versioned Zod schemas are in `packages/ai/src/contracts.ts`. The package currently offers a local Qwen intake client and local project-guidance retrieval. The retrieval corpus is not a clinical reference source; general health Q&A is not grounded in an approved clinical corpus.

The optional AMD client uses `RADEON_*` variables, not the older `AMD_API_*` names in planning documents. The live AMD client is not the current intake generation provider. No Next.js server route imports this package yet. Connect it server-side only, preserve Developer 1's schema/version and safety outputs, and do not put model/provider code or credentials in browser bundles. Follow the [integration guide](packages/ai/docs/frontend-backend-integration.md) before adding routes.

## Build and deployment

Build the frontend from `frontend/` with `npm run build`; run the built Next.js app with `npm run start`. The AI package can be compiled separately with `npm run build` inside `packages/ai/`; it is not currently bundled into or deployed with the frontend. No root Dockerfile/Compose file, CI/CD pipeline, environment provisioning, or database migration runner is present.

Do not deploy this as a patient-data application yet. Before a hosted demo with any user accounts, connect and test server-side auth, authorization, database transactions, RLS, API routes, secret management, and the agreed AI/safety contract. A deployment that uses local models also needs an explicitly tested Node runtime, CPU/memory budget, model cache strategy, cold-start behavior, and persistent storage as appropriate; serverless deployment suitability has not been established. Complete security, privacy, clinical, legal, and regulatory review before any real-world use.

## Known limitations and outstanding blockers

- The frontend patient and clinician pages are synthetic previews; page-state edits are lost on refresh.
- Backend schema/migrations and service contracts exist, but the concrete Supabase/Drizzle query adapter and application routes do not.
- Supabase Auth UI/SSR integration, role provisioning process, and live RLS verification are unfinished.
- The local AI package is implemented and offline-tested, but it is not connected to the frontend or backend session persistence.
- Map the AI package's `schemaVersion: "1.0"` structured contract and source IDs into the application's persisted JSON/reference tables before storing real generated output.
- Safety rules in the AI package are limited heuristics and synthetic triggers, not clinically validated triage. Urgent routing has no application-wide UI integration.
- The app has no real clinician assignment workflow, durable revision API, or persisted finalization endpoint.
- No real patient data, production security, clinical validation, formal regulatory approval, or production deployment has been authorized or demonstrated.
