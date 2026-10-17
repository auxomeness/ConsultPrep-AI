# Frontend test plan — Phase 10 handoff

Status: current plan as of 2026-10-18. The Phase 6–9 records below are historical and describe the UI at those checkpoints; they must not be used as the current route inventory. All test inputs are synthetic. The present intake demo can call Member 1's AMD service through a Next route when configured, but browser tests intercept AI responses and no Member 2 patient record or clinician workflow is connected.

## Current Phase 10 inventory and results

| Level | Inventory | Final evidence and limit |
|---|---|---|
| Frontend component | 6 files, 22 tests: homepage, composer, conversation, information states, patient review, Member 1 brief-to-review compatibility. | 22/22 passed. Fetch in conversation tests is mocked; review route data is synthetic. |
| Browser | 3 files, 17 Chromium tests: navigation, local validation, mocked pending/follow-up/failure/confirmation, pre-hydration safety, responsive homepage/intake/states/review, keyboard source disclosure. | 17/17 passed against a standard Turbopack production build. Route interception makes AI results fixtures. |
| Member 1 | 14 AI package files, 137 tests plus typecheck. | 137/137 and typecheck passed. Contracts, safety, service, and brief library are exercised without a live AMD credential. |
| Member 2 | `backend/api/api-contracts.test.ts` and `backend/auth/authorization.test.ts`, using `node --test`. | 13/13 passed. Pure parser/guard tests; no HTTP, auth session, database, or RLS execution. |

Current commands: from `frontend`, run `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run test:e2e`, and `npm run build`; from `packages/ai`, run `npm run typecheck` and `npm test`; from repository root, run `node --test backend/api/api-contracts.test.ts backend/auth/authorization.test.ts` and `git diff --check`. `test:e2e` now runs the **standard Turbopack build** followed by a local production server on port 3217. If its build hits QA-001, record that failure before any retry. The Webpack comparison is optional and currently fails before styling can be assessed because native ONNX binaries in the merged AI package are not handled by that bundler path.

Chromium coverage at 375, 768, and 1280px checks all four implemented routes for no horizontal overflow, visible controls, usable intake composer, state order, and review sources. A separate final visual pass inspected mobile screenshots of all four routes and desktop screenshots of home and review. The implemented routes each have one `<main>` and one `<h1>`. Browser tests cover keyboard navigation, focus outlines, source open/close, and a disabled pre-hydration send action. Selected contrast was tested historically; the current palette has not received a full contrast audit. No manual screen-reader or mobile assistive-technology test was performed; no WCAG claim is made.

The live demo route returns a sanitized 503 on this host because `RADEON_API_KEY` and `RADEON_MODEL` are absent. A 503 is not a successful AMD interaction. The locally saved conversation snapshots are browser storage, not Member 2 persistence. `/intake/states` and `/intake/review` remain plainly labeled synthetic fixture routes; the latter is separate from the active intake. Mocked confirmation is not submission or clinician finalization. Member 2's provisional reported-answer parser still trims patient wording (QA-003), so persistence integration remains gated on a shared raw-text contract.

## Historical Phase 6–9 plan and evidence

## Scope and environment

- Routes: `/` introduction; `/intake` initial concern → exact local response presentation → one fixed synthetic question → second local draft; `/intake/states` five synthetic examples whose labels match Member 1 v1.0 statuses; `/intake/review` contract-shaped synthetic review, separate from the local draft.
- Host used for this verification: Windows, Node.js 24.18.1, npm 11.16.0.
- Application: Next.js 16.4.2 App Router, React 19.3.0, strict TypeScript, Tailwind CSS 4.
- Component runner: Vitest 4.1.11, jsdom, React Testing Library, DOM Testing Library, and user-event.
- Browser runner: Playwright with headless Chromium; its web server runs a local **Webpack production build** on port 3217. This is a comparison path while the standard Turbopack build defect is open.
- Tailwind uses `@tailwindcss/postcss` for both build paths. No backend, authentication, or service mocks are present. One Phase 8 component test calls the real Member 1 brief builder with synthetic state; no live inference or app service is called.

