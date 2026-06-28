# State
Last Updated: 2026-06-28
Updated By: Codex

## Active Tasks
- Monitor PDF import reliability in Figma Desktop, especially cdnjs/pdf.js loading and large multi-page PDFs
- Monitor export page-order usability after adding drag-and-drop frame reordering
- Monitor remaining translation reliability gaps after the Arabic RTL/apply and cancel-flow fixes

## Completed
- Refreshed stale docs for the Import PDF tab, PDF rasterization notes, JPEG-only export presets, and current roadmap/state
- Switched export High quality to JPEG as well, so import and export avoid PNG output across all presets
- Tuned export compression so all presets use fast browser-native JPEG output, with High quality using the least compression
- Retuned import JPEG quality levels to reduce image payload size while keeping the visible result sharp at each preset
- Tuned import quality presets for sharper output with smaller payloads: Low 1.5x JPEG, Medium 2x JPEG, High 4x JPEG
- Extended export scale controls up to 6x and clarified export quality labels/help for High, Balanced, and Small file output
- Wrapped each imported PDF page image in its own page frame inside the parent import frame, so users can export all pages together or one page frame at a time
- Added production PDF import controls: Low/Medium/High quality, visible scale, page range, >25 MB warning, cancel, and remembered import quality
- Changed imported PDF page placement to horizontal rows with up to 20 pages per row before wrapping to the next row
- Audited PDF import production wiring; current flow renders PDF pages in the UI and places them as flat image rectangles on the Figma canvas
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
- Push blocked: `git push origin main` failed because GitHub credentials were unavailable in this environment.

## Todos
- Consider bundling `pdf.js` locally instead of loading from cdnjs if offline/plugin-review reliability becomes important
- Consider keyboard-accessible move controls for export page ordering if drag-only ordering proves insufficient
- Instance node support (Component done; Instance still not supported)
- Add frame-level debug summaries for translation apply so partial-create failures are easier to audit from the UI
- Reduce coupling inside `ui.html`; translation pipeline, dashboard state, and review UI now live in one large script and are expensive to reason about safely
