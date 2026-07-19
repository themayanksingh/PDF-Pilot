# Changelog

All notable product and documentation changes to PDF Pilot are recorded here. Public version numbers and dates follow the [Figma Community listing](https://www.figma.com/community/plugin/1604040004181266174/pdf-pilot).

## Unreleased

### Documentation

- Consolidated product planning into `docs/ROADMAP.md`.
- Consolidated runtime contracts and storage details into `docs/architecture.md`.
- Removed stale planning, release-history, and private-notes documents.
- Simplified `STATE.md` to current work and blockers only.

Product code remains aligned with Figma Community Version 8.

## Version 8 — 2026-07-19

### Added

- Added an Import PDF tab with file selection and drag-and-drop.
- Added Low (1.5×), Medium (2×), and High (4×) JPEG import presets.
- Added page-range selection, a warning for files over 25 MB, cancel support, progress feedback, and remembered import quality.
- Added one Figma page frame per imported PDF page, grouped inside a parent frame and arranged in rows of up to 20 pages.
- Added 5× and 6× PDF export scales.

### Changed

- Switched every export-quality preset to fast browser-native JPEG output.
- Retuned High, Balanced, and Small File compression for sharper output and more predictable file sizes.
- Clarified export quality names and helper text.

Figma public note: Introduced PDF import controls, export scales through 6×, and improved JPEG quality presets.

## Version 7 — 2026-07-19

- No public release note was provided.
- Superseded by Version 8 on the same day.

## Version 6 — 2026-06-02

### Added

- Added pointer-driven drag-and-drop ordering for selected export frames.
- Added a dedicated drag handle, animated placeholder, floating row, edge auto-scroll, and release-only order commits.
- Added ordered frame IDs to the export request so PDF page order follows the reviewed list.
- Added persistence for export scale and quality while keeping the filename transient.
- Added clearer export progress feedback and debug summaries for extracted links.

### Changed

- Parallelized frame raster rendering to improve multi-page export performance.

Figma public note: Improved drag-and-drop PDF page ordering and remembered the latest export scale and quality.

## Version 5 — 2026-04-03

### Changed

- Refined export performance and quality controls.
- Tightened control labels, dropdown sizing, and quality guidance.

No public release note was provided.

## Version 4 — 2026-03-29

### Changed

- Improved translation cancellation and progress feedback.
- Made translated-frame placement safer across reruns and nested selections.
- Added versioned reruns, explicit frame-ID extraction scopes, and safer partial-apply behavior.
- Added constraint-aware overflow retries and preserved unresolved or unattempted review items across retry passes.
- Improved Arabic alignment and right-to-left overflow correction.
- Reduced selection-update lag and preserved translation review state.
- Migrated project commands and documentation to pnpm.

No public release note was provided.

## Version 3 — 2026-03-27

- No public release note was provided, and repository history does not identify a unique product-code commit for this public version.

## Version 2 — 2026-03-09

### Added

- Added Component node support for export and translation.
- Added precise hyperlink hitboxes to PDF exports.
- Added Arabic translation alignment before overflow auditing.
- Added dashboard API-key management and spend summaries for the latest run, recent runs, and all time.
- Added idempotent spend recording and retry-aware overflow handling.
- Added a setting to enable or disable translation features.
- Added saved target-language selections.

### Changed

- Made Export PDF the default tab and refined empty states, dashboard copy, icons, and scrolling.
- Updated the Figma Community listing thumbnails.

Figma public note: Updated the Community listing thumbnails.

## Version 1 — 2026-03-09

### Added

- Published the initial Figma Community release.
- Exported selected Figma frames to a single PDF.
- Added AI-assisted translation that duplicates source frames and preserves the originals.
- Added Gemini and OpenAI provider support with local API-key settings.
- Added stable text mapping, mixed-font loading, font-failure reporting, translation progress, and overflow auditing.
- Added manual decrease-font, expand-layer, ignore, and focus actions for overflow review.
- Added safe handling for truncate-protected text nodes.

No public release note was provided.

## Pre-release development — 2026-02

- Created the initial Frames-to-PDF plugin.
- Added translation reliability, debug tooling, audit hardening, settings UX, and spend analytics.
- Added translation-review state persistence across selection updates.
