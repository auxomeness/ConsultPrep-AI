# ConsultPrep AI — Repository Assessment

**Assessment date:** 2026-10-17  
**Branch observed:** `Dev2/backend`

## Executive summary

The repository is at an early scaffold stage. The runnable application is a minimal Next.js starter in `frontend/`; there is no implemented intake product, application API, authentication, database layer, migration, or AI integration. Project documents describe the intended product and technology choices, but they are requirements and planning material rather than working infrastructure. The `backend/` directory contains planning documentation only.

## Existing project structure

```text
.
├── backend/
│   └── IMPLEMENTATION_READINESS.md
├── frontend/
│   ├── app/
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── public/
│   ├── AGENTS.md
│   ├── CONTEXT.md
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md
│   └── tsconfig.json
├── DEV1.md
├── DEV2.md
├── DEV3.md
├── MASTERPLAN.md
├── README.md
└── TECHSTACK.md
```

`frontend/app/page.tsx` is the stock create-next-app landing page; `layout.tsx` and `globals.css` retain starter defaults. There is no root `package.json`, workspace configuration, root `.gitignore`, or separate backend runtime. The frontend's `.gitignore` ignores environment files and typical Next.js outputs.

## Current stack and dependencies

| Area | Current state |
|---|---|
| Framework and routing | Next.js 16.4.2 with App Router |
| UI runtime | React and React DOM 19.3.0 |
| Language | TypeScript 5, strict mode enabled |
| Styling | Tailwind CSS 4 with `@tailwindcss/turbopack` |
| Linting | ESLint 9 and `eslint-config-next` |
| Scripts | `dev`, `build`, `start`, `lint` (defined under `frontend/`) |
| Database / ORM | None installed or configured |
| Validation | No Zod or other runtime schema-validation package |
| Authentication | None installed or configured |
| UI component library | No shadcn/ui setup or other component library found |
| Testing | No Vitest, React Testing Library, or Playwright setup/scripts |
| Deployment / containers | No Docker or deployment configuration found |

The product documents propose Supabase PostgreSQL, potentially Drizzle, Supabase Auth, Zod, and AMD Token Factory. Those are proposed choices, not components currently present in the dependency graph.

## Existing application features

- The Next.js starter app can render its default landing page.
- Global styles, Geist font setup, and Next.js metadata are configured using starter defaults.
- Tailwind CSS is available for styling.
- ESLint and TypeScript configuration are present.

No ConsultPrep AI product workflow is implemented. No claim about persistence, security, AI behavior, patient intake, clinician review, or safety handling can be inferred from the planning documents alone.

## Existing database and authentication setup

- No database driver, ORM, Supabase SDK, schema, migration, seed data, or connection configuration was found.
- No `.env` file was found. The README lists proposed variable names, but there is no implemented loader or configuration validation.
- No Supabase Auth integration, session handling, roles, ownership checks, server authorization, or Row Level Security policy exists.
- No user or case records are persisted by the application.

## Existing API routes

There are no `route.ts` handlers, API endpoints, server actions, or backend service modules in the repository. The Next.js App Router is present, so route handlers can be added within `frontend/app/api/` if that remains the chosen application boundary.

## Missing features

### Patient workflow

- Purpose, limitations, and safety explanation.
- Intake creation and state persistence.
- Text conversation, follow-up question, skip/unknown handling, and correction history.
- Server-side AI request and response validation.
- Safety-routing behavior and urgent guidance.
- Structured brief review and patient correction.
- Explicit patient confirmation and duplicate-safe submission.
- Accurate loading, error, retry, and success states.

### Persistence and application APIs

- Agreed, versioned intake and brief contracts.
- Database schema, migrations, transaction boundaries, and idempotency constraints.
- Validated server APIs, consistent error responses, status-transition rules, and audit history.
- Verified database writes and readback before success is reported.

### Identity and access control

- Authentication, patient ownership model, clinician role/access model, and server-side authorization.
- RLS policies if direct Supabase database access is used.
- Secret handling and configuration checks for server-only credentials.

