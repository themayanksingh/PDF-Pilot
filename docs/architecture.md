# Architecture: PDF Pilot
Last Updated: 2026-03-31

## System Overview
PDF Pilot is a single Figma plugin with two execution contexts:
- `code.ts`: plugin sandbox logic for selection handling, extraction, duplication, font loading, translation apply, storage, and export payload generation.
- `ui.html`: plugin iframe UI for tabs/dashboard UX, AI provider API calls, spend computation, and PDF generation with bundled `jsPDF`.

## UI Shell Notes
- The plugin UI is opened at `440 × 760` from `code.ts` so the Translate tab can keep the language picker and primary CTA visible at the same time without collapsing important controls below the fold.

## Export Notes
- PDF export rasterizes each selected frame in `code.ts` and assembles the PDF in `ui.html` with `jsPDF`.
- Frame raster export now runs with a small parallel worker pool in `code.ts` instead of strictly sequential PNG generation, which reduces total wait time for multi-frame exports at the same scale.
- Lossless PDF stream compression is always enabled in `ui.html`; the Export tab now surfaces user-facing `Export quality` presets instead of a raw optimization toggle.
- `Export quality` is separate from `Scale`: presets choose the image encoding/compression strategy, while scale still controls raster sharpness and remains the main size driver.

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
