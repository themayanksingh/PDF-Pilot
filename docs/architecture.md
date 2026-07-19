# Architecture

Last Updated: 2026-07-19

## System Overview

PDF Pilot is a single Figma plugin with two execution contexts:

- `code.ts` runs in the Figma plugin sandbox. It reads the current selection, exports nodes, validates UI messages, owns `figma.clientStorage`, creates imported page nodes, duplicates translation targets, loads fonts, applies translated text, and audits overflow.
- `ui.html` runs in the plugin iframe. It renders the interface, loads PDF.js, assembles PDFs with bundled jsPDF, calls AI providers, manages translation orchestration, computes estimated spend, and presents progress and review states.

The plugin window is opened at `480 × 620` with Figma theme colors enabled.

## Execution Boundary

External network calls stay in `ui.html`. `code.ts` must not call external APIs.

Allowed UI domains are:

- `https://cdnjs.cloudflare.com`
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

1. `ui.html` loads PDF.js from cdnjs and reads the selected file into memory.
2. It validates the requested page range and renders each page to canvas.
3. Low, Medium, and High map to 1.5×, 2×, and 4× JPEG rendering.
4. Rendering is capped at 16 million pixels per page and files above 25 MB trigger a warning.
5. The UI sends validated `{ pageNumber, width, height, imageBase64 }` payloads through `import-pdf-pages`.
6. `code.ts` creates one page frame and image-filled rectangle per page, groups them in a parent frame, and wraps after 20 pages per row.

Import is intentionally raster-only. Text remains visible inside the page image but is not editable.

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
- `get-settings`, `save-settings`, `save-target-languages`
- `get-dashboard-data`, `record-run-spend`
- `extract-text`, `apply-translations`, `patch-node-translations`
- `cancel`, `cancel-translation`
- `decrease-font`, `expand-layer`, `auto-fix-overflow`, `focus-node`

Important plugin-to-UI messages:

- `selection-update`
- `export-progress`, `export-data`, `export-error`
- `import-pdf-place-progress`, `import-pdf-complete`, `import-pdf-error`
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
