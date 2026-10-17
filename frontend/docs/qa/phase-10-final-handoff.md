# Phase 10 — Member 3 final handoff

Date: 2026-10-18. Synthetic data only. See [final quality report](final-quality-report.md) for evidence and [demo checklist](demo-checklist.md) for the reproducible sequence.

## Delivered frontend and QA scope

- Simplified centered homepage with one intake link and restored short demo/safety copy.
- Existing conversation-focused `/intake` retained; its development-demo note is now visible on direct entry. The composer and demo route preserve raw nonblank patient wording while rejecting whitespace-only input.
- `/intake/states` and `/intake/review` remain visibly synthetic, source-aware previews. The review is not derived from the active intake.
- Duplicate browser test removed; focused tests cover pending/failure/confirmation presentation, exact raw wording, navigation, source disclosure, and 375/768/1280px layouts.
- Final QA documents updated to distinguish actual demo integration, mocked responses, fixture routes, and absent application operations.

## Actual integration and fixture boundary

`/api/demo/intake` calls Member 1's service for start/turn/brief/confirm when AMD is configured. This host had no AMD key/model; its local start returned 503, so a live model response was not verified. Member 1 typecheck and 137/137 tests passed. Browser success-path responses are intercepted fixtures. Browser-device conversation snapshots are not Member 2 patient-record persistence. Member 2 parser/guard tests passed 13/13 but no authenticated session, database operation, clinician route, or status transition was exercised.

## Unresolved dependencies and defects

- **Member 1 / demo environment:** provide approved AMD credentials/model and complete a synthetic live turn and brief preflight; verify live failure/safety output in the app.
- **Member 2 / shared contract:** decide how exact raw patient text survives provisional request parsing (QA-003), then connect authoritative sessions, response saves, review retrieval, submission, and assigned clinician operations. No competing frontend backend implementation was added.
- **Member 3 tooling:** QA-001 remains open after a recurring Turbopack worker failure; a later standard build and full 17-test suite passed. QA-002 remains fixed on the supported build. QA-004 raw-wording loss in the demo path is fixed and retested.
- **Stash reconciliation:** the old Phase 9 stash contains teal/soft-blue tokens, a shared navigation header, and a landing-draft handoff that differ from current HEAD. The homepage textarea/handoff was intentionally superseded by the approved simple entry point; the palette/header difference still needs explicit team review. Keep the stash until its intended content is accounted for.
- **Residual files:** usage search found `SiteHeader` and `preview-draft` unreferenced at runtime; `ResponseComposer` is exercised by its component test but not mounted by the current intake. They were preserved pending the team's Phase 9 reconciliation decision rather than deleted solely for appearing unused.

## Verification checkpoint

Frontend lint/typecheck passed; component 22/22; Chromium 17/17 after a successful Turbopack build; standalone standard build passed; Member 1 137/137 plus typecheck; Member 2 13/13. The initial `test:e2e` build failure is preserved in QA-001. All four implemented routes were checked at 375/768/1280px with no document horizontal overflow and one main/heading each. No manual screen-reader test or live AMD call was completed.

## Demo and merge recommendation

Ready for a **disclosed synthetic UI demonstration with known limitations**. A live AMD segment requires a credentialed preflight; do not claim persistence or clinician review. The branch can be reviewed now, but do not drop the stash or treat the product workflow as complete until the Phase 9 visual/navigation differences are resolved and the outstanding build/raw-text contract risks are accepted or fixed. No push to `main` is part of this handoff.
