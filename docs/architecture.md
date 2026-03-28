# Architecture: PDF Pilot
Last Updated: 2026-03-28

## System Overview
PDF Pilot is a single Figma plugin with two execution contexts:
- `code.ts`: plugin sandbox logic for selection handling, extraction, duplication, font loading, translation apply, storage, and export payload generation.
- `ui.html`: plugin iframe UI for tabs/dashboard UX, AI provider API calls, spend computation, and PDF generation with bundled `jsPDF`.

## UI Shell Notes
- The plugin UI is opened at `440 × 760` from `code.ts` so the Translate tab can keep the language picker and primary CTA visible at the same time without collapsing important controls below the fold.

## Translation Placement Notes
- Translated outputs are placed as page-level frames on the current Figma page, not reinserted into the original parent container.
- Each translation run is positioned in a fresh block below the current canvas content, while preserving the selected frames' relative layout within each language row.
- This avoids overlap with existing page content, prevents reruns from stacking on top of earlier translated versions, and keeps selected child frames from being reattached into auto-layout parents.

## Stack Snapshot
- Figma Plugin API: `1.0.0`
- TypeScript: `^5.3.2`
- ESLint: `^8.54.0`
- `@typescript-eslint/eslint-plugin`: `^6.12.0`
- `@typescript-eslint/parser`: `^6.12.0`
- `@figma/plugin-typings`: `*`
- Persistence: `figma.clientStorage` (no external database)
