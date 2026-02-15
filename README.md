# PDF Pilot

Figma plugin for:
- exporting selected designs to PDF
- translating selected designs with AI
- duplicating and localizing output by language

## Features

### Export PDF
- Select one or more `Frame` / `Component` / `Instance` nodes
- Export to PDF from the `Export PDF` tab
- Preserves URL links detected in text and node reactions

### Translate (AI)
- Select one or more `Frame` / `Component` / `Instance` nodes
- Choose target languages (FR/DE/ES/IT/TR)
- Calls AI provider from plugin UI and applies translations to duplicated designs
- Uses stable mapping keys (`sourceFrameId::nodePath`) so text maps correctly after duplication
- Loads required fonts before text replacement (including mixed font ranges)
- Skips `TRUNCATE` text nodes and keeps source text for those nodes
- Shows completion summary with:
  - translation API issues
  - text/font apply issues

## AI Providers and Models

- Gemini:
  - `gemini-3-flash-preview`
- OpenAI:
  - `gpt-5.2`
  - `gpt-5-mini`

API keys are only required for the `Translate` workflow.

## Project Structure

- `code.ts`: Figma plugin sandbox logic (selection, extraction, duplication, apply)
- `ui.html`: plugin UI, tabs, provider calls, settings modal
- `manifest.json`: plugin metadata and `networkAccess.allowedDomains`
- `docs/PLAN.md`: translation implementation plan

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build:
```bash
npm run build
```

3. (Optional) Watch mode during development:
```bash
npm run watch
```

4. Load plugin in Figma from this directory.

## Dev Checks

```bash
npm run build
npm run lint
```

## Usage

### Export PDF
1. Select nodes in Figma.
2. Open plugin.
3. Go to `Export PDF`.
4. Choose scale and filename.
5. Export.

### Translate
1. Select nodes in Figma.
2. Open plugin.
3. Click `⚙` and save provider + API key.
4. Go to `Translate`.
5. Pick target languages.
6. Click Translate.

## Network Access

Manifest currently allows:
- `https://generativelanguage.googleapis.com`
- `https://api.openai.com`
