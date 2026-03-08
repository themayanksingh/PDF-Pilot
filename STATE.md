# State
Last Updated: 2026-03-08
Updated By: Claude

## Active Tasks
- None

## Completed
- Completed a full code audit of `code.ts`, `ui.html`, config, and plugin/UI message contracts
- Verified the current repo builds and lints successfully with `npm run build` and `npm run lint`
- Fixed XSS: added `escapeHtml` in `ui.html`; applied to frame names and API error technical lines in `innerHTML` paths
- Fixed clone deletion: replaced name-based sibling search with `setPluginData`/`getPluginData` metadata tagging in `code.ts`
- Fixed spend idempotency: all-time summary now skips merge when `run_id` already present in recent runs
- Fixed `zh-TW`/`zh-CN` detection: both `NON_LATIN_LANGS` call sites now use `lang.split('-')[0]` base code
- Fixed multi-link hitbox: `extractLinks` now deduplicates URLs per text node to prevent overlapping PDF hotspots
- Fixed `pluginError`: errors now always log to `console.error` regardless of `debugMode`
- Fixed retry scoping: `selectOnlyLanguages` now updates `selectedLangCodes` directly (chip-based picker has no `<input>` elements; old DOM query was a no-op); removed the dead `#langGrid input` event listener
- Fixed spend durability: FX fetch failure no longer drops the run; USD totals are always recorded and `cost_inr` is 0 when rate is unavailable

## Blockers
- None

## Todos
- Support `Component` and `Instance` nodes end-to-end or update README/UI claims to match actual support
- Preserve fully accurate PDF link hitboxes (blocked: `getTextSegmentBoundingBoxes` not in Figma Plugin API v1.123.0 typings — revisit when Figma ships it)
- Implement overflow mitigation pipeline: send character budgets in prompts → auto-retry overflowing nodes with tighter budget (max 2 retries) → only surface items in overflow review that still fail after retries
- Add OpenAI support (Gemini already works; Claude excluded by design)
- Remember last-used language selections (already implemented via clientStorage; verify working)
