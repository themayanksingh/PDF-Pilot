# pdf.js 3.11.174 — PDF Pilot renderer hook

Upstream: Mozilla pdf.js generic build `3.11.174` (`pdfjsBuild` `ce8716743`).
Original `vendor/pdfjs/pdf.js` SHA-256:
`d83766f20a4c31fbce5a29d98789cdfbef781b147441da45be1d1079e8e0f81c`

License: Apache 2.0 (see `LICENSE`).

## Rebuild

1. Replace `vendor/pdfjs/pdf.js` with the generic `pdf.js` from pdf.js 3.11.174 (cdnjs or GitHub tag `v3.11.174`).
2. Keep `vendor/pdfjs/pdf.worker.min.js` from the same version.
3. `node scripts/patch-pdfjs.mjs`
4. `pnpm build` (patches if needed, writes `ui.bundle.html`, compiles `code.ts`)

Do not load `pdf.min.js` from cdnjs in the running plugin. Figma loads `ui.bundle.html`.

## Hook revision 2

`CanvasGraphics.showText` / `showType3Text` assign stable IDs `formPath#seq` (Form begin/end push/pop). Collect records unicode, device origin, advance width, fill colour (0–1 from the current hex fill), font, render mode, and whether paint is suppressible (ordinary **fill** text only — not clip, pattern, Type3, or invisible searchable overlays). Suppress skips fillText/paintChar/path glyph fill while keeping advances and graphics state.

Invisible `showText` (render mode 3) is recorded but not suppressible. On the sketches corpus that overlay sits on top of path-drawn lettering; skipping it does not change pixels.

`isEvalSupported` remains false at `getDocument`.
