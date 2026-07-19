# Roadmap

Last Updated: 2026-07-19

This is the single product plan for PDF Pilot. It contains only pending or active direction; completed work belongs in `CHANGELOG.md`.

## Current Focus

Improve reliability and maintainability across PDF import, export ordering, and AI translation without expanding the plugin's operational footprint.

## Priority 1 — Reliability

- Bundle PDF.js locally so PDF import works without cdnjs and is more predictable during plugin review or offline use.
- Add Instance node support for export and translation; Frames and Components are currently supported.
- Add frame-level translation/apply diagnostics so partial creation failures can be audited without relying on raw debug logs.
- Add keyboard-accessible page-order controls alongside drag-and-drop.
- Validate large, multi-page imports in Figma Desktop and define practical size/page limits if needed.

## Priority 2 — Translation Quality

- Extend right-to-left handling beyond Arabic text alignment to cover layout-direction and nested auto-layout cases.
- Improve font fallback guidance when the selected design font does not support a target script.
- Make partial provider failures and source-text fallbacks easier to review at the frame level.

## Priority 3 — Maintainability

- Split the large `ui.html` script into clearer internal modules or generated bundles for dashboard state, PDF workflows, translation orchestration, and review UI.
- Add contract-focused tests for messages shared by `ui.html` and `code.ts`.
- Add repeatable regression fixtures for hyperlink export, PDF import placement, Arabic alignment, and overflow retry behavior.

## Later

- Add another AI provider such as Claude.
- Export translated frame sets directly to PDF.
- Explore editable PDF import only if a reliable text/layout extraction approach becomes viable; raster import remains the supported behavior.

## Product Constraints

- Network calls remain in `ui.html`; `code.ts` stays within the Figma plugin sandbox.
- PDF import remains local and raster-based unless the product direction explicitly changes.
- Source frames remain unchanged during translation.
- Storage payloads and UI/plugin messages remain defensively validated.
- New user-facing code must be recorded under `Unreleased` in `CHANGELOG.md` until the live Figma release is verified.
