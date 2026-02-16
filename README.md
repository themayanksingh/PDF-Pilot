# PDF Pilot

Figma plugin for:
- exporting selected designs to PDF
- translating selected designs with AI
- duplicating and localizing output by language

## Features

### Translate (AI)
- Select one or more `Frame` / `Component` / `Instance` nodes
- Choose target languages (FR/DE/ES/IT/TR/AR)
- Calls AI provider from plugin UI and applies translations to duplicated designs
- Uses stable mapping keys (`sourceFrameId::nodePath`) so text maps correctly after duplication
- Loads required fonts before text replacement (including mixed font ranges)
- Skips `TRUNCATE` text nodes and keeps source text for those nodes
- Shows in-button progress while translating
- Shows per-run spend in the Translate run feed (datetime, tokens, USD + INR)
- Shows a combined completion + audit section with:
  - translation API issues
  - text/font apply issues
  - overflow audit actions (Phase 2)

### Export PDF
- Select one or more `Frame` / `Component` / `Instance` nodes
- Export to PDF from the `Export PDF` tab
- Preserves URL links detected in text and node reactions

## AI Providers and Models

- Gemini:
  - `gemini-2.5-flash-lite` (fixed in UI)
- OpenAI:
  - `gpt-5.2`
  - `gpt-5-mini`

API keys are only required for the `Translate` workflow.

### Gemini Tier-Aware Tuning

In Settings, `Gemini Quota Tier` controls request pacing/concurrency:

- `Auto (safe default)` (uses free-tier-safe pacing)
- `Free Tier` (15 RPM / 250,000 TPM / 1,000 RPD)
- `Paid Tier 1` (4,000 RPM / 4,000,000 TPM)
- `Paid Tier 2` (10,000 RPM / 10,000,000 TPM)
- `Paid Tier 3` (30,000 RPM / 30,000,000 TPM)

These values are from Gemini API official rate-limit docs.

## Project Structure

- `code.ts`: Figma plugin sandbox logic (selection, extraction, duplication, apply)
- `ui.html`: plugin UI, tabs, provider calls, settings modal
- `manifest.json`: plugin metadata and `networkAccess.allowedDomains`
- `docs/PLAN.md`: translation implementation plan

Note: README is public-facing. Internal implementation details live in `docs/private-plugin-notes.md`.

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
4. Set filename and scale (`2x` default).
5. Export.

### Translate
1. Select nodes in Figma.
2. Open plugin.
3. Click `☰` (Dashboard) and save provider + API key.
4. Go to `Translate`.
5. Set source language and pick target languages.
6. Click Translate.

Spend visibility:
- Open `☰` Dashboard to manage API keys and view spend analytics (last 10 + all-time totals).
- The Translate tab also shows per-run spend cards after each run.

## Network Access

Manifest currently allows:
- `https://generativelanguage.googleapis.com`
- `https://api.openai.com`
