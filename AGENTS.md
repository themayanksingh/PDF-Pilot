# Project: pdf-pilot
Last Updated: 2026-09-20
Updated By: Cursor Grok

## What This Project Does
PDF Pilot is a Figma plugin that exports selected frames/components to PDF, imports PDF pages as image-backed frames, and translates selected designs with AI while preserving the originals.

## Stack
Single app (no monorepo)
- Framework: Figma Plugin API (`manifest.json` API `1.0.0`) with custom plugin UI
- Language: TypeScript (`typescript` `^5.3.2`) plus HTML/CSS/vanilla JavaScript
- Database: None; persistence uses `figma.clientStorage`
- Key libraries: `@figma/plugin-typings` `*`, `@figma/eslint-plugin-figma-plugins` `*`, `eslint` `^8.54.0`, `@typescript-eslint/eslint-plugin` `^6.12.0`, `@typescript-eslint/parser` `^6.12.0`, bundled `jsPDF` `2.5.1`, vendored pdf.js `3.11.174` (hook revision 2) inlined into `ui.bundle.html`
- Deploy target: Loaded as a local Figma plugin (no separate server deployment)

## Never Do
- Never read or commit secrets from `.env`, `*.pem`, `*.key`, or API key values.
- Never call external APIs from `code.ts`; network calls must stay in `ui.html` per Figma plugin constraints.
- Never edit lock files unless explicitly requested.
- Never remove or overwrite existing agent instructions; append and preserve history.

## Always Do
- Always run `pnpm build` after TypeScript/plugin logic changes (patches pdf.js if needed, writes `ui.bundle.html`, compiles `code.ts`).
- Figma loads `ui.bundle.html`, not `ui.html`.
- Keep `code.ts` and `ui.html` message contracts in sync when changing plugin actions.
- Keep `figma.clientStorage` payload handling defensive and validated.
- Keep `STATE.md` limited to current status, active work, and blockers.
- Keep `docs/ROADMAP.md` limited to pending direction and priorities.
- Move completed work out of `STATE.md` and `docs/ROADMAP.md` into `CHANGELOG.md` immediately.
- Update architecture/learnings documentation when current behavior or reusable knowledge changes.
- Keep `CHANGELOG.md` synchronized with the code and the public Figma Community release.

## Release Tracking — Code Ahead of Figma (mandatory)
- Treat the latest numbered version shown in `CHANGELOG.md` as the last known public Figma Community release.
- Whenever a user-facing change lands in `code.ts`, `ui.html`, or `manifest.json` but has not yet been published to Figma, immediately record it under `Unreleased` in `CHANGELOG.md`.
- Keep unreleased entries written in user-facing language and include the relevant Git commit when one exists.
- Do not describe Git and Figma as aligned while `Unreleased` contains product changes.
- After publishing, verify the live Figma Community listing, move the shipped entries into the new numbered version, and record its publication date and public release note.

## Architecture
See docs/architecture.md

## Agent Rules — Self-Sustaining (mandatory, never skip)

SESSION START:
1. Read AGENTS.md (this file)
2. Read STATE.md for current task state and todos
3. Read docs/ROADMAP.md for project direction
4. Read docs/architecture.md for system design
5. Do not start work until all four are read and understood

DURING WORK:
- If you complete a todo, remove it from STATE/ROADMAP and add it to CHANGELOG.md immediately
- If you make an architecture decision, append it to docs/architecture.md
- If you discover a reusable pattern or learning, append to docs/learnings/
- If scope or direction changes, update docs/ROADMAP.md then and there
- If product code becomes newer than the public Figma release, update `CHANGELOG.md` before ending the task

SESSION END (mandatory, never skip):
1. Update STATE.md with current status, active work, failures, and blockers. Max 40 lines.
2. Move completed work to CHANGELOG.md; never leave completed lists in STATE.md or docs/ROADMAP.md.
3. Add newly discovered future work to docs/ROADMAP.md.
4. Update docs/ROADMAP.md if focus or backlog changed
5. Update Last Updated and Updated By in this file