## Commands

| Command | Purpose |
|---|---|
| `npm run lint` | ESLint for application and test files. |
| `npm run typecheck` | Existing strict TypeScript configuration, without output. |
| `npm run test:run` | One-shot component tests. |
| `npm run test` | Component-test watch mode for local work. |
| `npm run test:e2e` | Webpack production build, local server, then headless Chromium smoke tests. |
| `npm run build` | Standard Turbopack production-build gate; currently affected by QA-001. |
| `npm run build -- --webpack` | Comparison build; now emits Tailwind utility CSS. |
| `git diff --check` | Whitespace check. |

Run `npx playwright install chromium --only-shell` once on a new development machine before the browser suite. The browser binary is not a repository artifact.
Run the browser suite without another Next dev/build process using the same `.next` directory.

## Automated inventory

| Level | Check | Evidence target |
|---|---|---|
| Component | Response field has visible label, linked instructions, multiline editability, and retains state across rerender. | P03 frontend portion. |
| Component | Empty concern shows linked error, marks field invalid, focuses it, and shows no local completion status. | P02 frontend portion. |
| Component | Whitespace-only concern is rejected without erasing typed spaces. | P02 frontend portion. |
| Component | Valid synthetic text produces local-only feedback, with no saved, submitted, or AI-processed claim. | P02/P03 frontend portions. |
| Component | Introduction states product principle and limits; preview link targets `/intake` and does not imply a created record. | Introduction presentation. |
| Component | The exact locally checked concern, including whitespace and line breaks, appears in a distinct patient turn before one fixed question. The turn has no authoritative status. | P03 frontend portion; synthetic presentation only for P05. |
| Component | The question is labeled synthetic and explicitly states that neither AI nor a clinician authored it. | Fixture provenance presentation; P05 remains blocked. |
| Component | Second field has an accessible name, accepts edits, and keeps its local draft after the first concern is rechecked. | P03 frontend portion. |
| Component | Reported shows an original patient statement without presenting it as medical verification. | IS-01 synthetic presentation. |
| Component | Unknown shows explicit patient uncertainty and does not turn it into denial or missing data. | IS-02 synthetic presentation. |
| Component | Not answered shows an asked question, no fabricated patient quote, and a distinct missing-response explanation. | IS-03 synthetic presentation. |
| Component | Unclear retains the ambiguous original wording and names the need for clarification. | IS-04 synthetic presentation. |
| Component | Conflicting retains both statements in order, gives them equal styling, and leaves the difference unresolved. | IS-05 synthetic presentation. |
| Browser | Navigate `/` → `/intake` → `/`; check headings and preview limitations. | Route and truthfulness smoke. |
| Browser | Validate empty/whitespace/valid text, retained value, focus, error association, keyboard activation, and no non-GET request after local checks. | P02/P03 frontend portions. |
| Browser | With JavaScript disabled, the local-check button does not submit text into a query string. | Regression for the observed pre-hydration form defect. |
| Browser | Exact response text, three conversation turn labels/order, synthetic provenance, keyboard Tab to the second field, editable second draft, and no non-GET request or fake status. | Real browser presentation and keyboard behavior, not integration. |
| Browser | At 375, 768, and 1280px, the expanded conversation avoids horizontal overflow (including an unbroken word), second field remains usable, turn order is correct, focus is visible, and Tailwind utility styling is present. | Responsive/focus and Webpack styling regression. |
| Browser | Navigate from `/intake` to `/intake/states` and back with focused links and Enter; verify visible link focus, the provisional notice, all five labels, two conflicting quotes, and an explicit no-answer state. | Keyboard route access and information-state text distinctions. |
| Browser | At 375, 768, and 1280px, verify card order, readable bounded layout, no overflow including a long synthetic unbroken statement, and computed meaning-text contrast of at least 4.5 against the card background. | Responsive and targeted text-contrast evidence, not a full accessibility audit. |

