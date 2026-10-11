# Architecture

Last Updated: 2026-10-05

## System Overview

PDF Pilot is a single Figma plugin with two execution contexts:

- `code.ts` runs in the Figma plugin sandbox. It reads the current selection, exports nodes, validates UI messages, owns `figma.clientStorage`, creates imported page nodes, duplicates translation targets, loads fonts, applies translated text, and audits overflow.
- `ui.html` runs in the plugin iframe. It renders the interface, loads PDF.js, assembles PDFs with bundled jsPDF, calls AI providers, manages translation orchestration, computes estimated spend, and presents progress and review states.

The plugin window is opened at `480 × 620` with Figma theme colors enabled.

## Execution Boundary

External network calls stay in `ui.html`. `code.ts` must not call external APIs.

Allowed UI domains are:

- `https://cdnjs.cloudflare.com`
- `https://cdn.jsdelivr.net` (pdf.js CMaps and standard fonts for CID/Type0)
- `https://generativelanguage.googleapis.com`
- `https://api.openai.com`

PDF import reads the user's file locally. The selected PDF is rendered in the UI and is not sent to a PDF-processing server.

## Supported Selection Roots

Export and translation accept selected `FRAME` and `COMPONENT` nodes. Descendant Instances are handled while walking a selected root, but selecting an Instance as the root is not currently supported.

## Export Flow

1. `ui.html` displays selected roots and lets the user review their order.
2. The UI sends `export` with ordered frame IDs, scale, and quality.
3. `code.ts` resolves those IDs and exports each root as JPEG with a small worker pool.
4. `code.ts` extracts supported URL regions from text hyperlinks and URL prototype reactions.
5. `ui.html` recompresses images according to High, Balanced, or Small File quality and assembles the PDF with jsPDF.

Export scale supports `1`, `1.5`, `2`, `3`, `4`, `5`, and `6`. All presets use JPEG; scale controls raster dimensions while quality controls recompression. Scale and quality are persisted, but the filename is intentionally transient.

## Import Flow

1. Build the plugin with `pnpm build`.
   - The build patches `vendor/pdfjs/pdf.js` when needed, inlines the renderer and worker into `ui.bundle.html`, and compiles `code.ts`.
   - Figma loads `manifest.json` and then `ui.bundle.html`. `figma.showUI(__html__)` cannot fetch files from `vendor/`.
   - The running engine is pdf.js **3.11.174** (`ce8716743`) with PDF Pilot hook revision 2 and `isEvalSupported: false`.
   - CMaps and standard fonts still load from jsDelivr.
2. When the user selects a PDF, open it to read the page count and create a low-resolution thumbnail strip. Reuse the same pdf.js document when import starts. If the hook is missing, report a renderer or build error. Do not silently treat the file as unsupported.
3. The user chooses Image or Editable import. `code.ts` sends `listAvailableFontsAsync()` with the import settings so Editable mode can match installed Figma fonts.
4. In Image mode, validate the page range and render each page to a canvas.
   - Low, Medium, and High use 1.5×, 2×, and 4× JPEG rendering.
   - Cap output at 16 million pixels and 4096 pixels per edge. This is Figma's `createImage` limit.
   - Warn when a file is larger than 25 MB.
   - Send `{ pageNumber, width, height, imageBase64 }` through `import-pdf-pages`.
   - `code.ts` creates one page frame and one image-filled rectangle for each page.
5. Editable mode keeps the same JPEG bytes as its fallback. The UI reads the operator list (save/restore/transform, Form begin/end, images, simple paths, and text paint). It classifies `getTextContent()` runs and chooses one of three paths:
   - **svg:** Use `createNodeFromSvg` for simple solid paths and Form-aware images. Add gated Text nodes only when no content must remain in the page image.
   - **text:** Render a PNG with accepted source text suppressed, then add gated Text nodes. Promote only ordinary fill `showText` occurrences. The renderer occurrence owns the text. Adjacent `getTextContent` fragments may join one occurrence, including hyphen joins. Suppress only that occurrence ID. Keep leftover and rejected text in the page image.
   - Verify each occurrence. Confirm that pdf.js full and suppressed renders show source glyph removal. Confirm that the Figma candidate and background show the new ink. Check visible colour, centroid alignment, reasonable ink, and duplicate text. Do not compare Figma pixels outside TextNode bounds as a graphics gate. Do not compare pdf.js pixels with Figma exports for graphics.
   - **raster:** Use the Image-mode JPEG for hidden or invisible searchable overlays, Type3 text, clipping text, and lettering made only from path artwork.
