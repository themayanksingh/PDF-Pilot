# Editable PDF Import — Research Report

Last Updated: 2026-09-19
Status: Conservative public-API implementation is in the plugin (gated svg/text plans, Figma PNG compare, Image-mode JPEG rollback). It is unpublished. Local Figma corpus sign-off and a bundled pdf.js build remain.

This document is a black-box product study of [pdf.tomake.design](https://pdf.tomake.design) plus an architecture recommendation for PDF Pilot. It does not copy tomake source, use private APIs, or decompile the Figma plugin bundle. Evidence is public documentation, the generated Figma file, the test PDF’s object structure, and PDF Pilot’s current code.

Evidence classes used below:

- **Fact** — observed in the Figma file, the PDF, public docs, or this repo.
- **Strong inference** — multiple independent clues point the same way.
- **Speculation** — plausible, not proven.

---

## Summary recommendation — revised 2026-09-19

Editable should preserve the page first and promote only content that can safely become usable Figma layers. A scan may remain an image; a report may become line-level text; a workbook may combine paths, images, and retained lettering. Do not promise universal editability or recovered authoring structure.

Keep `pdf.js → PageModel → Figma`, but replace the **bag of extracted objects** with an **ordered paint/compositing model and explicit replacement decisions**. Every visible mark must have exactly one owner: native text, graphics, or raster. A full-page image containing glyphs is never the background for visible duplicates of those glyphs.

Use pdf.js as the local parser and rendering reference. Do not make deprecated `SVGGraphics` the general conversion engine. Prefer a tested SVG subset for simple graphics, decoded image layers where compositing is understood, and pdf.js raster output for unsupported compositing. Verify the actual Figma candidate before accepting it.

This supersedes the earlier book-specific MVP plan: “text + images; raster only if both empty,” “always raster plus in-page text,” “SVG for any complex leftovers,” and silent Inter substitution are not valid general strategies. The observations in sections 1–6 remain prior black-box evidence, not proof of tomake’s engine or universal behavior. This revision inspects repository code and upstream sources; it does not claim a new inspection of the private PDFs or Figma output.

Proposal assumptions, pending user preference: preserve appearance when fonts cannot match; permit a small, version-pinned pdf.js integration patch if needed. Public-API-only operation must accept fewer editable pages instead of guessing missing evidence.

---

## 1. How pdf.tomake.design behaves

### Product claims (fact)

Public docs and the Figma Community listing describe three modes:

1. **Editable vector layers** — native Figma paths + editable text + extracted images.
2. **High-fidelity SVG** — page rendered to SVG for appearance.
3. **Rasterized images** — each page as a bitmap.

They also advertise:

- Local-only processing (no PDF upload). HTML import is separately documented as server-rendered; PDF import is not.
- Font auto-mapping to installed Figma fonts; outlined-text and flattened-text options.
- DPI presets 72 / 150 / 300.
- Parallel page processing; documented 5–10s simple pages, 20–30s complex, 2–3× longer at 300 DPI.
- File-size caps in docs (20 MB free / 50 MB Pro). The test PDF is 98 MB and page 11 still imported, so those caps are either unenforced or bypassed for this run.
- Free-plan branding watermark.

### What we actually inspected (fact)

Figma file [`Untitled` / `zmBOVuy20BctcwfHHFsFYM`](https://www.figma.com/design/zmBOVuy20BctcwfHHFsFYM/Untitled?node-id=1-259):

| Frame | What it is |
| --- | --- |
| `1:2` — 128 children named `{filename} / Page N`, each with a `Page image` rectangle | **PDF Pilot Image-mode import**, not tomake. Naming, 80px gap, 20 pages per row, and `clipsContent: false` match `code.ts` exactly. |
| `1:259` — document frame wrapping `Page 11` | **tomake SVG-mode + editable text overlay** of the Living Room page. |
| `PDF to Figma — Branding` | tomake free-plan watermark: “Made with PDF to Figma” / “pdf.tomake.design” / “Upgrade to Pro to remove branding”. |

A dedicated tomake **Vector** import of this page was **not** present in the file. Vector-mode conclusions below are therefore from docs plus what SVG mode did with the same PDF objects.

The test PDF:

- 128 pages, PDF 1.4, uncompressed xref (~7.7k objects).
- Creator: Adobe InDesign 16.3 (Windows) / Adobe PDF Library 15.0 (2021-08-25).
- Page 11 MediaBox `595.276 × 841.89` pt (A4). Figma frame matches to the hundredth of a point.
- Page 11 fonts: subset TrueType `FuturaBT-Book`, `Futura-Bold`, WinAnsi, ToUnicode present.
- Page 11 XObjects: one full-page Form (`Xi10`) and **two RGB images** `1608×1318` and `1608×1322`, both Flate, **both with soft masks**.

---

## 2. Editable-mode layer-tree example (Page 11)

Observed tree, simplified:

```
FRAME  The Essential Guide…          595.28 × 841.89, no clip, no fill
  FRAME  Page 11                     595.28 × 841.89, clips, white fill
    FRAME  SVG Layer                 595.28 × 841.89, clips, white fill
      GROUP
        Clip path group              illustration 1
          clip_0 [VECTOR mask]
          Mask group
            luminance mask → image_2 (JPEG, ~12 KB)
            image_3 (PNG, ~687 KB)
        Clip path group              illustration 2
          clip_4 [VECTOR mask]
          Mask group
            luminance mask → image_6 (JPEG, ~12 KB)
            image_7 (PNG, ~678 KB)
    TEXT  Living Room Design         Inter Bold 14.49, absolute
    TEXT  Feature wall - T.V. unit   Inter Bold 10.87
    TEXT  Feature wall - fireplace   Inter Bold 10.87
    TEXT  {55 line runs of body copy}
    TEXT  5                          folio, Inter Regular 10.31
```

Counts on this page: **81 nodes** (3 frames, 17 groups, 2 vectors, 4 rectangles, 55 text).

### A. Text behavior (fact)

| Question | Result on Page 11 |
| --- | --- |
| Actual `TEXT` nodes? | Yes. 55 `TextNode`s. |
| Granularity | **One node per composed line**, not paragraph, not word. InDesign hyphenation survives (`pho­`, `back­`, `cur­` / `tains`). |
| Font family / weight | **Not preserved.** PDF uses Futura Book/Bold. Figma uses **Inter Regular / Inter Bold**. |
| Unavailable fonts | Silent substitution to Inter. No missing-font callout on canvas. |
| Line height | `{ unit: "AUTO" }`. Not a PDF leading value. |
| Letter spacing | `{ unit: "PERCENT", value: 0 }`. |
| Positioning | Absolute `x/y`. `textAutoResize: WIDTH_AND_HEIGHT`. Constraints `MIN/MIN`. Not auto-layout. |
| Rotation | None on this page (all `rotation: 0`). |
| Color | Near-black solid `rgb(0.137, 0.122, 0.125)`. |
| Dimension labels | **Not extracted.** Labels such as furniture names and millimetre callouts live **inside the illustration bitmaps**. Only body copy, headings, captions next to the drawings, and the folio are text. |
| Searchable / editable | Yes, for extracted runs. Editing a line does not reflow the column. |

Layer names equal the text contents. That is Figma’s default for created text, not recovered InDesign layer names.

### B–C. Vectors and images on this “SVG” page (fact)

Furniture drawings did **not** become hundreds of vectors. They became **two masked image pairs**:

- `image_3` / `image_7`: PNG, ~700 KB each — the drawings.
- `image_2` / `image_6`: JPEG, ~12 KB each — luminance masks.
- Clip path: a rectangle-sized `VECTOR` used as a **VECTOR mask**.
- Inner group: **LUMINANCE mask**.

That maps 1:1 onto the PDF: two image XObjects with `/SMask`, placed and clipped.

The only vectors on the page are those two clip rectangles. Strokes/fills of the illustrations are **not** editable path data.

### D. Layer-structure priority (strong inference)

tomake did **not** recover InDesign’s object hierarchy (groups named “L-shaped sectional”, etc.). It prioritized:

1. Visual placement on an A4 frame.
2. Editability of **real PDF text**.
3. Appearance of **embedded images**, including soft masks.
4. A Figma-manageable node count (81 vs thousands of outline paths).

Original PDF object structure is only weakly reflected (form XObject / images / text), not named groups.

### E. Page structure (fact)

- One Figma frame per PDF page, named `Page 11`.
- Parent named after the PDF filename.
- Page size = PDF MediaBox in points.
- White page background.
- `Page 11` clips content; the parent filename frame does not.
- Absolute children. No auto-layout.
- Side-by-side layout is PDF Pilot’s raster import (20 / row, 80 px gap), not observed for this tomake page.
- Free-plan branding frame placed separately on the canvas.

---

## 3. Vector-mode layer-tree example

**Not present in the shared file.** Docs say vector mode converts shapes to native Figma paths. On *this* page that would not recover the furniture as vectors, because those objects are already raster XObjects in the PDF.

What we *did* observe is Figma’s native SVG importer fingerprint:

- Root name `SVG Layer`
- Nested `Clip path group` / `clip_N` / `Mask group` / `image_N`

That is the same naming `figma.createNodeFromSvg()` produces. Combined with text sitting as **siblings of `SVG Layer`**, not inside it:

**Strong inference:** SVG mode is `PDF → SVG (graphics, including embedded images) → createNodeFromSvg`, then **separately** `PDF text → TextNode` overlaid on top. They are not relying on SVG `<text>` conversion for the editable copy.

---

## 4. What gets rasterized

On Page 11:

| Content | Treatment |
| --- | --- |
| Body copy, headings, captions, folio | Editable text |
| Two living-room illustrations | Extracted images + masks (already bitmaps in the PDF) |
| Soft masks | Figma luminance masks |
| Clip rectangles | Tiny vector masks |
| Furniture names / dimension arrows drawn in the illustration | Stay pixels. No OCR. |
| Whole page | Not flattened |

Other pages in the PDF (spot checks):

- Page 1: small image + many Form XObjects (likely vector/text forms).
- Page 20: large JPEG (`DCTDecode` 2421×1864) plus a Flate image.
- Page 50: nine embedded images.
- Page 100: one 2160×2164 JPEG.

So “handwritten furniture” in this book is typically **placed artwork**, not live paths. Editable import cannot invent vectors that the PDF does not contain.

---

## 5. Apparent fallback strategy

Observed + documented hierarchy, interpreted for PDF Pilot:

1. **Native Figma text** when the PDF has extractable text (even if font-substituted).
2. **Extracted image XObjects** with clip/soft-mask reconstructed as Figma masks.
3. **SVG/clip-path groups** for whatever the SVG converter could not promote to a simpler node (`createNodeFromSvg` artifacts).
4. **Outlined text** (docs only; not in this file) when appearance > editability.
5. **Flattened / full-page raster** as an explicit Image mode, not as the default when one object is hard.

Docs also say very complex paths may be simplified; encrypted PDFs are rejected; annotations/forms/JS/video are dropped or static.

**Fact:** one unsupported illustration did **not** flatten Page 11. **Speculation:** they rasterize *regions* when a graphics operator cannot be expressed in SVG/Figma; we did not catch a mid-page “mystery bitmap” that was not an original XObject.

---

## 6. Likely technical architecture

Public GitHub [`tomakedesign/pdf-tomake-design`](https://github.com/tomakedesign/pdf-tomake-design) is a README stub (created 2026-09-01). It does not reveal the engine.

The marketing site `tomake.design/pdf-to-figma/` loads no WASM, no pdf.worker, no PDF library. Conversion is claimed to run in the **Figma plugin iframe** after install, which we did not unpack.

```
PDF (local File)
        │
        ▼
  in-plugin PDF engine          fact: local, no upload (docs + privacy policy)
        │
        ├─ text runs + fonts     fact: line-level TextNodes, Inter fallback
        ├─ image XObjects        fact: original pixel sizes ~1608px, SMask → luminance
        └─ graphics → SVG        strong inference: createNodeFromSvg fingerprint
        │
        ▼
  Figma nodes in code.ts
        ├─ page frame
        ├─ SVG Layer (graphics)
        ├─ sibling TextNodes
        └─ optional branding
```

Engine identity:

| Hypothesis | Rating | Why |
| --- | --- | --- |
| pdf.js + `getTextContent` + SVG/`createNodeFromSvg` | **Speculation** | The output is compatible with this approach, but line-level text and Figma SVG group names cannot identify the PDF engine. |
| MuPDF.wasm `toSVG` + text | Speculation | Excellent SVG; AGPL unless they bought a commercial license. Possible for a commercial plugin; unproven. |
| PDFium WASM | Speculation | A possible local engine; no engine identification from the observed output. PDFium is BSD-style with additional component notices, not simply Apache-2.0. |
| Server-side conversion | **Contradicted** by their docs/privacy policy and by HTML-vs-PDF product split (HTML *does* use servers). |
| Custom PDF parser from scratch | Speculation | Unlikely given speed claims and standard SVG-import artifacts. |

---

## 7. Root cause in the current implementation

`extractEditablePdfPage()` in `ui.html` renders the reference JPEG and calls `getTextContent()`. `extractPdfText()` promotes each returned item independently. `placeEditableImportPage()` in `code.ts` puts those TextNodes above the full JPEG. This necessarily duplicates text that is already visible in the image.

Specific losses in that route:

- `pdfTextToFigma()` uses the first matrix column as font size and subtracts a full em for the top coordinate. Horizontal scaling and real font ascent invalidate those assumptions.
- `isUsableImportText()` tests rough page bounds, size, and printable characters. Printable `¥`, `÷`, or incorrect Latin strings can pass; valid small text or large headings can fail.
- `TextContent.styles.fontFamily` can be a fallback family; parsing it is not original-font identification. Placement silently tries Inter and paints every line black.
- Text payloads omit source paint identity, advance positions, color, orientation, clip, opacity, rendering mode, and compositing context. Correct reconstruction is impossible after discarding that information.
- The inactive `extractPdfImages()` understands save/restore/transform but not Form boundaries/BBox clips, groups, masks, or repeat-op placement semantics. `imageRectFromCtm()` replaces an affine quadrilateral with an axis-aligned rectangle. Fixing just a scale or offset cannot repair this model.
- The current standalone check copies helpers, so it can pass while production differs; it does not exercise real extraction or Figma rendering.

Rendering works on the reported files; extraction plus reconstruction is the failing subsystem. Retain Image mode as the reference and fallback.

## 8. Model the PDF as a painting program

A PDF is not a list of text boxes and pictures. A content stream executes graphics-state changes and paint operations in order. Form XObjects recursively contain other paint operations, with a matrix, bounding-box clip, resources, and possibly transparency-group semantics. Type3 glyphs execute their own graphics programs. Text may paint, stroke, clip, or remain invisible. Images can carry masks; graphics-state soft masks affect more than images. These distinctions are defined in ISO 32000-1 sections 8.7–8.10, 9.3, 9.6.5, 9.10, and 11. [PDF specification](https://opensource.adobe.com/dc-acrobat-sdk-docs/standards/pdfstandards/pdf/PDF32000_2008.pdf)

Keep one local pipeline:

```text
Local PDF
  ├─ pdf.js reference render → unchanged Image-mode fallback
  └─ pdf.js evaluated operations + font/glyph evidence
       → ordered page display list with graphics state
       → capability checks + replacement plan
       → native text / SVG graphics / images / raster groups
       → temporary Figma candidate
       → export PNG, compare in UI against reference
       → accept candidate OR discard it and place reference image
```

The display list needs, at minimum:

- Page viewport mapping: crop/view box, rotation, user unit, dimensions, and rendering options matching the reference. Use `getViewport({scale: 1})`; do not assume MediaBox or hard-code a Y flip.
- Ordered paint records with per-occurrence identity and glyph ranges. Reusing a Form or image resource creates multiple occurrences, not one placement.
- Full affine transform, active clip, fill/stroke state, opacity, blend mode, and group/mask context. Bounds are conservative paint bounds including strokes and clipping, not merely point extents.
- Resource references for resolved fonts/images, plus text decoding provenance and glyph advances.
- Output ownership: retained graphics, promoted replacement, or rasterized compositing unit. Unknown semantics are explicit, not silently skipped.

Do not serialize pdf.js internals across the plugin bridge. The UI owns extraction and rasterization; `code.ts` receives a validated output plan: ordered nodes/groups, resolved text layout, self-contained SVG, images, fallback bytes, and diagnostic reasons. Preserve session/page IDs through candidate creation, verification, commit, cancellation, and cleanup.

A Form is not automatically a rasterization boundary. A non-isolated transparency group may depend on the backdrop outside it. Rasterization must include the smallest enclosing composition that can be reproduced independently; when independence cannot be established, escalate to the page.

## 9. Classifier: capabilities first, page labels second

Use deterministic rules, not a learned classifier or one scalar confidence score. A page can contain several classes. Labels select candidate strategies; per-object/group checks decide what can actually be promoted.

| Observed content | Candidate result | Required evidence |
| --- | --- | --- |
| Scan / near-full-page bitmap, possibly invisible OCR | Raster-only; image layer if equivalent | Visible image coverage and text visibility; OCR strings do not justify visible text |
| Text-heavy report | Native line text + simple graphics or selective raster | Decoding, available font, geometry, paint ownership and order all pass |
| Mixed InDesign page | Line text + decoded image instances + clips; rasterize hard groups | Form transforms, image alpha, clip and compositing preserved |
| Workbook / outlined lettering / path illustration | Graphics first; promote only independently verified text | Paths are not Unicode; custom lettering is not assumed to be ordinary text |
| Slides / marketing page | Mixed text, SVG subset, images, raster effects | Check gradients, overlaps, text over photos, blends and group effects individually |
| CAD-like drawing | Tested SVG paths, possibly native shapes later; gated labels | Path/stroke fidelity, transforms, clipping and practical node budget |
| Unknown operators, unsupported dependencies, exceeded limits | Rasterize enclosing composition or whole page | No omissions or optimistic partial reconstruction |

Collect these signals while interpreting operations:

- Paint-op types and counts, Form nesting, path segment count, image instances, shading/pattern use, group isolation/knockout, masks, blend modes, clip complexity, optional-content visibility, and text rendering mode.
- Font subtype, embedded/subset status, resolved base name, encoding/CMap source, used-code mapping coverage, glyph widths, vertical writing and available Figma fonts.
- Separate **decoded text** from **visible text eligible for promotion**. Visibility includes clipping, opacity, optional content, render mode, and later occlusion.
- Image/text coverage as the union of transformed, page-clipped paint bounds (or diagnostic masks). Do not sum overlapping bounding boxes or classify from resource dimensions.
- Estimated memory, raster pixels, SVG bytes, path segments, and Figma node count.

A tentative “image coverage >90%” can prioritize scan handling, but is not a correctness rule: a background photo with real editable text can satisfy it too. Presence of `/ToUnicode`, an embedded font, or any extracted text is not an acceptance test. Missing reliable metadata means “unknown,” not “safe.” Thresholds must be calibrated on a cross-file corpus.

## 10. Graphics path

### SVG: useful output format, incomplete PDF backend

Do not feed an arbitrarily filtered operator list to old `SVGGraphics` and assume success. In 3.11 it declares itself unmaintained, warns and continues on unsupported operations, and does not implement graphics-state `SMask`/`BM` handling in `setGState`. SVG masks existing in the output do not establish support for all PDF soft masks. Version 4.0 removed the backend. [3.11 SVG implementation](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/svg.js) · [4.0 release](https://github.com/mozilla/pdf.js/releases/tag/v4.0.189)

Recommended first graphics emitter: a narrow, explicit SVG subset for solid-color paths, supported strokes, affine transforms, and tested clips, with decoded images when supported. Import via `figma.createNodeFromSvg()`. An unsupported paint/state combination rejects its enclosing candidate unit. Legacy `SVGGraphics` is useful as an experiment or source reference, not as the fallback for “complex” content. Do not build both SVG and native vector emitters initially.

`constructPath` supplies geometry, not a complete drawable object. Preserve subsequent fill/stroke operators, fill rule, CTM, clip, line width, dash, caps, joins and paint order. A later native-vector path can reuse those same records for simpler layers. Neither SVG nor native paths recover the original Illustrator/InDesign object hierarchy.

### Images and Forms

For an image occurrence, compose the viewport with the effective CTM, including each Form matrix; account for image-axis orientation and preserve all four corners. Repeated-image operators need their individual instance transforms. Form begin/end must save/restore state and apply the Form BBox clip. pdf.js already expands Forms into evaluated operations; do not expand the same Form again. [Evaluator](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/core/evaluator.js) · [Canvas Form handling](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/canvas.js)

Use decoded RGBA/ImageBitmap data from the renderer where possible. pdf.js can incorporate an image's soft mask into decoded alpha and undo matte preblending; adding that SMask again would be wrong. A separate graphics-state SMask or transparency-group mask is a different dependency. Reuse decoded bytes across instances while keeping distinct transforms/clips. Unsupported blends/masks rasterize together with their required context. Do not guess pixel format from buffer length; grayscale 1-bit buffers are packed. [Image decoding](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/core/image.js)

### Raster graphics with selective text replacement

This is a valid first editable path without a general SVG converter, provided **only the glyph paint being replaced is suppressed**. All rejected text, outlined letters, Type3 content, and difficult drawings continue to render normally.

One text-suppressed background plus top-level TextNodes is allowed only when moving those texts above the remaining content preserves the result. Otherwise preserve ordered graphics/text slices or keep the affected composition rasterized. Transparent slices require alpha-preserving PNG; JPEG is for the final opaque fallback. Slicing is safe only for separable compositing, not arbitrary blends or non-isolated groups.

Do not erase glyph-shaped pixels from a finished JPEG, fill text rectangles white, or crop a full-page composite into “independent objects.” Those operations lose backgrounds and occlusion semantics.

## 11. Text path: promote only after all gates pass

`getTextContent()` is useful for decoded strings, transforms, direction and EOL hints, but it is not an ordered render-object model and provides neither all paint state nor a stable correspondence to rendering operations. Do not zip text items and `showText` operations by array index. [TextContent API](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/api.js)

Recommended adapter: expose paint-occurrence/glyph-range IDs and necessary resolved font metadata at evaluated operation emission, preserving them through optimization/chunking and rendering. Alternatively, conservatively reject ambiguous correlations. This is version-pinned integration work, not an existing public pdf.js API. Avoid a second PDF parser just to inspect `/ToUnicode`.

1. **Semantics and decoding.** Require a visible text-paint occurrence with known glyph-to-Unicode provenance. Check mapping coverage for the codes actually used, unexpected replacement/control characters, suspicious unmapped/private-use content, and disagreement with glyph/font evidence. A subset font is not inherently bad. `/ToUnicode` can be absent yet a standard encoding maps correctly, or present yet incomplete/wrong. Language plausibility is supporting evidence only: `¥` and `÷` are legitimate characters. Do not blacklist symbols or invent corrections. Semantic correctness cannot be proven universally from a broken PDF; uncertain text stays graphics.
2. **Representability.** Initially accept simple filled text in supported compositing contexts. Do not promote Type3, text-as-clip, unsupported stroked/pattern text, invisible OCR, or unsupported vertical/sheared text. Outlined letters are paths and remain paths/raster; “drop” means drop the TextNode candidate, never remove their visual paint.
3. **Fonts.** Obtain real font identity from resolved metadata, preserve the original name, and remove subset prefixes only for lookup. Match Figma's available family/style with `listAvailableFontsAsync()` and `loadFontAsync()`. PDF-embedded font data usable in the iframe does not make that font available to native Figma TextNodes. Match metrics/glyph appearance, not just a family name. Default to graphics if no match; an explicit approximate-text option can offer a named substitute. [Figma font API](https://developers.figma.com/docs/plugins/api/properties/figma-loadfontasync/)
4. **Geometry.** In the simple horizontal-text case, compose viewport × TextItem.transform once. The translation is the baseline origin; `hypot(m[2], m[3])` estimates em height and `atan2(m[1], m[0])` gives orientation. The first column can include horizontal scaling; neither item height nor a full-em subtraction is a universal font-size/top-position solution. Use resolved font metrics and measured target layout; retain the full transform and reject unsupported deformation. pdf.js's text layer similarly distinguishes height and angle. [Text-layer implementation](https://github.com/mozilla/pdf.js/blob/v3.11.174/src/display/text_layer.js)
5. **Compose lines.** Cluster compatible glyph runs by baseline direction/perpendicular distance, font size, writing direction, clip/compositing context and spatial adjacency. Use `hasEOL` as a hint. Split at columns, large gaps, incompatible states and intervening overlapping paint. Preserve ligatures, spaces, discretionary hyphens and script shaping; don't normalize text merely to make widths fit. Retain glyph advances/word spacing to check whether a Figma line can reproduce the PDF. One node per composed line, with style ranges where representable; split only where necessary. Arbitrary positioning may force graphics instead of hundreds of unusable character nodes.
6. **Target verification.** Create the real Figma line with the chosen font, size, color, rotation, tracking and fixed line layout. Check target width, glyph placement and exported appearance. Calibrate baseline placement for the actual target font; PDF ascent is a hint, not Figma's text-box origin. Do not shrink fonts or horizontally distort a line just to pass a box-width test. If it fails, retain original paint.

Native Figma text cannot reproduce every PDF glyph-positioning or shaping program. Line editability also does not imply paragraph/column reflow.

## 12. Prevent double text through explicit ownership

For every paint occurrence, exactly one representation owns its visible contribution. A promotion record identifies the source glyph range, target TextNode, replaced paint and compositing position.

The selective renderer must still execute text positioning and advance logic when glyph paint is suppressed. Removing `showText`, `TJ`, or the entire `BT`–`ET` range can change later positions; text rendering modes can also modify clipping. Do not skip state execution. Initially reject any promotion that participates in clipping or mask generation rather than trying to separate those effects.

A small reviewed local renderer hook should skip only the actual fill/stroke contribution of approved simple text while preserving state and advances. It must cover both fast text painting and glyph-path painting; replacing a single `fillText` call is not sufficient. Unsupported branches reject promotion. IDs must distinguish repeated Form invocations and batched glyphs.

The same ownership rule applies to images and vectors: if a raster group includes them, do not place them again. A candidate textless SVG must retain rejected text as reliable outlines/graphics or raster, not delete all text blindly. Raw SVG `<text>` is not a dependable native-font preservation path.

Hidden OCR does not own visible glyph paint in a scan and must not become a visible overlay. If retained for search in the future, it must be clearly separate from visible editable content.

## 13. Engine decision and constraints

**pdf.js is enough as the parser, decoder and rendering reference for a conservative importer; stock 3.11 APIs are not a complete fidelity-preserving PDF-to-Figma converter.** We need an adapter, explicit supported subsets, and raster fallbacks. Another engine does not remove Figma's font/compositing limitations or create text semantics from outlines/scans.

- Stay in the pdf.js family (Apache-2.0), bundle the engine, matching worker, CMaps and required font assets locally. Pin the chosen integration version and test upgrades. Do not freeze the product permanently on 3.11 just to retain SVGGraphics.
- 3.11 is covered by Mozilla's CVE-2024-4367 advisory. For any interim use, `isEvalSupported: false` is the documented mitigation; move to a maintained patched version for the production foundation. The advisory's first fixed version is not a recommendation to pin that old release today. [Mozilla advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)
- PDFium exposes page-object/path/Form APIs but requires WASM integration and still does not supply a turnkey Figma/SVG conversion. Its license is BSD-style plus additional notices, not simply Apache; under a literal Apache/MIT-only policy it is outside the present constraint. Benchmark it only if the license policy is explicitly broadened and measured pdf.js limitations justify a second engine. [PDFium license](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE) · [Object APIs](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/fpdf_edit.h)
- Do not add MuPDF/AGPL or a conversion server. No new engine is proposed in this plan.

If maintained patches are disallowed, use conservative public-API extraction only for cases where paint identity and separation are proven; leave ambiguous pages raster-only. Public `page.render()` in this version has no supported general “render without this selected text” contract.

## 14. Fallback ladder and what “never worse” means

For each composition, attempt only representations whose capabilities cover it:

1. Native text, decoded image or supported SVG paths.
2. Retain failed text as original glyph graphics; rasterize unsupported self-contained objects/groups.
3. Expand to the enclosing group/region including required clips, masks and backdrop dependencies.
4. Use the full Image-mode page when independence, verification or resource limits fail.

SVG is a representation choice, not an automatic rung above arbitrary raster content. One hard object may flatten a page when effects span that page; it must never flatten unrelated pages in the document.

**Verification transaction:**

- Render and retain the exact Image-mode fallback bytes first, with the same page viewport, background, annotation/optional-content settings and quality budget.
- Build the candidate in a temporary staging location; font or SVG-import failures invalidate affected replacements. Do not show a partially reconstructed page as success.
- Export the actual Figma page as PNG via `exportAsync`, send bytes to the UI and compare aligned reference/candidate renders there. A browser SVG preview alone does not test Figma's importer or native text renderer.
- Check local text/edge regions and worst-error tiles as well as whole-page error; large white margins can hide missing content in a global average. Use a second scale for fine strokes/text. Calibrate tolerances on fixtures; don't invent a universal SSIM cutoff.
- Verify semantic gates independently: matching pixels do not prove correct Unicode. Verify coverage, ownership, page bounds and expected visible content as well.
- On failure, regenerate a conservatively downgraded plan with a bounded retry budget; otherwise discard the candidate and commit the stored Image-mode raster. On cancellation, clean the unfinished candidate and keep completed pages. If reference rendering itself fails, report that page's failure instead of claiming fidelity.

No finite pixel test proves perceptual equivalence for every PDF at every zoom. Literal identical appearance requires keeping the reference raster visible. The honest editable contract is **validated visual tolerance with explicit fallback**, plus a preserved Image-mode result to restore. User-requested approximate fonts are a separately disclosed tradeoff, outside an exact-appearance guarantee.

## 15. Implementation order and acceptance evidence

Plugin status, 2026-09-19: items 1–3 are in unpublished plugin code on public pdf.js 3.11 APIs (`isEvalSupported: false`, no local bundle, no renderer patch). Item 4 and Figma corpus sign-off remain. `pnpm check:editable-import` covers planner math, not Figma export.

1. **Correctness foundation:** remove unconditional visible text overlays; use raster-only unless replacement is proven. Bundle a maintained pdf.js build and retain reference output. Establish viewport/state handling, source paint identity, diagnostics, bounded page processing, and a real Figma candidate/compare/commit transaction.
2. **First useful editable slice:** ordinary filled text with reliable decoding and available fonts, composed into lines; renderer suppression preserves advances; reject clipping/masked/interleaved cases not yet supported. Graphics remain selectively rendered raster. Demonstrate no double glyphs and no missing rejected text.
3. **Graphics promotion:** decoded alpha-bearing images through nested Forms, then a tested solid-path SVG subset. Preserve order and clips. Native vector conveniences come only after this model works; do not implement a second emitter in parallel.
4. **Measured expansion:** more clips, gradients, groups, rotated/script-specific text and performance optimizations, driven by failing corpus examples. Unsupported content continues to import via reference raster.

Keep one runnable end-to-end regression command using the actual adapter/planner (not copied helpers), with small licensed synthetic PDFs and saved expected outcomes. The corpus must exercise:

- Standard text; subset font with good, missing, incomplete and deliberately wrong mappings; legitimate currency/math symbols; unavailable fonts.
- Horizontal scaling, rotation, crop offsets, page rotation/UserUnit, columns, ligatures, RTL/CJK and vertical text (preserve as graphics where unsupported).
- Nested/reused Forms, clipped/rotated images, image SMask versus graphics-state SMask, packed 1-bit images, repeated image operators.
- Paths/outlined lettering, Type3, text clipping, patterns, gradients, isolation/knockout/blends, content before and after text, and hidden OCR over scans.
- Failures during Figma font/SVG creation, cancellation, size limits, and fallback consistency.

Retain the two user PDFs locally without committing them. The workbook must preserve lettering and drawings without junk TextNodes; the InDesign page must preserve the illustration placement/alpha and create useful line text only where font/layout gates pass. A pure scan must yield no visible duplicate OCR text. A CAD page must never lose unsupported strokes silently.

Report per-page outcomes in plain language: editable lines, separate images/vector groups, areas retained as graphics, and fallback reasons such as “font unavailable” or “complex transparency.” This work is complete only after real Figma exports, not merely a successful TypeScript build or plausible model coordinates.
