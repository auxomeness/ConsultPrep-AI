# ConsultPrep AI — Implementation Readiness

## Repository assessment

- **Application framework:** `frontend/` is a Next.js 16.4.2 app using React 19.3 and TypeScript 5.
- **Routing:** Next.js App Router (`frontend/app`). No API route handlers or server actions exist yet.
- **Current implementation:** `frontend/app/page.tsx` is the unmodified create-next-app starter page. Layout and global styles are also starter defaults. No patient intake or clinician workflow is implemented.
- **Dependencies and scripts:** Tailwind CSS 4 and ESLint are configured. The only scripts are `dev`, `build`, `start`, and `lint`. There are no Zod, Supabase, Drizzle, authentication, or test dependencies configured.
- **Database and authentication:** No Supabase client/configuration, schema, migration, database connection, auth flow, or authorization code was found. No `.env` files were found. The frontend `.gitignore` ignores env files.
- **AI integration:** No AI client or application API contract is present in the code. `DEV1.md` describes Developer 1's ownership but contains planning instructions, not an implemented integration or verified request/response contract.
- **UI conventions:** No existing product components or design system are present. The frontend workspace guidance assigns backend/API/auth/database ownership to Developer 2 and asks that its React/Next.js foundation not be replaced.
- **Backend folder:** Newly created and empty before this checklist. No migrations, routes, or backend implementation existed.
- **Working tree:** `git status` reported a clean branch (`Dev2/backend`) before this checklist was added.

## Readiness checklist

Status meanings: **Confirmed** means directly supported by repository contents; **Requires verification** means external facts, credentials, or implementation details are unavailable; **Design decision** means the team/project owner must choose or approve a direction.

| Area | Status | Finding / next action |
|---|---|---|
| Hackathon requirements and track eligibility | Requires verification | The project documents warn that AMD Token Factory use may not satisfy a self-hosted vLLM or Evolus requirement. Confirm the selected track and mandatory integrations from official event rules before claiming eligibility. |
| AMD Token Factory account access | Requires verification | No credential or successful API experiment is present. Developer 1 must verify access without committing credentials. |
| AMD endpoint, model, authentication, and request/response format | Requires verification | No endpoint or model has been verified in this repository. Use Developer 1's observed integration handoff; do not invent an interface. |
| Structured intake and source-reference schema | Requires verification | The repository contains conceptual requirements only. Agree on a versioned schema and source-reference shape with Developer 1 before wiring persistence or UI to it. |
| AI conversation and safety acceptance criteria | Requires verification | Requirements are described in project documents, but no concrete shared safety-routing contract or verified scenarios are implemented. Agree on events and synthetic scenarios with Developers 1 and 3. |
| Patient workflow | Confirmed — missing | Only the starter page exists. The consent/limitations introduction, intake conversation, review/correction, confirmation, and truthful submission states remain to be built. |
| Clinician workflow | Confirmed — missing | No case list, source-linked brief review, editing, revision, or explicit finalization workflow exists. |
| Authentication and authorization | Design decision | No mechanism exists. Choose the minimum demonstration auth and role/ownership model; server-side checks are required. If Supabase Auth is selected, define the identity-to-patient/clinician mapping and RLS approach. |
| Supabase PostgreSQL schema and migration strategy | Design decision | No database or migrations exist. Confirm Supabase project/connection ownership and the Drizzle-vs-Supabase-client boundary, then agree on lifecycle statuses and core entities before creating migrations. |
| Synthetic test scenarios | Requires verification | No fixtures or tests exist. Define routine, skipped/unknown, correction, contradiction, urgent-routing, malformed AI output, persistence failure, duplicate submission, and unauthorized-access scenarios with Developer 3. |
| Deployment and submission requirements | Requires verification | No deployment configuration or confirmed event packaging requirements exist. Confirm hosting, environment configuration, container, repository visibility, and demonstration requirements. |

## Smallest end-to-end milestone

After the shared AI contract and credentials are available, implement one server-side patient-response operation that validates a synthetic request, calls Developer 1's actual AI service, validates its response, and returns the next step while preserving the intake state on failure. Then add persistence and authorization before expanding to confirmed submission and clinician finalization. A mock can support UI development only if clearly labeled; it cannot establish real integration success.

## Immediate dependencies

1. Developer 1's implemented, verified AI service interface, structured schema, source-reference format, and safety/error contract.
2. Project-owner confirmation of available Supabase project credentials and the intended demo identity/role setup.
3. Project-owner or team confirmation of the hackathon track's mandatory infrastructure and integration rules.
4. Developer 3's agreed patient/clinician acceptance scenarios and safety UI wording.

No application code or database migration has been added in this readiness pass.
