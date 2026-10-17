# Phase 5 frontend test plan

Status: automated baseline for the Phase 4 **frontend development preview**. All input and examples are synthetic. These checks do not pass the full product acceptance criteria or prove an integrated intake.

## Scope and environment

- Routes: `/` introduction and `/intake` initial-concern UI preview only.
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
| Browser | Navigate `/` → `/intake` → `/`; check headings and preview limitations. | Route and truthfulness smoke. |
| Browser | Validate empty/whitespace/valid text, retained value, focus, error association, keyboard activation, and no non-GET request after local checks. | P02/P03 frontend portions. |
| Browser | With JavaScript disabled, the local-check button does not submit text into a query string. | Regression for the observed pre-hydration form defect. |
| Browser | At 375, 768, and 1280px, both pages avoid horizontal overflow, controls remain visible, focus is visible, and Tailwind utility styling is present. | Responsive/focus and Webpack styling regression. |

No screenshot comparison is used. Semantic role and label queries are preferred. These checks are targeted accessibility evidence, **not a WCAG compliance claim**.

## Synthetic fixtures and manual checks

The component and browser tests type only invented phrases such as “A synthetic concern” and “I would like to discuss a made-up concern.” Empty and whitespace strings exercise validation. No real patient information is used.

Phase 4 included manual browser inspection of the styled introduction and intake preview at the three representative widths. Phase 5 adds automated browser checks for those widths. A later integrated workflow still needs manual usability and screen-reader review.

## Acceptance evidence and limits

- **P02 frontend portion:** component and browser tests verify local rejection, clear error association, preserved text, focus, no non-GET request during the local check, and no query-string submission with JavaScript disabled. Shared final validation rules and real persistence behavior remain unverified.
- **P03 frontend portion:** component and browser tests verify visible, editable local text. A persisted response is not tested.
- **Full P02/P03 integration:** not passed. No session or response service is connected.

These tests do **not** verify AI integration, backend persistence, authentication, authorization, submission, consultation briefs, clinician workflows, or Member 1/Member 2 contracts. No fixture is presented as a real server or AI response.

## Build and dependency limitations

- QA-001 tracks the standard Turbopack child-process failure. The Webpack comparison build is the current browser-test path, not proof that the default build is healthy.
- QA-002 records the fixed Webpack Tailwind styling gap. The browser suite asserts the preview action has a nontransparent Tailwind background to guard it.
- On this host, sandboxed package downloads and some subprocess/temp-file operations can fail; approved execution outside the sandbox was used when the same command failed there.
- The latest local `npm audit --omit=dev` reported zero production-dependency advisories. The full audit still reports five high advisories in the existing ESLint/Next development-tool chain; no incompatible forced dependency change was applied.

## Latest Phase 5 run (2026-10-17)

`npm run lint`, `npm run typecheck`, and `npm run test:run` passed (5 component tests). `npm run test:e2e` passed (6 Chromium tests, including a styled Webpack build). `git diff --check` passed with Git line-ending warnings. The final `npm run build` Turbopack attempt passed, but earlier same-host attempts failed as recorded in QA-001; repeatability is not established. The production-only npm advisory check found zero findings; the full audit found five high development-tool advisories and no critical findings.