### Clinician workflow

- Authorized case list and case detail page.
- Original response history and source-linked brief fields.
- Distinction between patient statements, AI draft, patient corrections, clinician revisions, and final record.
- Persisted clinician revisions and explicit authenticated finalization.
- Protection against editing finalized records without an explicit amendment workflow.

### Quality and delivery

- Synthetic fixtures, unit/integration/UI tests, and practical end-to-end coverage.
- Accessibility and responsive workflow validation.
- Local setup, migration, environment example, deployment, and operational documentation.
- Verified acceptance evidence for AI, persistence, authorization, safety scenarios, and failure recovery.

## Architectural risks

1. **Requirements may be mistaken for implemented capability.** Root README feature descriptions are aspirational; the current app is still a starter. Demos and status reporting must distinguish planned from verified functionality.
2. **Shared AI contract is missing.** Developer 1's handoff in this repository is a task specification, not an implemented client or verified schema. Building against guessed response fields would create rework and could corrupt source traceability.
3. **Database and auth decisions are not operationalized.** Supabase, Drizzle, Auth, and RLS are discussed, but there is no project connection or access model. A privileged service-role shortcut without carefully scoped server authorization could expose all records.
4. **The ownership boundary needs care.** The existing frontend guidance assigns API/auth/database ownership to the backend developer and says not to migrate or rebuild those systems in the frontend workspace. Keep the Next.js app as the application host unless the team explicitly adopts a separate backend service.
5. **No automated test harness exists.** Status changes, idempotency, correction history, access boundaries, and failure behavior currently have no repeatable verification path.
6. **Hackathon compliance is unverified.** Project documents explicitly caution that direct AMD Token Factory access may not satisfy a separate self-hosted vLLM or Evolus requirement. Track eligibility must be established independently.
7. **Sensitive-data handling is only a requirement so far.** There are no implemented retention, logging, deletion, or access controls. Use synthetic data until those controls are in place and reviewed.
8. **No explicit status or schema contract has been selected.** The proposed lifecycle and entities remain conceptual. Independent choices by different developers could produce incompatible APIs, persistence, and UI states.

## Recommended implementation sequence

1. **Close readiness dependencies:** Verify event requirements and access to Supabase; obtain Developer 1's actual AI request/response, schema, source-reference, safety, and error contracts; agree on acceptance scenarios with Developer 3.
2. **Record application contracts:** Define versioned request/response schemas, lifecycle statuses and permitted transitions, source-reference behavior, error format, and role/ownership rules before wiring pages to persistence.
3. **Establish the persistence and security foundation:** Choose the database access approach; add non-destructive migrations, constraints, server-only configuration validation, authentication, server authorization, and applicable RLS. Keep original responses append-only and separate drafts, cases, and clinician revisions.
4. **Build one patient vertical slice:** Start an intake, save a synthetic patient response, call the actual Developer 1 service server-side, validate its result, and show the next step. Preserve the response and show a recoverable failure when inference is unavailable.
5. **Complete patient review and submission:** Add brief validation, source-linked review, append-only corrections, explicit patient confirmation, and transactional/idempotent submission. Confirm persisted state before showing success.
6. **Build clinician review and finalization:** Restrict case access server-side; present source links and information states; persist revisions; require explicit authorized finalization and record the responsible user and timestamp.
7. **Verify failure and safety behavior:** Exercise synthetic routine, urgent-routing, malformed-output, timeout, database-failure, duplicate-submit, invalid-transition, and unauthorized-access cases. Test the real integrations separately from explicitly labeled mocks.
8. **Prepare reproducible delivery:** Document environment setup and migrations, provide placeholder-only environment examples, add appropriate test scripts, and verify the deployment/demo flow against confirmed event rules.

## Assessment boundary

This assessment is based on repository contents and configuration inspection. No API, database, authentication provider, external service, or running application was available to verify. No database connection or destructive operation was attempted. No application code was changed as part of this assessment.