No screenshot comparison is used. Semantic role and label queries are preferred. These checks are targeted accessibility evidence, **not a WCAG compliance claim**.

## Synthetic fixtures and manual checks

The component and browser tests type only invented phrases such as “A synthetic concern” and “I would like to discuss a made-up concern.” Empty and whitespace strings exercise validation. The fixed question is “When did this concern begin, and has it changed since then?” No real patient information is used.

The information-state fixtures are five small, replaceable UI-development examples; their shape and labels are not Member 1 or Member 2 contracts. [Phase 7 scenario evidence](phase-7-information-state-preview.md) records IS-01 through IS-05 separately from integrated-system acceptance.

Phase 4 included manual browser inspection of the styled introduction and intake preview at the three representative widths. Phase 6 extends automated browser checks for the expanded sequence at those widths. A later integrated workflow still needs manual usability and screen-reader review.

## Acceptance evidence and limits

- **P02 frontend portion:** component and browser tests verify local rejection, clear error association, preserved text, focus, no non-GET request during the local check, and no query-string submission with JavaScript disabled. Shared final validation rules and real persistence behavior remain unverified.
- **P03 frontend portion:** component and browser tests verify visible, editable local text, exact wording in the conversation preview, and an editable second local draft. A persisted response is not tested.
- **P05:** blocked by Member 1. Only synthetic follow-up presentation is verified; no AI result exists.
- **P06:** blocked/not evaluated. No inference request or real AI loading state exists.
- **Information integrity / C05 presentation:** the five provisional labels, exact synthetic statements, no-answer message, and unresolved conflict are verified as a static UI prototype. C05 remains blocked as an integrated clinician criterion; P08 and P09 interactions were not implemented or evaluated.
- **Full P02/P03 integration:** not passed. No session or response service is connected.

These tests do **not** verify AI integration, backend persistence, authentication, authorization, submission, consultation briefs, clinician workflows, or Member 1/Member 2 contracts. No fixture is presented as a real server or AI response.

## Build and dependency limitations

- QA-001 tracks the standard Turbopack child-process failure. The Webpack comparison build is the current browser-test path, not proof that the default build is healthy.
- QA-002 records the fixed Webpack Tailwind styling gap. The browser suite asserts the preview action has a nontransparent Tailwind background to guard it.
- On this host, sandboxed package downloads and some subprocess/temp-file operations can fail; approved execution outside the sandbox was used when the same command failed there.
- The latest local `npm audit --omit=dev` reported zero production-dependency advisories. The full audit still reports five high advisories in the existing ESLint/Next development-tool chain; no incompatible forced dependency change was applied.

## Phase 6 run (2026-10-17)

`npm run lint` and `npm run typecheck` passed. `npm run test:run` passed (7 component tests). `npm run test:e2e` passed (7 Chromium tests, including a styled Webpack build) when rerun outside the sandbox; the first sandboxed build stopped on an `EPERM` directory creation error during prerendering. Three consecutive standard Turbopack builds outside the sandbox passed. QA-001 stays open because earlier same-host runs failed intermittently; this limited run does not establish long-term reliability. See [Phase 6 patient interaction evidence](phase-6-patient-interaction-preview.md) for observed details.

## Phase 7 run (2026-10-17)

`npm run lint` and `npm run typecheck` passed. `npm run test:run` passed (12 component tests). `npm run test:e2e` passed (11 Chromium tests, including its Webpack build) outside the sandbox; the initial sandboxed build stopped with `EPERM` creating a `.next` prerender directory before browser tests ran. Three consecutive standard Turbopack builds outside the sandbox passed (3/3, 0 failures). QA-001 remains open because earlier same-host failures establish an intermittent pattern. See [Phase 7 scenario evidence](phase-7-information-state-preview.md).

## Phase 8 review coverage and boundary (2026-10-17)