6. Keep `fontExtraProperties` in `getDocument` so embedded OpenType bytes remain on the pdf.js font object. Read that file and its `name`, `OS/2`, and `post` tables to find family, weight, width, italic, PANOSE, and pitch. `resolvePdfFont()` checks, in order: exact match, equivalent style, aliases, measured same-class match, and script-safe fallback.
   - Keep low-confidence matches and handwriting or symbol misses in the page image. Do not show a blocking font dialog.
   - Show a non-blocking substitution report after import. **Change mapping** saves an override for the next import.
   - Finding a similar font does not skip suppression. Remove the original glyphs before keeping a Text node.
   - Do not promote unreliable extracts (PUA/FFFD, Type3, or Identity-H CID without ToUnicode) to Text layers. Invisible `showText` in render mode 3 cannot be suppressed.
7. For candidate pages, export two Figma PNGs from the same frame: one with Text nodes hidden, then one with them visible. Carry `occurrenceId` from the renderer through PageModel to Text node plugin data `pdf-pilot-occurrence` and verification.
   - Verify source glyph removal with pdf.js full and suppressed renders. Verify added ink by comparing the Figma images and matching `occurrenceId`.
   - Figma Text node `y` is the line-box top, not the PDF baseline. Move displaced runs by centroid dx/dy, for at most two passes. Do not roll back the whole page.
   - Omit a failed run. Re-render the background with only accepted IDs suppressed. Roll back to the whole-page JPEG only when no run is accepted.
   - Keep extraction rejection, text placement failure, and candidate export failure as separate terminal stages. Store diagnostics in plugin data as `pdf-pilot-reason`.
   - The UI also sends `import-pdf-log`. `code.ts` prints `[PDF Pilot]` entries such as `font-map PDF="…" -> FIGMA="…"` or `RASTER, runs=N`.
   - Keep quality as an Image-mode control. Editable mode hides it and reuses the last saved scale for fallback bytes.
8. Both modes group pages in a parent frame. Wrap after 20 pages per row.

Image mode renders the bitmap with `page.render()` in `ui.html` immediately before JPEG encoding. Editable mode may render again with accepted text suppressed. It must not show native text over glyphs that remain in a page image.

### Editable Import

- Keep Image mode as the reliable pdf.js canvas path and the exact fallback bytes.
- Editable mode is `pdf.js extractor → PageModel → Figma renderer`. Shared planner math lives in `scripts/editable-import-core.mjs` and is copied in `ui.html`.
- The extractor in `ui.html` must not create Figma nodes.
- Promote text only when original glyph paint can be removed and paint order is known. Otherwise keep the Image-mode JPEG. A positive gated-text count is not a successful editable import.
- Do not punch out lettering with white rectangles or `destination-out`; those destroy artwork behind the glyphs.
- The running renderer is a local, pinned pdf.js 3.11.174 generic build with a reviewed hook in `CanvasGraphics.showText` / `showType3Text` (`vendor/pdfjs/`, `scripts/patch-pdfjs.mjs`). IDs are `formPath#seq`. Suppress skips fillText/paintChar (including glyph-path fills) while keeping advances. Only fill render mode is suppressible. Type3, clip, pattern, and invisible overlays stay painted. Rebuild: `vendor/pdfjs/MODIFICATIONS.md`. `pnpm check:editable-import` asserts the hook; `node scripts/prove-pdfjs-hook.mjs` renders the local sketches PDF.
- Later paint is stamped with the text-op sequence it followed. A run is occluded only if that later paint was after its occurrence and covers at least half of the glyph box. Nearby path bboxes, later strokes, and `beginGroup` wrappers are not a veil. Uncovered runs can still promote. Do not delete nearby paths because their boxes overlap extracted text.
- Missing PDF fonts are resolved by `resolvePdfFont()`, not by Inter-by-default or a blocking dialog. Handwriting and symbols stay raster unless the exact family exists. Substitution never overlays glyphs that are still in the page image.
- pdf.js `setFillRGBColor` args for this corpus are bytes. PageModel colours are canonical 0–1 (`normalizePdfRgb`). Do not clamp bytes with Figma `clamp01`.
- `pnpm check:editable-import` includes `scripts/check-editable-import.mjs` (centroid, occurrenceId, partial accept, `resolvePdfFont`) and `scripts/check-guide-import.mjs` (Chromium extraction for Essential Guide pages 5/11). That Chromium check is not a Figma production-path test.
- Do not add MuPDF (AGPL). Do not start with PDFium.
- Full rationale: `docs/editable-pdf-import-research.md`.

### Renderer hook — 2026-09-19 (verified)

Hook revision 2 executed on the 17-page sketches corpus in Chromium with the same vendored build Figma loads (`hookHits` is the proof, not the version string).

| Page | hookHits | Fill `showText` | Invisible overlays | Kept fill lines | Notes |
|---|---|---|---|---|---|
| 3 | 9 | 0 | 9 | 0 | Visible title is path artwork; searchable overlay does not paint |
| 4 | 314 | 1 (`ABOUT THIS BOOK`) | 313 | 0 | Fill hides; gray path outline of the title remains — rejected |
| 6 | 34 | 1 (`WORKSHEET 2`) | 33 | 1 | Title fully gone; sketches stay |
| 10 | 31 | 1 (`TEXTURES`) | 30 | 1 | Title fully gone; sketches stay |

