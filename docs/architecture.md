# Architecture: PDF Pilot
Last Updated: 2026-02-23

## System Overview
PDF Pilot is a single Figma plugin with two execution contexts:
- `code.ts`: plugin sandbox logic for selection handling, extraction, duplication, font loading, translation apply, storage, and export payload generation.
- `ui.html`: plugin iframe UI for tabs/dashboard UX, AI provider API calls, spend computation, and PDF generation with bundled `jsPDF`.

## Stack Snapshot
- Figma Plugin API: `1.0.0`
- TypeScript: `^5.3.2`
- ESLint: `^8.54.0`
- `@typescript-eslint/eslint-plugin`: `^6.12.0`
- `@typescript-eslint/parser`: `^6.12.0`
- `@figma/plugin-typings`: `*`
- Persistence: `figma.clientStorage` (no external database)
