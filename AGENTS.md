# Project: pdf-pilot
Last Updated: 2026-02-23
Updated By: Codex

## What This Project Does
PDF Pilot is a Figma plugin that exports selected frames/components/instances to PDF and translates selected designs with AI, duplicating localized frames and auditing overflow issues.

## Stack
Single app (no monorepo)
- Framework: Figma Plugin API (`manifest.json` API `1.0.0`) with custom plugin UI
- Language: TypeScript (`typescript` `^5.3.2`) plus HTML/CSS/vanilla JavaScript
- Database: None; persistence uses `figma.clientStorage`
- Key libraries: `@figma/plugin-typings` `*`, `@figma/eslint-plugin-figma-plugins` `*`, `eslint` `^8.54.0`, `@typescript-eslint/eslint-plugin` `^6.12.0`, `@typescript-eslint/parser` `^6.12.0`, bundled `jsPDF` `2.5.1`
- Deploy target: Loaded as a local Figma plugin (no separate server deployment)

## Never Do
- Never read or commit secrets from `.env`, `*.pem`, `*.key`, or API key values.
- Never call external APIs from `code.ts`; network calls must stay in `ui.html` per Figma plugin constraints.
- Never edit lock files unless explicitly requested.
- Never remove or overwrite existing agent instructions; append and preserve history.

## Always Do
- Run `npm run build` after TypeScript/plugin logic changes.
- Keep `code.ts` and `ui.html` message contracts in sync when changing plugin actions.
- Keep `figma.clientStorage` payload handling defensive and validated.
- Update `STATE.md`, `ROADMAP.md`, and architecture/learnings docs during normal task completion.

## Architecture
See docs/architecture.md

## Agent Rules — Self-Sustaining (mandatory, never skip)

SESSION START:
1. Read AGENTS.md (this file)
2. Read STATE.md for current task state and todos
3. Read ROADMAP.md for project direction
4. Read docs/architecture.md for system design
5. Do not start work until all four are read and understood

DURING WORK:
- If you complete a todo, mark it done in STATE.md immediately
- If you make an architecture decision, append it to docs/architecture.md
- If you discover a reusable pattern or learning, append to docs/learnings/
- If scope or direction changes, update ROADMAP.md then and there

SESSION END (mandatory, never skip):
1. Update STATE.md: what was completed, what is next,
   what failed and why, any blockers. Max 40 lines.
2. Mark completed todos in STATE.md
3. Add any newly discovered todos to STATE.md
4. Update ROADMAP.md if focus or backlog changed
5. Update Last Updated and Updated By in this file

## Learnings
See docs/learnings/
