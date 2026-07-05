# Project: pdf-pilot
Last Updated: 2026-06-28
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
- Run `pnpm build` after TypeScript/plugin logic changes.
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
## Upfront Alignment Interview

Before any non-trivial design, architecture, or coding task in this repo, run an upfront alignment pass instead of steering reactively later. An LLM silently replaces the user's unspoken assumptions with its own guesses without signaling the substitution, so a wrong guess compounds through the work into muddied context that is harder to fix than starting over.

**How.** Interview the user in detail using the AskUserQuestion tool about anything relevant: technical implementation, UI and UX, concerns, tradeoffs, scope, constraints. Make the questions non-obvious — do not ask what is already answered by the code or this file; ask the questions whose answers only live in the user's head and would otherwise be guessed. Prefer questions that expose a fork where you would otherwise pick a default silently.

**Depth is adaptive.** Scale to the stakes: a few sharp questions for a small change, several rounds of deeper extraction for a large design or architecture decision. Keep surfacing assumptions as the work proceeds, not only at the start.

**Skip** for trivial edits, pure lookups, and mechanical one-line changes.
