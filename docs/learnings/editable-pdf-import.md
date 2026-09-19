# Editable PDF Import

Last Updated: 2026-09-20

Figma’s `createNodeFromSvg()` names the root `SVG Layer` and nested clips `Clip path group` / `clip_N` / `Mask group` / `image_N`. Seeing that tree in another plugin’s output is evidence of SVG import, not of native path reconstruction.

InDesign-exported text usually arrives as one text run per composed line, including soft hyphens. Treat that as the default TextNode granularity. Do not expect recovered paragraphs or original hierarchy.

Illustration-heavy interior/architecture PDFs often store drawings as image XObjects with soft masks, not as live vectors. Extract the images. Do not promise editable dimension arrows that only exist as pixels.

Keep a `PageModel` between the PDF engine and Figma node creation. The bitmap point for Image mode is `page.render()` in `ui.html`. Keep those JPEG bytes as Editable fallback. Never place native text over glyphs that are still in a page image.

Public pdf.js `page.render()` has no “skip these glyphs” API. A local hook in `CanvasGraphics.showText` skips fillText/paintChar for approved fill occurrences and keeps advances. That removes ordinary filled titles. Invisible searchable `showText` (render mode 3) and path-constructed lettering do not disappear. Hidden OCR with no `showText` must not become visible TextNodes.

`listAvailableFontsAsync()` is the only honest font list for TextNodes. Embedded PDF font bytes are parsed for family/style plus OS/2 weight, width, italic, PANOSE, and pitch. One shared `resolvePdfFont()` ladder (exact → equivalent style → aliases → measured same-class → script-safe fallback) replaces PDF-specific alias sprawl. Cross-family fallbacks need a measured width; missing measurements are not treated as a perfect match. Handwriting, symbols, and low-confidence misses stay in the page image. Finding a similar font does not skip glyph suppression.

Do not treat CJK or Hiragino as junk by themselves. Unreliable extract is a separate signal: replacement/PUA characters, Type3, or Type0 Identity-H without ToUnicode. A font match only means a replacement *could* be drawn. It does not mean the original glyphs can be removed.

Do not punch out path-painted lettering with white boxes or `destination-out`. Those destroy artwork under the glyphs. Skip only the original `showText` paint. A canvas difference after no-op `fillText` is not proof of successful suppression. Leftover outlines after a fill skip mean the letters also exist as paths — reject that run.

Transparency, Form XObjects, and photos must not by themselves discard gated text. Mode B (suppressed raster + TextNodes) is only valid when removal of the original paint is established; otherwise raster.

`.SFUI-Regular_opsz…_GRAD…_wght…` is a variable-font PostScript name. Strip axis suffixes and map `.SFUI` / `.SF NS` to SF Pro (or SF Pro Text / Display). `Semibold` must be detected before `/bold/i`, or it becomes Bold. `DINCondensed-Bold` maps to DIN Condensed.

pdf.js `getTextContent().styles[].fontFamily` is the CSS fallback (`sans-serif`), not the PDF BaseFont. Match from `page.commonObjs.get(fontName).name`. cdnjs’s pdf.js build has no `cmaps/`; set `cMapUrl` / `cMapPacked` (jsDelivr `pdfjs-dist`) or CID `translateFont` fails.

Planner geometry (second matrix column, ascent, Form CTM, page-clip, line compose) lives in `scripts/editable-import-core.mjs` and must stay copied in `ui.html`. `pnpm check:editable-import` is the runnable math check.

Open the PDF on file select so page count and preview thumbs exist before import. Reuse that pdf.js document for the actual import instead of reading the file twice.

Diagnostic correction, 2026-09-19: a failed string-selective `fillText` suppression test does not establish glyph-path rendering. pdf.js can call `fillText` per glyph using `fontChar`, whereas extraction returns whole Unicode runs. Production-hook probe: selecting `Hello` fails to suppress H/e/l/l/o. Match paint occurrences, not whole strings or a global character set.

