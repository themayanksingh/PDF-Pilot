# State

Last Updated: 2026-09-20
Updated By: Cursor Grok

## Release Status

- Figma Community Version 8 is the latest public release.
- User-facing import UI/code is ahead of Version 8. See `Unreleased` in `CHANGELOG.md`. Do not publish until Editable import is checked on a reloaded Figma plugin.

## Active Work

- Implementation is ready for Figma verification, not verified. `pnpm check:editable-import` is extraction/unit math only.
- Missing-font dialog is replaced by `resolvePdfFont()` (measured auto-sub, low-confidence raster). Live group `788:141` is still the previous import.
- After reload of `ui.bundle.html`, re-import pages 5 and 11. Futura Book should auto-map to installed Futura Regular/Medium, never Bold. No blocking font dialog.

## Blockers

- Figma Desktop must reload `ui.bundle.html` before the live node tree can change.
- Real acceptance still requires inspecting the new Figma tree (TextNode counts, accepted/rejected occurrence IDs, font-map logs, screenshots).

## Next Work

See `docs/ROADMAP.md`. Completed work belongs in `CHANGELOG.md`, not this file.
