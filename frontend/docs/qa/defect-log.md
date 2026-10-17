# Frontend defect log

All repro data is synthetic. Status and retest results reflect the Phase 5 checks on the local Windows host.

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
| Retest result | Not resolved. The final `npm run build` with React Compiler enabled passed, but multiple earlier same-host runs failed in the React Compiler or PostCSS worker. Webpack remains the deterministic browser-QA path. |

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
