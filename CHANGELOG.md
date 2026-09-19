# Changelog

All notable product and documentation changes to PDF Pilot are recorded here. Public version numbers and dates follow the [Figma Community listing](https://www.figma.com/community/plugin/1604040004181266174/pdf-pilot).

## Unreleased

### Added

- Added an Image / Editable switch on Import PDF. Image mode is the existing flat JPEG import.
- After a PDF is chosen, Import shows the page count and a thumbnail strip in both Image and Editable. Click a page to import only that page; Shift-click a range. Arrow buttons scroll the strip.
- Editable import now plans each page from the PDF paint stream. Simple vector/image pages can become SVG layers, and ordinary filled text can become Text layers only when decoding, a real Figma font, geometry, paint order, and a Figma PNG check all pass. Anything uncertain stays the same page image as Image mode.
- Figma’s plugin console now logs Editable import decisions (`[PDF Pilot]`), including why text or graphics stayed in the page image.

### Changed

- Quality is asked only for Image import. Editable mode hides it and uses the last saved quality for the fallback page image.
- Shortened the Import empty state to a title plus one-line mode hint.
- Removed extra space under the import preview and aligned scroll arrows with the page images.
- Page range ignores page numbers that do not exist in the selected PDF.
- Editable import no longer overlays unverified text on the page image. Handwriting and symbols stay in the page image unless the exact font exists. Inter is only used as a last-resort sans fallback after measured matching, never for handwriting.
- Editable import now keeps eligible text on pages that also have photos or transparency, and it no longer rejects a page just because Figma paints text slightly differently from the PDF.
- Editable page names now include why a page stayed an image (text counts, clips, fonts), so failed reconstructions can be diagnosed in Figma.
- Missing fonts no longer flatten a whole page. Reliable text can become layers while unmatched or uncertain glyphs stay in the page image. Identity-H CID text without ToUnicode is treated as an unreliable extract, not as junk because it is CJK or Hiragino.
- Editable import now matches the PDF’s real font names (for example `.SFUI-…` → SF Pro) instead of CSS fallbacks like `sans-serif`, which previously made every page stay an image.
- Editable import now loads pdf.js CMap files so CID fonts can be read. Figma may ask to allow `cdn.jsdelivr.net`.
- When Editable import cannot safely remove original lettering from artwork, the page stays an image. The import summary and page name say so. A high gated-text count is not treated as a successful editable import. White-box and destination-out punch-outs are not used.
- Editable import now matches each painted canvas glyph to a promoted run instead of comparing whole extracted strings. Leftover letters on the same page are not globally erased. A later graphic that covers only some lines no longer flattens the whole page.
- Editable layers are kept only after the source glyph is gone from the pdf.js page image and live Figma text appears in the right place, in a visible colour, without a leftover duplicate. Extra Figma text paint outside an estimated rectangle is not treated as a graphics failure. Direct pdf.js pixels are not compared to Figma exports.
- Import now runs a local patched pdf.js 3.11.174 (hook revision 2) inside `ui.bundle.html` instead of the cdnjs main renderer. Ordinary filled titles can become Text layers when their original paint is fully gone from the page image. Hand-lettered path artwork and leftover outlines stay in the image. Invisible searchable text is not promoted.
- Page images sent to Figma stay within 4096 pixels on each edge, so wide slides no longer fail with “Image is too large”.
- Editable import reads embedded font names and OpenType `name` / `OS/2` / `post` metrics. It automatically picks the closest installed Figma font (including Futura Book → Futura Regular/Medium, never Bold). Low-confidence matches stay in the page image. After import, a report lists substitutions; Change mapping and re-import overrides the next run. Inter is not used for handwriting or as a silent default.
- Nearby sketch paths that only graze a title no longer block that title. A later graphic still blocks text when it was painted after the letters and actually covers them.
- Editable import now converts pdf.js RGB operator bytes (for example `[44, 46, 53]`) into Figma 0–1 colour. Contents text is no longer forced to white.
- Text-mode verification no longer compares a pdf.js canvas to a Figma PNG. It exports the same candidate frame twice (text hidden, then visible) and uses those two Figma images for graphics and added-ink checks. Missing, blank, white-on-white, or displaced text still fails. A rejected page is logged as verification-rejected, with both Figma export sizes and the actual TextNode bounds.
- Split `getTextContent` fragments, including hyphenated lines, now join back to one PDF `showText` paint. Each suppressible occurrence becomes one Text layer. Unmatched labels stay in the page image.
- Font matching uses one `resolvePdfFont()` ladder (exact, equivalent weight, aliases, measured same-class, script-safe fallback). Book/Roman map to weight 400, Heavy/Black to 800–900. A handwriting font never becomes Inter.
- Figma Text layer `y` is aligned to the removed PDF glyph, not copied from the PDF baseline. A displaced heading is moved (at most twice) and only that run is dropped if it still fails. Successful lines on the same page stay editable.
- After per-line decisions, the page image is re-rendered with only the accepted letters removed. Rejected letters stay in the image and do not get a Text layer.

### Documentation

- Diagnosed persistent raster imports: whole-run suppression matching misses per-glyph canvas calls; clip/path-budget and page-wide paint-order gates also reject this corpus. Corrected the diagnosis to keep path rendering unproven and recorded that the previously described Figma export/compare gate is currently bypassed. Diagnosis only; no import code changed.
- Measured the sketches corpus in Chromium with pdf.js 3.11.174: fillText is per-glyph PUA `fontChar` (whole-string matching hits 0). Occurrence matching hits every canvas text call, but those calls are only a few percent of extracted lettering; the rest is path-painted. Figma compare/rollback was restored.
- Bundled pdf.js 3.11.174 with a fill-`showText` suppression hook. On the sketches corpus, pages 6 and 10 can hide `WORKSHEET 2` / `TEXTURES` completely; page 4’s title fill leaves a path outline; page 3’s visible letters are paths. Handwriting stays raster. Figma Desktop still needs a plugin reload to place those titles.

- Implemented the appearance-first Editable import architecture from `docs/editable-pdf-import-research.md` using public pdf.js APIs: ordered paint walking, gated line text, Form-aware images, a simple SVG path subset, fillText suppression proof, and Figma export/compare/commit with JPEG rollback.
- Added `scripts/editable-import-core.mjs` planner checks (`pnpm check:editable-import`).
- Added `docs/editable-pdf-import-research.md`: black-box study of pdf.tomake.design, PDF Pilot import architecture, engine/license comparison, and the recommended Editable import path.

- Consolidated product planning into `docs/ROADMAP.md`.
- Consolidated runtime contracts and storage details into `docs/architecture.md`.
- Removed stale planning, release-history, and private-notes documents.
- Simplified `STATE.md` to current work and blockers only.

Product code is ahead of Figma Community Version 8.

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
