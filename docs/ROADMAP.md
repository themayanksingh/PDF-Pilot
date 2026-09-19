# Roadmap

Last Updated: 2026-09-20

This is the single product plan for PDF Pilot. It contains only pending or active direction; completed work belongs in `CHANGELOG.md`.

## Current Focus

Reload the local plugin (`ui.bundle.html`) and re-import Essential Guide pages 5 and 11 into `KjJFCx8bRAtdBCJrvgEjLt`. Futura Book should auto-map to a regular Futura style (never Bold). The live group `788:141` is still the previous import. After that import, inspect the real node tree: TextNode counts, accepted/rejected occurrence IDs, font-map logs, and screenshots. `scripts/check-guide-import.mjs` is Chromium extraction only, not a Figma verify. Do not call pnpm checks “fixed.”

## Priority 1 — Editable import follow-up

- Confirm the re-imported Essential Guide tree after automatic Futura Book mapping: page 5 editable Contents + chapter labels + page numbers; page 11 raster furniture plus line-level body and headings. `scripts/check-guide-import.mjs` is Chromium extraction only, not a Figma export.
- Path-constructed handwriting and leftover title outlines stay raster unless a later hook can name those path ops. Do not add white-rect or destination-out punch-outs.
- Keep `isEvalSupported: false` while 3.11 remains in use. CMaps stay on jsDelivr.
- Build cross-file regression fixtures for decoding, font availability, Forms, masks, paint order, scans, outlined/Type3 text, clipping and fallback. Keep copyrighted PDFs local. `node scripts/trace-plugin-import.mjs` covers the bundled extract path; `node scripts/prove-pdfjs-hook.mjs` covers renderer suppression.

## Priority 2 — Reliability

- Add Instance node support for export and translation; Frames and Components are currently supported.
- Add frame-level translation/apply diagnostics so partial creation failures can be audited without relying on raw debug logs.
- Add keyboard-accessible page-order controls alongside drag-and-drop.
- Validate large, multi-page imports in Figma Desktop and define practical size/page limits if needed.

## Priority 3 — Translation Quality

- Extend right-to-left handling beyond Arabic text alignment to cover layout-direction and nested auto-layout cases.
- Improve font fallback guidance when the selected design font does not support a target script.
- Make partial provider failures and source-text fallbacks easier to review at the frame level.

## Priority 4 — Maintainability

- Split the large `ui.html` script into clearer internal modules or generated bundles for dashboard state, PDF workflows, translation orchestration, and review UI.
- Add contract-focused tests for messages shared by `ui.html` and `code.ts`.
- Add repeatable regression fixtures for hyperlink export, PDF import placement, Arabic alignment, and overflow retry behavior.

## Later

- Add another AI provider such as Claude.
- Export translated frame sets directly to PDF.
- Expand supported editable graphics/text only from measured corpus failures; rasterize unsupported compositions. Native vectors and advanced transparency follow the tested SVG subset. Do not introduce MuPDF/AGPL without a commercial license; PDFium also requires revisiting the current Apache/MIT-only constraint because its license is BSD-style with additional notices.
- OCR for labels that exist only inside illustration bitmaps is out of scope.

## Product Constraints

- Network calls remain in `ui.html`; `code.ts` stays within the Figma plugin sandbox.
- PDF import remains local. Raster Image mode remains the reliability fallback; Editable mode must not require a conversion server.
- Source frames remain unchanged during translation.
- Storage payloads and UI/plugin messages remain defensively validated.
- New user-facing code must be recorded under `Unreleased` in `CHANGELOG.md` until the live Figma release is verified.
