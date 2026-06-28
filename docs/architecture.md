# Architecture: PDF Pilot
Last Updated: 2026-06-28

## System Overview
PDF Pilot is a single Figma plugin with two execution contexts:
- `code.ts`: plugin sandbox logic for selection handling, extraction, duplication, font loading, translation apply, storage, and export payload generation.
- `ui.html`: plugin iframe UI for tabs/dashboard UX, AI provider API calls, spend computation, and PDF generation with bundled `jsPDF`.

## UI Shell Notes
- The plugin UI is opened at `440 × 760` from `code.ts` so the Translate tab can keep the language picker and primary CTA visible at the same time without collapsing important controls below the fold.

## Export Notes
- PDF export rasterizes each selected frame in `code.ts` and assembles the PDF in `ui.html` with `jsPDF`.
- The Export tab's frame list can be reordered in `ui.html` with a custom pointer-driven left-handle interaction. Dragging uses a floating row, animated placeholder, document-level pointer tracking, and edge auto-scroll; export requests pass ordered frame IDs to `code.ts`, so the reviewed list order becomes the PDF page order instead of relying on live Figma selection order.
- Frame raster export now runs with a small parallel worker pool in `code.ts` instead of strictly sequential raster generation, which reduces total wait time for multi-frame exports at the same scale.
- Lossless PDF stream compression is always enabled in `ui.html`; the Export tab now surfaces user-facing `Export quality` presets instead of a raw optimization toggle.
- `Export quality` is separate from `Scale`: presets choose the image encoding/compression strategy, while scale still controls raster sharpness and remains the main size driver. Export scale supports values up to 6x for sharper raster output when users accept larger files.
- Export uses JPEG for every quality preset. High quality uses near-lossless JPEG, while Balanced and Small File use stronger browser-native JPEG recompression in `ui.html` for fast, smaller PDF assembly.
- Export `Scale` and `Export quality` are persisted in `figma.clientStorage` as export-specific preferences; the file name stays transient and always uses the UI default unless the user edits it for that run.

## Import Notes
- The Import PDF tab loads `pdf.js` from cdnjs in `ui.html`, reads a user-selected PDF file locally, and renders selected pages to a canvas.
- Imported pages are sent from `ui.html` to `code.ts` as base64 image payloads with their original PDF page dimensions; `code.ts` creates one page frame per imported page and places the image-filled rectangle inside it.
- PDF import is intentionally flat: page text remains visible in Figma but is not editable as text layers.
- Import quality presets map to render scale and encoding: Low uses 1.5x JPEG, Medium uses 2x JPEG, and High uses 4x JPEG with tuned quality values to keep payloads smaller while preserving sharp visible output; the selected quality is persisted in `figma.clientStorage`.
- Import rendering supports page ranges, warns before importing PDFs over 25 MB, allows canceling while pages render, and caps per-page render pixels to reduce the chance of freezing the plugin UI on very large pages.
- Imported page frames are laid out horizontally with up to 20 pages per row, then wrap to the next row inside the parent import frame.

## Translation Placement Notes
- Translated outputs are placed as page-level frames on the current Figma page, not reinserted into the original parent container.
- Each translation run is positioned in a fresh block below the current canvas content, while preserving the selected frames' relative layout within each language row.
- This avoids overlap with existing page content, prevents reruns from stacking on top of earlier translated versions, and keeps selected child frames from being reattached into auto-layout parents.

## Translation Runtime Notes
- The Translate tab keeps a dedicated cancel action visible while a run is active; cancel during API work stops new requests and skips apply, while cancel during apply stops after the current frame finishes.
- Arabic RTL alignment is applied in `code.ts` only after loading each text node's font, so alignment fixes do not crash the remaining frame-creation loop.
- Manual overflow fixes in `code.ts` preserve the right edge for right-aligned RTL text when expanding width outside auto-layout, preventing Arabic text boxes from drifting out of their frame.
- Gemini 2.5 Flash Lite quota tuning should derive practical concurrency from the selected tier's RPM ceiling, not from the number of selected languages.

## Stack Snapshot
- Figma Plugin API: `1.0.0`
- TypeScript: `^5.3.2`
- ESLint: `^8.54.0`
- `@typescript-eslint/eslint-plugin`: `^6.12.0`
- `@typescript-eslint/parser`: `^6.12.0`
- `@figma/plugin-typings`: `*`
- Persistence: `figma.clientStorage` (no external database)