## Learnings
See docs/learnings/
## Upfront Alignment Interview

Before any non-trivial design, architecture, or coding task in this repo, run an upfront alignment pass instead of steering reactively later. An LLM silently replaces the user's unspoken assumptions with its own guesses without signaling the substitution, so a wrong guess compounds through the work into muddied context that is harder to fix than starting over.

**How.** Interview the user in detail using the AskUserQuestion tool about anything relevant: technical implementation, UI and UX, concerns, tradeoffs, scope, constraints. Make the questions non-obvious — do not ask what is already answered by the code or this file; ask the questions whose answers only live in the user's head and would otherwise be guessed. Prefer questions that expose a fork where you would otherwise pick a default silently.

**Depth is adaptive.** Scale to the stakes: a few sharp questions for a small change, several rounds of deeper extraction for a large design or architecture decision. Keep surfacing assumptions as the work proceeds, not only at the start.

**Skip** for trivial edits, pure lookups, and mechanical one-line changes.

## Maintenance History

- 2026-09-19 — Cursor Grok stopped comparing pdf.js canvases to Figma PNG exports. Verification now uses Figma background-only vs Figma candidate plus pdf.js source removal. `pnpm build` and `pnpm check:editable-import` passed. Live `788:105` is still the previous import until plugin reload. Existing agent instructions are preserved.

- 2026-09-20 — Cursor Grok replaced the blocking missing-font dialog with `resolvePdfFont()`: normalize PDF names, read OpenType metrics, measure Figma candidates, auto-sub at high/medium confidence, keep low-confidence lettering in the page image. `pnpm` checks are not a Figma verify. Live `788:141` is still the previous import. Existing agent instructions are preserved.

- 2026-09-20 — Cursor Grok required an explicit missing-font choice, aligned TextNodes by glyph centroid, dropped the Figma-pair graphics-mismatch gate, and accepted or rejected each occurrence instead of rolling the page back. `pnpm` checks are not a Figma verify. Existing agent instructions are preserved.

- 2026-09-19 — Cursor Grok fixed Essential Guide Editable import at the confirmed roots: RGB bytes→0–1, three-image text verify, occurrence-owned fragment concat, exact font style plus Keep-original mapping, and terminal-stage logs. `pnpm build` and `pnpm check:editable-import` passed pages 5/11 in Chromium. Live Figma `12:447` is still the pre-reload tree. Existing agent instructions are preserved.

- 2026-09-19 — Cursor Grok traced the bundled import (not the hook proof): paint-order grazing paths blocked the two fill titles; per-occurrence occlusion, embedded font naming, and a 4096px Figma image cap are in `ui.bundle.html`. Figma file still has 17 images until reload. Existing agent instructions are preserved.

- 2026-09-19 — Cursor Grok packaged pdf.js 3.11.174 hook revision 2 into `ui.bundle.html`, proved fill-title suppression on sketches pages 6/10, and rejected leftover outlines / path lettering. Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok matched canvas text to paint occurrences, dropped page-wide coverage abort, restored Figma PNG verify, and measured the sketches corpus (PUA fillText is real; most lettering is still path-painted). Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok shipped the senior call: raster this PDF class until renderer-level suppression; report unsafe-text preservation in the import summary; no punch-outs. Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok fixed Editable font matching to use PDF BaseFont names and pdf.js CMaps (jsDelivr). Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok split missing fonts (one mapping step per import) from unreliable extracts, allowed partial text promotion with selective fillText suppress, and added always-on `[PDF Pilot]` import logs. Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok implemented appearance-first Editable import (gated svg/text, Figma compare/rollback, no Inter substitute) and refreshed session docs. Existing agent instructions are preserved.
- 2026-09-19 — Cursor Grok was the previous recorded updater. Codex refreshed session status and the Editable import architecture proposal; existing agent instructions are preserved.

- 2026-09-19 — Codex traced the supplied all-raster logs and reproduced the whole-run/per-glyph suppression mismatch; recorded inactive Figma verification. Previous updater: Cursor Grok. Existing instructions are preserved.
