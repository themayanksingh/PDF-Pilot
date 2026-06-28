# Roadmap
Last Updated: 2026-06-28

## Current Focus
Stabilize the new PDF import workflow, JPEG export quality presets, and translation operations in the Figma plugin.

## Next Up
- Constraint-aware overflow mitigation during translation runs
- Better frame-level debugging for partial translation/apply failures
- Monitor PDF import reliability in Figma Desktop, especially cdnjs/pdf.js loading and large multi-page PDFs
- Continued UX reliability improvements in translation workflows

## Backlog
- Make PDF import fully offline by bundling the PDF renderer into `ui.html`
- Add more AI providers (including Claude)
- Remember last-used language selections
- Export translated frames directly to PDF

## Completed Milestones
- JPEG-only export presets with export scale up to 6x
- PDF import quality presets, page ranges, large-file warning, cancel, remembered import quality, and horizontal 20-per-row placement
- PDF import tab that places each PDF page onto the Figma canvas as a flat image layer
- Dashboard with provider/API key management
- Last-run, last-10, and all-time spend summaries
- Translation review state persistence on selection updates
