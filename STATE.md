# State
Last Updated: 2026-06-02
Updated By: Codex

## Active Tasks
- Monitor export page-order usability after adding drag-and-drop frame reordering
- Monitor remaining translation reliability gaps after the Arabic RTL/apply and cancel-flow fixes

## Completed
- Upgraded export page reordering with a floating drag row, animated placeholder, edge auto-scroll, and release-only order commit
- Remembered the last export scale and quality in `figma.clientStorage` while keeping the file name transient
- Replaced native HTML drag/drop with pointer-driven animated export row reordering for smoother page-order confirmation
- Limited export page reordering to the dedicated left-side drag handle so row text/size clicks no longer start drag
- Added drag-and-drop reordering to the Export PDF selected-frame list so users can confirm page order before exporting
- Changed export requests to pass ordered frame IDs from `ui.html` to `code.ts`, making PDF page order match the reviewed list order
- Recent export work: quality presets, concise export controls, debug link logs, progress feedback, and parallel frame raster rendering
- Recent translation work: cancel flow, Arabic RTL/apply reliability, overflow retry messaging, versioned reruns, exact frame-ID extraction, and safer translated-frame placement
- Recent maintenance: project package-manager guidance switched to `pnpm`; current workspace previously verified with build/lint/typecheck

## Blockers
- None

## Todos
- Consider keyboard-accessible move controls for export page ordering if drag-only ordering proves insufficient
- Instance node support (Component done; Instance still not supported)
- Add frame-level debug summaries for translation apply so partial-create failures are easier to audit from the UI
- Reduce coupling inside `ui.html`; translation pipeline, dashboard state, and review UI now live in one large script and are expensive to reason about safely
