# Frontend defect log

All repro data is synthetic. The Phase 10 update below is current; earlier phase paragraphs record historical observations.

## QA-001 — Standard Turbopack production build intermittently fails to start a loader worker

| Field | Record |
|---|---|
| Affected feature | Standard `npm run build` delivery gate. |
| Environment | Windows; Node.js 24.18.1; npm 11.16.0; Next.js 16.4.2; Tailwind CSS 4.3.3. Reproduced both inside and outside the sandbox. |
| Preconditions | Phase 4 frontend files, React Compiler enabled, dependencies installed. The final configuration uses Tailwind's PostCSS plugin. |
| Reproduction steps | From `frontend`, run `npm run build`. For comparison, run `npm run build -- --webpack`. |
| Expected result | Turbopack completes a styled production build with `/` and `/intake`. |
| Actual result | On failing runs, Turbopack reports `creating new process` and `node process exited before we could connect to it with exit code: 0`. The Phase 10 failure named `IntakeConversation.tsx`. Earlier Webpack comparison builds succeeded, but the merged AI package now causes native ONNX binary parse errors on that optional path. |
| Severity / priority | Medium / P1: the required standard release build is intermittent. The former Webpack comparison path is currently unavailable. |
| Owner | Member 3 frontend build/tooling investigation; suspected Next.js/Turbopack worker or local process environment, not assigned to Members 1 or 2. Upstream or Windows specificity is unconfirmed. |
| Evidence | Phase 5 command outputs and Phase 10 `npm run test:e2e`: Turbopack failed outside the sandbox while parsing `IntakeConversation.tsx`; later standard builds and the full browser suite passed. Both outcomes are retained. |
| Status | Open. No speculative framework downgrade or permanent Compiler disablement was retained. |
| Retest result | Phase 6–9 bounded standard builds passed as previously recorded. Phase 10: one `npm run test:e2e` build failed with the original worker signature; subsequent `npm run build` and `npm run test:e2e` runs passed, the latter with 17/17 Chromium tests. QA-001 remains open because the exact failure recurred. |

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
| Retest result | Historical Webpack builds emitted Tailwind CSS. In Phase 10, `npm run build -- --webpack` stopped on native ONNX binary imports before CSS could be evaluated. The standard Turbopack build passed and Chromium confirmed the styled CTA. QA-002 remains fixed for the supported production path; optional Webpack verification is blocked by a separate bundling limitation. |

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

## QA-004 — Demo intake trimmed the patient's original wording

| Field | Record |
|---|---|
| Affected feature | `/intake` displayed response and `/api/demo/intake` turn text. |
| Environment | Phase 10 merged frontend, local synthetic component and Chromium tests. |
| Preconditions | A nonblank answer with leading/trailing whitespace. |
| Reproduction steps | Enter `  Synthetic stomach discomfort  ` and submit a mocked turn; inspect the displayed response and outgoing JSON. |
| Expected result | Preserve the exact entered text while rejecting whitespace-only answers. |
| Actual result before fix | The composer and demo route each called `.trim()` on the accepted answer. A focused component regression failed because the response showed `Synthetic stomach discomfort` without the original spaces. |
| Severity / priority | Medium / P1 for source provenance in the demo. |
| Owner | Member 3 demo frontend/API boundary; Member 2's separate parser is tracked as QA-003. |
| Evidence | Failing focused component test before the fix; `IntakeConversation.tsx` and demo route inspection. |
| Status | Fixed in the demo path. Whitespace-only validation still uses `trim()` as a predicate, while the accepted value is passed unchanged. |
| Retest result | Focused component test passed 3/3; full component suite 22/22 and Chromium 17/17 passed. The browser test asserts raw request and displayed text. No Member 2 persistence path exists, so this does not close QA-003. |

## Phase 10 final defect review

- **QA-001 — still open:** the same Turbopack worker failure recurred on a required `test:e2e` build; later successful runs show intermittence, not closure.
- **QA-002 — fixed for the supported path:** standard-build Chromium tests confirm visible Tailwind styling. Optional Webpack comparison is currently blocked by ONNX native-binary bundling, a separate build-path limitation.
- **QA-003 — still open, Member 2:** the provisional parser test still expects trimmed reported text. No patient-record write was exercised.
- **QA-004 — fixed and verified in the demo path:** raw synthetic wording survives the client request and local response display; the demo route now forwards raw nonblank text to Member 1's recorder.
- The committed homepage had lost concise safety/demo copy, the browser test file contained an exact duplicate test, and the direct intake route's demo note was visually hidden. Phase 10 restored the copy, removed the duplicate, and made the intake note visible. These were retested with component/Chromium checks and responsive screenshots.
