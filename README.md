# PDF Pilot

PDF Pilot is a Figma plugin for exporting selected designs to PDF, importing PDF pages onto the canvas, and creating AI-translated copies of selected designs.

[View PDF Pilot on Figma Community](https://www.figma.com/community/plugin/1604040004181266174/pdf-pilot)

## Features

### Export PDF

- Export selected Frames and Components as one PDF.
- Review and reorder pages before export with a dedicated drag handle.
- Choose a raster scale from 1× through 6×.
- Choose High, Balanced, or Small File JPEG quality.
- Preserve supported URL links from text and prototype reactions.
- Remember the latest export scale and quality.

### Import PDF

- Choose or drop a local PDF.
- Import every page or a page range such as `1-3, 5`.
- Choose Low (1.5×), Medium (2×), or High (4×) JPEG quality.
- Cancel during rendering and review progress as pages are placed.
- Create one page frame per imported page inside a parent frame.

Imported pages are raster images. Their text remains visible but is not editable as Figma text layers.

### Translate

- Translate selected Frames and Components with Gemini or OpenAI.
- Choose from 30 target languages.
- Keep the original designs unchanged and create translated copies below the existing canvas content.
- Preserve text-to-layer mapping across duplicated frames.
- Detect overflow, retry with tighter character budgets, and provide manual review actions.
- Apply Arabic text alignment and preserve the right edge during right-to-left overflow fixes.
- Record token usage and estimated USD spend for recent and all-time runs.

API keys are required only for translation and are stored with `figma.clientStorage` in the local Figma client context.

## Supported AI Models

- Gemini: `gemini-2.5-flash-lite`
- OpenAI: `gpt-5-mini`

Gemini quota profiles control request pacing for Auto, Free, and Paid tiers.

## Development

Requirements:

- Figma Desktop
- Node.js
- pnpm `10.30.3`

Install and build:

```bash
pnpm install
pnpm build
```

Watch TypeScript changes:

```bash
pnpm watch
```

Validate the project:

```bash
pnpm build
pnpm lint
```

Load `manifest.json` as a development plugin in Figma Desktop.

## Project Structure

- `code.ts` — Figma sandbox logic, storage, node creation, export rasterization, and translation application.
- `ui.html` — plugin interface, PDF assembly/rendering, AI provider calls, and progress/review flows.
- `manifest.json` — plugin metadata and allowed network domains.
- `CHANGELOG.md` — released, unreleased, and historical completed work.
- `STATE.md` — current operational state, active monitoring, and blockers.
- `docs/ROADMAP.md` — pending product direction and priorities.
- `docs/architecture.md` — runtime boundaries, data flows, persistence, and message contracts.
- `docs/learnings/` — focused reusable engineering learnings.
- `AGENTS.md` — repository workflow and maintenance rules.

## Network Access

The plugin UI is allowed to access:

- `https://cdnjs.cloudflare.com` for PDF.js
- `https://generativelanguage.googleapis.com` for Gemini
- `https://api.openai.com` for OpenAI

PDF files are read locally in the plugin UI. PDF import does not upload the selected file to a project server.

## Documentation Policy

- Keep completed work in `CHANGELOG.md`.
- Keep only pending work in `docs/ROADMAP.md`.
- Keep only current status and blockers in `STATE.md`.
- Record user-facing code that has not reached Figma under `Unreleased` in `CHANGELOG.md`.