The review component uses Member 1 v1.0 types, while the route uses a manual synthetic fixture and makes that origin explicit. The AI sibling package's locked dependencies must be installed (`npm ci --ignore-scripts` from `packages/ai`) for frontend type checking and the library-to-component test in this checkout. This does not connect a service or install an AI model.

| Level | Check | Evidence target |
|---|---|---|
| Component | Original response and later correction remain separately visible; synthetic draft is labeled as such. | P10/P11 presentation only. |
| Component | Source disclosure resolves the exact response and retains focus on its action; missing and mismatched sources are explicit. | Source presentation and local consistency. |
| Component | Unknown, Not answered, Unclear, and Conflicting remain distinct; both conflicting originals display. | Information integrity presentation. |
| Component | Correction and confirmation controls remain disabled; no saved/submitted claim. | Honest integration boundary. |
| Component | Missing, invalid, unavailable review messages are distinct. | Isolated state presentation; no API failure tested. |
| Library-to-component | Feed a real `buildStructuredBrief` result from synthetic `IntakeState` into `PatientReview`; inspect a source ID and original text. | Member 1 algorithm-to-UI contract compatibility, not AI inference or persistence. |
| Browser | Navigate from `/intake` to `/intake/review`; inspect synthetic notice, keyboard source open/close and focus, disabled actions, no non-GET request. | Fixture browser presentation. |
| Browser | Check review at 375, 768 and 1280px; inspect both conflict sources and document horizontal overflow. | Responsive preview. |
| Package tests | Run `packages/ai` typecheck/test and Member 2 Node contract test. | Existing library/contract behavior only. |

The Phase 8 run passed 21/21 frontend component tests, 15/15 Chromium tests outside the sandbox, 136/136 Member 1 tests, and 6/6 Member 2 contract tests. `npm run lint` and `npm run typecheck` passed. Three standard Turbopack builds outside the sandbox passed, with no recurrence of QA-001; the defect remains open. The first sandboxed browser command built but its local server did not become reachable, so it was interrupted and rerun outside the sandbox. See [Phase 8 evidence](phase-8-patient-review-provenance.md).

No test reaches a real session, response save, AI inference, review retrieval, correction save, confirmation, submission, database, or authenticated route. Add those tests only when Member 2 supplies the operations and shared contracts; do not count current fixtures as integrated coverage.

## Phase 9 UI and workflow coverage (2026-10-17)

The landing page accepts an optional made-up concern and passes it through `sessionStorage` once to `/intake`. This is a browser-tab handoff, not persistence. Chromium checks exact text on arrival, its absence after reload, and no non-GET request. The landing action and intake notice explicitly label the route as a preview.

The browser suite also checks primary navigation's current-page indication, the visible landing field and action, the conversation and review source interactions, and horizontal overflow at 375, 768, and 1280px. A targeted palette test checks foreground/background, muted/background, white/teal action, and preview-notice token contrast against 4.5:1, plus reduced transition duration under `prefers-reduced-motion`. The existing state-gallery test checks rendered meaning text contrast against its surface. These are targeted checks, not a complete accessibility audit.

No clinician route or connected clinician API exists to exercise in Playwright. Member 2's authorization guards and contract parser can be tested as pure Node functions; they do not prove authenticated browser access, case retrieval, save, or finalization. No real frontend AI-pending signal exists, so no AI-working animation or test was added.

Final Phase 9 run: `npm run lint` and `npm run typecheck` passed; `npm run test:run` passed 21/21 component tests; `npm run test:e2e` passed 17/17 Chromium tests, including its Webpack build, outside the sandbox. Member 1 typecheck and 136/136 tests passed; Member 2 parser and authorization tests passed 13/13. Three consecutive standard Turbopack builds outside the sandbox passed (3/3), and one final build after the last copy change passed; QA-001 remains open due to prior intermittent failures. The first sandboxed Webpack build failed with `EPERM` creating a `.next` prerender directory. See [Phase 9 evidence](phase-9-ui-ux-clinician.md).
