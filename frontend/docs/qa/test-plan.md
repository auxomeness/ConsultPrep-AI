# Phase 7 frontend test plan

Status: automated checks for the **frontend development preview** through one synthetic follow-up and a separate information-state prototype. All input and examples are synthetic. These checks do not pass the full product acceptance criteria or prove an integrated intake.

## Scope and environment

- Routes: `/` introduction; `/intake` initial concern → exact local response presentation → one fixed synthetic question → second local draft; `/intake/states` five provisional information-state examples.
- Host used for this verification: Windows, Node.js 24.18.1, npm 11.16.0.
- Application: Next.js 16.4.2 App Router, React 19.3.0, strict TypeScript, Tailwind CSS 4.
- Component runner: Vitest 4.1.11, jsdom, React Testing Library, DOM Testing Library, and user-event.
- Browser runner: Playwright with headless Chromium; its web server runs a local **Webpack production build** on port 3217. This is a comparison path while the standard Turbopack build defect is open.
- Tailwind uses `@tailwindcss/postcss` for both build paths. No backend, AI, authentication, or service mocks are present.

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
