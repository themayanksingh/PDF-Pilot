# State
Last Updated: 2026-03-28
Updated By: Codex

## Active Tasks
- Monitor translation reliability and backlog items after the latest retry/spend fixes

## Completed
- Removed expensive text-stat recomputation from the `selectionchange` path so selecting frames while the plugin is open no longer lags the canvas
- Increased the default Figma plugin window to `440 × 760` so the Translate language picker no longer hides the primary CTA below the fold
- Added export progress/loading feedback so the Export PDF button shows active work while frames are rendered and the PDF is compiled
- Switched project package-manager guidance from `npm` to `pnpm`
- Read the codebase deeply across `code.ts`, `ui.html`, README, plan, and architecture docs to refresh the end-to-end plugin/UI design
- Re-verified the current repo passes `pnpm build` and `pnpm lint`
- Re-verified the latest `record-run-spend` delta merge and overflow retry state handling in source
- Verified the current repo passes `pnpm build`, `pnpm lint`, and `pnpm exec tsc --noEmit`
- Confirmed the prior retry spend and failed-batch overflow review regressions are fixed in the current workspace
- Fixed the language accordion border-radius seam by removing the wrapper shell border and letting the inner header/body own the visible outline

## Blockers
- None

## Todos
- Instance node support (Component done; Instance still not supported)
- Reduce coupling inside `ui.html`; translation pipeline, dashboard state, and review UI now live in one large script and are expensive to reason about safely
