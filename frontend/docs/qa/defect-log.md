# Frontend defect log

All repro data is synthetic. Status and retest results include the Phase 9 checks on the local Windows host.

## QA-001 — Standard Turbopack production build intermittently fails to start a loader worker

| Field | Record |
|---|---|
| Affected feature | Standard `npm run build` delivery gate. |
| Environment | Windows; Node.js 24.18.1; npm 11.16.0; Next.js 16.4.2; Tailwind CSS 4.3.3. Reproduced both inside and outside the sandbox. |
| Preconditions | Phase 4 frontend files, React Compiler enabled, dependencies installed. The final configuration uses Tailwind's PostCSS plugin. |
| Reproduction steps | From `frontend`, run `npm run build`. For comparison, run `npm run build -- --webpack`. |
| Expected result | Turbopack completes a styled production build with `/` and `/intake`. |
| Actual result | On failing runs, Turbopack reports `creating new process` and `node process exited before we could connect to it with exit code: 0`. With React Compiler enabled it has reported `ResponseComposer.tsx`; with React Compiler disabled it has also reported `app/globals.css` during PostCSS processing. One controlled Turbopack build with Compiler disabled succeeded, but later runs still failed. The Webpack build succeeds. |
| Severity / priority | Medium / P1: standard release build is unreliable; a styled Webpack comparison build is available. |
| Owner | Member 3 frontend build/tooling investigation; suspected Next.js/Turbopack worker or local process environment, not assigned to Members 1 or 2. Upstream or Windows specificity is unconfirmed. |
| Evidence | Phase 5 command outputs for `npm run build` and `npm run test:e2e` before the Webpack test-script change. The failure persisted outside sandbox and after replacing the Tailwind-only Turbopack loader. Webpack compiles the same TSX. |
| Status | Open. No speculative framework downgrade or permanent Compiler disablement was retained. |
| Retest result | Phase 6: three consecutive `npm run build` attempts outside the sandbox passed (3/3; 0 failures). Phase 7: three more passed (3/3). Phase 8: three more passed (3/3). Phase 9: three consecutive outside-sandbox standard builds passed (3/3; 0 failures); the original loader-worker failure did not recur. Earlier same-host attempts failed intermittently, so QA-001 remains open. The first sandboxed Phase 9 Webpack browser-test build separately failed with `EPERM` creating `.next/server/app/_global-error.segments/_global-error`; the outside-sandbox rerun completed. |

## QA-002 — Webpack build omitted Tailwind utility styling

| Field | Record |
|---|---|
| Affected feature | Production visual presentation under the `--webpack` comparison build. |
| Environment | Same Windows/Next/Tailwind environment. |
| Preconditions | Original Phase 4 configuration had `@tailwindcss/turbopack` in `next.config.ts` and no Tailwind PostCSS plugin. |
| Reproduction steps | In the original configuration, run `npm run build -- --webpack`, start the result, and inspect the preview CTA or generated CSS. |
| Expected result | Tailwind utility styles are present in production output. |
| Actual result | The build succeeded but the page lacked utility styling. |
| Severity / priority | Medium / P1: browser presentation was unusable on the comparison path. |
| Owner | Member 3 frontend build configuration. |
| Evidence | Original package/config inspection and Phase 4 browser observation; Tailwind's official Next.js setup specifies `@tailwindcss/postcss`. |
| Status | Fixed by adding `postcss.config.mjs` and `@tailwindcss/postcss`, then removing the Turbopack-only Tailwind loader. Tailwind 4 remains the styling system. |
| Retest result | `npm run build -- --webpack` passed and emitted CSS containing `bg-accent` and `max-w-6xl`; the Playwright browser suite checks the CTA's computed background. |

## Phase 6 defect review

No new application UI defect was found in the Phase 6 component or browser checks. No application defect was closed. QA-001 remains open; QA-002 remains fixed and is covered by the browser styling regression check.

## Phase 7 defect review

No new application UI defect was found in the five synthetic scenario tests or responsive Chromium checks. No application defect was closed. QA-001 remains open; QA-002 remains fixed and retains its browser styling regression check.

## QA-003 — Provisional patient-turn parser changes original reported wording

| Field | Record |
|---|---|
| Affected feature | Patient response request parsing and future source provenance. |
| Environment | Merged `backend/api/contracts.ts` on the local Phase 8 branch; Node.js 24.18.1. No HTTP route or database was involved. |
| Preconditions | A valid `reported` patient-turn request whose answer contains leading or trailing whitespace. |
| Reproduction steps | Inspect `parsePatientTurnRequest` and run `node --test backend/api/api-contracts.test.ts`; its first test submits text with surrounding spaces and expects normalized text. |
| Expected result | The validated answer retains the exact patient-entered text for the original statement/source record, or an agreed contract carries both raw and normalized values. |
| Actual result | `parsePatientTurnRequest` returns `answer.text = text.trim()`. The test explicitly asserts the trimmed result. A future persistence path using this parsed value would lose the exact original wording. No persisted record was observed because no route exists. |
| Severity / priority | Medium / P1 before connecting patient response persistence; provenance integrity risk, not a demonstrated live data-loss event. |
| Owner | Member 2, with a shared raw-text contract decision with Member 1 and Member 3. |
| Evidence | `backend/api/contracts.ts` reported-answer branch; passing backend contract test titled “accepts a valid patient response and normalizes surrounding whitespace”; Phase 8 source-traceability requirement. |
| Status | Open. No Member 2 code was modified. |
| Retest result | Not fixed or retested after a fix. Baseline backend suite passes 6/6 and confirms the current trimming behavior. |

## Phase 8 defect review

No new Member 3 UI defect was found in the new review tests. QA-003 is a Member 2 contract defect found during integration inspection; no live patient data was sent or changed. QA-001 remains open after a bounded 3/3 standard-build retest. The initial sandboxed Phase 8 Playwright server did not become reachable after a successful Webpack build; the outside-sandbox rerun passed all 15 Chromium tests. See [Phase 8 evidence](phase-8-patient-review-provenance.md).

## Phase 9 defect review

No new unresolved Member 3 UI defect was found after the redesign checks. A missing landing textarea description was found during refinement and fixed before the final verification; the browser suite now checks that its `aria-describedby` target exists and contains the made-up-information instruction. QA-002 remains fixed with a computed-style browser regression. QA-003 remains open under Member 2; its parser test still confirms whitespace trimming, and no persistence path was connected. QA-001 remains open after three passing outside-sandbox standard builds because its prior loader-worker failures were intermittent. The first sandboxed Phase 9 Webpack build separately failed with `EPERM` creating a `.next` prerender directory; outside-sandbox browser verification passed. See [Phase 9 evidence](phase-9-ui-ux-clinician.md).
