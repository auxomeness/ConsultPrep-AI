# ConsultPrep AI — implementation readiness

## Repository assessment

- **Application:** `frontend/` is Next.js 16.4.2 with React 19.3, TypeScript 5, Tailwind CSS 4, and the App Router. It contains patient and clinician UI previews; they use local state and do not call application APIs or persist data.
- **Frontend scripts:** lint, typecheck, Vitest, Playwright, build, and start scripts are defined in `frontend/package.json`.
- **AI package:** `packages/ai/` is a separate TypeScript package with Zod contracts, local Qwen intake, project-guidance retrieval, safety heuristics, and an optional AMD client. It is not connected to frontend routes or persistence.
- **Backend artifacts:** `backend/` contains Drizzle schema definitions, three SQL migrations, synthetic seed and RLS SQL, authorization helpers, lifecycle/persistence/review contracts, and Node test suites. It is not a deployable server package: there are no application routes, Supabase client, or concrete database query/transaction adapter.
- **Authentication/database:** Auth policies and migration files are present but no Supabase project is configured, no migration has been applied in this report, and no live auth/RLS/persistence operation has been verified.
- **Integration status:** the AI package has versioned schemas and an actual standalone service, but application API integration, server-side identity enforcement, durable session state, and safety UI routing remain outstanding.

## Readiness checklist

| Area | Status | Finding / next action |
|---|---|---|
| Hackathon requirements and track eligibility | Requires verification | Check the selected track's official requirements. AMD Token Factory use may not satisfy a separate self-hosted vLLM or Evolus requirement. |
| AMD Token Factory account access | Requires verification | No credential or successful API experiment is recorded. Verify access without committing credentials. |
| AI contract | Partial | The standalone package defines versioned contracts and source IDs. Agree on mapping those schemas to persistence, statuses, and application routes with the team. |
| AI safety behavior | Partial / requires coordination | Heuristics exist, but the application has no integrated, clinically validated safety-routing workflow. Agree on events and synthetic scenarios with Developers 1 and 3. |
| Patient workflow | Preview only | `/intake` and `/intake/states` are UI previews. API calls, persistence, and browser-level workflow verification remain outstanding. |
| Clinician workflow | Preview and contracts present | `/clinician` is synthetic UI; backend operations and guard tests exist. Authenticated routes, DB adapter, durable writes, and live RLS verification remain outstanding. |
| Authentication and authorization | Not integrated | Choose/confirm identity provisioning and connect Supabase Auth to server-side ownership and clinician assignment checks. |
| Database schema and migration strategy | Artifacts present / live DB unverified | Drizzle schema and three SQL migrations exist. Apply to a disposable local database and validate the contracts before any staging use. |
| Synthetic test scenarios | Partial | Backend contract tests exist; browser, live DB, real auth/RLS, AI integration, and safety UI tests remain outstanding. See `TEST_REPORT.md`. |
| Deployment | Not configured | No root workspace, container, CI/CD pipeline, migration runner, or production environment is configured. |

## Recommended next sequence

1. Agree on AI schema/status/source mapping and safety events with Developers 1 and 3.
2. Apply migrations to a disposable local Supabase project and execute the seed and RLS script.
3. Implement Supabase Auth and server-side application routes with ownership and assignment checks.
4. Add a concrete transaction adapter and verify persistence, duplicate submission, and read-back against PostgreSQL.
5. Connect the patient/clinician previews to those routes and the actual AI package; add browser and integration tests.
6. Configure deployment only after auth, persistence, safety routing, and secret handling are verified.

See [SETUP_AND_HANDOFF.md](../SETUP_AND_HANDOFF.md) for exact current commands and limitations. This assessment does not claim any database migration was applied or any live integration works.