Repeated strings (`WILL` ×9, `YOU` ×18 on page 4) get distinct `page#N` IDs. This corpus has no nested Form text (`formPath` stayed `page`). Interior handwriting is path-drawn, not `showText`, so Mode B cannot lift it without identifying those paths. The SVG 8k cap is unchanged.

The live Figma file `zmBOVuy20BctcwfHHFsFYM` still had 17 image-only frames after the hook landed (`12:310` / `12:318` = pages 6 and 10, `text not separated from artwork`, zero TextNodes). `prove-pdfjs-hook.mjs` passing is not a Figma import. Tracing the bundled extract path (`scripts/trace-plugin-import.mjs`, engine 3.11.174 / `ce8716743` / hook `2`) showed the first production failure: `analyzePdfPaint` used a page-wide `sawText` flag, then `coveredTextRunIndices` treated every later path bbox as occlusion. On page 6 the first “cover” was a sketch fill at y≈112 grazing the title box (title bottom ≈113). On page 10, `beginGroup` was recorded as a full-page veil. Geometry, occurrence match (`page#1`), and fill suppression already passed. After per-occurrence + 50% area occlusion, both titles choose Editable `text` when Figma has DIN Condensed. The PDF embeds `WOMRVE+DINCondensed-Bold` (2680-byte OpenType subset); Figma cannot install those bytes. Handwriting stays raster. Expected milestone if DIN Condensed is installed and the plugin is reloaded: 2 TextNodes, 0 SVG reconstructions, 17 page images.

Candidate pages export two Figma PNGs from the same frame (text hidden, then visible). Those two PNGs differ only by TextNode paint, so pixels outside estimated rectangles are not a graphics-mismatch gate. Raster pages skip that round-trip.

## Translation Flow

1. `ui.html` requests extraction for the selected root IDs.
2. `code.ts` traverses text descendants and assigns `mappingKey = sourceFrameId::nodePath`.
3. `ui.html` batches text by frame and language, adds character budgets, and calls Gemini or OpenAI.
4. Missing structured-output entries are retried; terminal batch failures fall back to the source text and are surfaced for review.
5. `code.ts` duplicates source roots once per language, loads required fonts, applies text by mapping key, and places each run in a new block below current page content.
6. Overflow is audited after apply. The UI can retry overflowing entries with tighter budgets and provides manual decrease-font, expand-layer, auto-fix, ignore, and focus actions.

Arabic clones receive right alignment after fonts load. Manual width expansion preserves the right edge for right-aligned text. Full RTL auto-layout direction handling remains roadmap work.

## Persistence

`code.ts` is the only owner of `figma.clientStorage`. Current keys include:

- `ai-provider`
- `ai-model`
- `api-key-gemini`
- `api-key-openai`
- `quota-profile`
- `target-languages`
- `debug-mode`
- `enable-translation`
- `export-scale`
- `export-quality`
- `import-quality`
- `import-mode`
- `spend-runs-v2`
- `spend-all-time-summary-v1`
- `spend-known-run-ids-v1`

Settings and history payloads are normalized defensively. Recent spend stores up to 10 run records, known run IDs are capped at 200 for idempotency, and spend values are tracked in USD.

## Message Contracts

Important UI-to-plugin messages:

- `init`
- `export`, `export-done`
- `get-export-settings`, `save-export-settings`
- `get-import-settings`, `save-import-settings`, `import-pdf-pages`
- `import-pdf-editable-begin`, `import-pdf-editable-page`, `import-pdf-verify`, `import-pdf-editable-finish`
- `import-pdf-log`
- `get-settings`, `save-settings`, `save-target-languages`
- `get-dashboard-data`, `record-run-spend`
- `extract-text`, `apply-translations`, `patch-node-translations`
- `cancel`, `cancel-translation`
- `decrease-font`, `expand-layer`, `auto-fix-overflow`, `focus-node`

Important plugin-to-UI messages:

- `selection-update`
- `export-progress`, `export-data`, `export-error`
- `import-pdf-place-progress`, `import-pdf-page-placed`, `import-pdf-candidate-export`, `import-pdf-complete`, `import-pdf-error`
- `settings-loaded`, `settings-saved`, `export-settings-loaded`, `import-settings-loaded`
- `dashboard-data`, `debug-log`
- `text-data`, `extract-progress`, `translation-apply-progress`, `translation-complete`
- `audit-action-done`, `audit-action-error`, `patch-complete`

When either side changes a message, the other side must be updated in the same task.

## Reliability Invariants

- Validate all messages and persisted values before use.
- Load every required font before changing text or alignment.
- Preserve source frames; translations always operate on duplicates.
- Preserve reviewed export order through explicit node IDs.
- Keep imported PDF page dimensions separate from raster render scale.
- Cap expensive work and expose progress/cancel states for long operations.
- Keep API keys out of repository files and logs.