Measurement, 2026-09-19: wrapping every 2d context on the local sketches PDF shows both facts at once. Pages 4/6/10 do call `fillText` (13/10/8 times), always with single PUA `fontChar` values; whole-string matching hits 0 of those calls and occurrence matching hits all of them. Extracted character counts are 1262/144/206, so most lettering never goes through canvas text (`disableFontFace` / path). Skip Mode B unless canvas text calls cover ≥80% of promoted characters. Do not punch out the rest. Prototype wrap is required: page-context-only wrap reported fill=0 on page 4.

Renderer hook, 2026-09-19: pdf.js 3.11.174 hook revision 2 is inlined into `ui.bundle.html`. On the sketches corpus, `hookHits` is 9/314/34/31 on pages 3/4/6/10. Almost all `showText` is invisible (mode 3) sitting on path artwork. Ordinary fill titles `WORKSHEET 2` and `TEXTURES` (pages 6 and 10) can be removed completely while sketches stay. `ABOUT THIS BOOK` (page 4) leaves a path outline. Page 3’s visible title is paths. Figma must load `ui.bundle.html` after `pnpm build`. `node scripts/prove-pdfjs-hook.mjs` is the Chromium renderer regression (local PDF, captures in `/tmp`). It is not a Figma import.

Plugin-path trace, 2026-09-19: Figma file `zmBOVuy20BctcwfHHFsFYM` still shows 17 `Page image` frames and zero TextNodes after the hook (page 6 = `12:310`, page 10 = `12:318`). The first failing production stage for those titles was paint-order, not suppression. `analyzePdfPaint` set `sawText` on the first text op and compared every candidate to every later path bbox (and treated `beginGroup` as a page-wide veil). Page 6’s first overlapping later fill sits at y≈112 against a title box that ends ≈113 — grazing artwork, not a cover. After stamping `afterSeq` and requiring ≥50% area overlap, both titles pass cover, match `page#1`, suppress, and choose mode `text`. Do not disable occlusion; a later image or fill that covers most of the glyph box still blocks promotion. Do not delete nearby paths because their boxes overlap extracted text.

Workbook lettering classes on this corpus: **native text** = ordinary fill `showText` (the two titles) when Figma already has the named font. **Stay raster** = path-constructed handwriting plus invisible searchable `showText`, leftover path outlines, Type3/clip. **Editable vectors** = not this file (pages 6/10 have 258k–326k path segs and leftover lettering, so SVG mode is rejected). The PDF embeds a 2680-byte `WOMRVE+DINCondensed-Bold` subset; Figma cannot install those bytes. `listAvailableFontsAsync` still has to contain DIN Condensed for TextNodes.

Figma `createImage` rejects any edge above 4096. A 1440×810 page at High (4×) is 5760×3240 and throws `Image is too large`. Cap render scale by max edge as well as 16M pixels. Embedded subset name tables often store the PDF subset tag as family and `Unknown` as style — parse BaseFont too.

pdf.js operator-list `setFillRGBColor` on the Essential Guide PDF supplies bytes such as `[44, 46, 53]`. Store 0–1 at the extraction boundary (`normalizePdfRgb`). `clamp01(44)` is white. `rgbCss` must not multiply already-byte values by 255.

`getTextContent` splits several `showText` strings, including hyphenated lines. Exact Unicode equality between one item and one occurrence is not ownership. Concatenate adjacent fragments onto the renderer occurrence; one TextNode per occurrence; suppress that ID only.

OpenType name-table `Regular` must not overwrite BaseFont `Book`. Do not pick the first style in a family. Book may use Regular or Medium; Book must not become Bold. Missing styles are resolved by `resolvePdfFont()`, not a blocking Keep-original dialog.

Text-mode verification must not compare a pdf.js canvas to a Figma-exported PNG. Figma TextNode `y` is the line-box top, not the PDF baseline; copying `element.y` produces “displaced text”. Measure source vs Figma glyph centroids, move that TextNode, and retry at most twice. Match by `occurrenceId`, not array index. Figma background vs candidate pixels outside estimated rectangles are TextNode paint — not a graphics-mismatch gate (pages 10–15 were false rejects). A failed run stays in the raster; do not roll successful siblings back. Drawing onto the same browser canvas as pdf.js is not a Figma verify.

Diagnostic logs must name the terminal stage (`extraction-rejected`, `text-placement-failure`, `candidate-export-failure`, `verification-rejected`, `accepted`). Do not log the extraction reason as if placement succeeded.
