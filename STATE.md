# State
Last Updated: 2026-03-29
Updated By: Codex

## Active Tasks
- Monitor remaining translation reliability gaps after the Arabic RTL/apply and cancel-flow fixes

## Completed
- Clarified the overflow-retry progress copy so users are told a second layout-fit pass is running instead of seeing an unexplained near-complete progress state
- Fixed Arabic overflow auto-fix / expand-layer behavior so right-aligned text expands leftward instead of drifting outside the frame
- Removed the rotating translation quote/fade UI entirely and restored a cleaner progress area
- Added a visible `Cancel Translation` control during active runs; UI-phase cancel now stops before apply and apply-phase cancel stops after the current frame
- Fixed Arabic translation apply crashes by loading text-node fonts before RTL alignment changes instead of aborting the whole apply pass
- Fixed Gemini 2.5 Flash Lite paid-tier concurrency tuning so Tier 1 is no longer capped to selected-language count
- Added concise translate helper copy and user-facing frame-progress messaging during active translation runs
- Kept translation progress visible across selection changes during active runs and disabled the language picker while translation is in flight
- Switched translated-frame placement to create a fresh page-level block below existing canvas content, preserving relative layout while avoiding overlap with older translations and unrelated frames
- Changed rerun behavior so existing translated frames are preserved and new translations for the same source/language get versioned names like `v2` instead of deleting prior output
- Fixed translation extraction to resolve the exact frame IDs chosen in the plugin UI instead of re-reading the live Figma selection, preventing selected frames from being dropped at run start
- Fixed translation job construction so every selected frame is duplicated for each target language, even when some selected frames contain no extracted text nodes
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
- Add frame-level debug summaries for translation apply so partial-create failures are easier to audit from the UI
- Reduce coupling inside `ui.html`; translation pipeline, dashboard state, and review UI now live in one large script and are expensive to reason about safely
