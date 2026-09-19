// Browser harness for tracing the bundled plugin import stages.
import {
  chooseEditableMode,
  coveredTextRunIndices,
  gateTextGeometry,
  imagePlacementFromCtm,
  clipInsidePage,
  isReliableTextExtract,
  laterPaintOccludesRun,
  matchAvailableFont,
  matchRunsToOccurrences,
  parsePdfFontIdentity,
  parsePdfFontName,
  pathDFromConstruct,
  pdfMultiply,
  pdfApply,
  pdfTextLayout,
  promotedRunRemoved,
  textRunPaintBox,
} from '/scripts/editable-import-core.mjs';

const PAGES = [6, 10];
const TITLES = { 6: 'WORKSHEET 2', 10: 'TEXTURES' };
const PDF_MATRIX_IDENTITY = [1, 0, 0, 1, 0, 0];
const SCALE = 2;
const FIGMA_FONTS_ABSENT = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Arial', style: 'Regular' },
  { family: 'Arial', style: 'Bold' },
];
const FIGMA_FONTS_PRESENT = FIGMA_FONTS_ABSENT.concat([
  { family: 'DIN Condensed', style: 'Regular' },
  { family: 'DIN Condensed', style: 'Bold' },
]);

function hook() {
  const h = window.pdfjsLib && (window.pdfjsLib.PDFPilot || globalThis.__PDF_PILOT_RENDERER__);
  if (!h || h.revision !== '2') throw new Error('renderer hook unavailable');
  return h;
}

function rgbCss(r, g, b) {
  const hex = (n) => Math.max(0, Math.min(255, Math.round(Number(n) * 255))).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b);
}

function occurrenceSeq(id) {
  const m = String(id || '').match(/#(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function analyzePdfPaint(ops, viewport, OPS) {
  let ctm = PDF_MATRIX_IDENTITY.slice();
  const stack = [];
  let fill = { r: 0, g: 0, b: 0 };
  let stroke = { r: 0, g: 0, b: 0 };
  let lineWidth = 1;
  let currentPath = null;
  let pathSegs = 0;
  let simplePathCount = 0;
  let imageCount = 0;
  let textOpCount = 0;
  let complex = false;
  let clipUsed = false;
  let complexPath = false;
  let textRenderModeNonFill = false;
  let dash = false;
  let lastPathMinMax = null;
  let missingMinMax = 0;
  let pageWideCovers = 0;
  const laterRects = [];
  const draws = [];
  const textOpColors = [];
  const covers = [];
  const textOps = {};
  textOps[OPS.showText] = true;
  textOps[OPS.showSpacedText] = true;
  textOps[OPS.nextLineShowText] = true;
  textOps[OPS.nextLineSetSpacingShowText] = true;
  if (OPS.showType3Text) textOps[OPS.showType3Text] = true;
  const imageOps = {};
  imageOps[OPS.paintImageXObject] = true;
  imageOps[OPS.paintInlineImageXObject] = true;
  const complexOps = {};
  [
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintImageMaskXObjectRepeat,
    OPS.paintInlineImageXObjectGroup,
    OPS.paintSolidColorImageMask,
    OPS.shadingFill,
    OPS.beginGroup,
    OPS.setFillColorN,
    OPS.setStrokeColorN,
  ].forEach((id) => { if (id) complexOps[id] = true; });

  function snapshot() {
    return { ctm: ctm.slice(), fill, stroke, lineWidth };
  }
  function restore(prev) {
    if (!prev) {
      ctm = PDF_MATRIX_IDENTITY.slice();
      return;
    }
    ctm = prev.ctm;
    fill = prev.fill;
    stroke = prev.stroke;
    lineWidth = prev.lineWidth;
  }
  function pageRectFromUserBox(minMax) {
    if (!minMax || minMax.length < 4) {
      return { x: 0, y: 0, w: viewport.width, h: viewport.height, pageWide: true };
    }
    const matrix = pdfMultiply(viewport.transform, ctm);
    const corners = [
      pdfApply(matrix, minMax[0], minMax[1]),
      pdfApply(matrix, minMax[2], minMax[1]),
      pdfApply(matrix, minMax[0], minMax[3]),
      pdfApply(matrix, minMax[2], minMax[3]),
    ];
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min.apply(null, xs);
    const y = Math.min.apply(null, ys);
    return { x, y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y, pageWide: false };
  }
  function markCover(rect, kind) {
    if (!rect || textOpCount === 0) return;
    laterRects.push({
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      afterSeq: textOpCount,
      kind: kind || 'path-fill',
    });
    covers.push({
      kind: kind || 'path-fill',
      afterSeq: textOpCount,
      pageWide: !!rect.pageWide,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
    });
  }

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] || [];
    if (fn === OPS.save) {
      stack.push(snapshot());
    } else if (fn === OPS.restore) {
      restore(stack.pop());
    } else if (fn === OPS.transform) {
      ctm = pdfMultiply(ctm, args);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(snapshot());
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = pdfMultiply(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      restore(stack.pop());
    } else if (fn === OPS.setFillRGBColor) {
      fill = { r: args[0], g: args[1], b: args[2] };
    } else if (fn === OPS.setStrokeRGBColor) {
      stroke = { r: args[0], g: args[1], b: args[2] };
    } else if (fn === OPS.setFillGray) {
      fill = { r: args[0], g: args[0], b: args[0] };
    } else if (fn === OPS.setStrokeGray) {
      stroke = { r: args[0], g: args[0], b: args[0] };
    } else if (fn === OPS.setFillCMYKColor) {
      fill = {
        r: 1 - Math.min(1, args[0] * (1 - args[3]) + args[3]),
        g: 1 - Math.min(1, args[1] * (1 - args[3]) + args[3]),
        b: 1 - Math.min(1, args[2] * (1 - args[3]) + args[3]),
      };
    } else if (fn === OPS.setStrokeCMYKColor) {
      stroke = {
        r: 1 - Math.min(1, args[0] * (1 - args[3]) + args[3]),
        g: 1 - Math.min(1, args[1] * (1 - args[3]) + args[3]),
        b: 1 - Math.min(1, args[2] * (1 - args[3]) + args[3]),
      };
    } else if (fn === OPS.setLineWidth) {
      lineWidth = args[0];
    } else if (fn === OPS.setDash && args[0] && args[0].length) {
      dash = true;
      complex = true;
    } else if (fn === OPS.setGState) {
      const states = Array.isArray(args[0]) && Array.isArray(args[0][0]) ? args[0] : args;
      for (let s = 0; s < states.length; s++) {
        const key = states[s] && states[s][0];
        const value = states[s] && states[s][1];
        if (key === 'SMask' && value) complex = true;
        if (key === 'BM' && value && value !== 'Normal' && value !== 'normal') complex = true;
        if ((key === 'CA' || key === 'ca') && typeof value === 'number' && value < 0.999) complex = true;
      }
    } else if (fn === OPS.setTextRenderingMode && args[0] >= 4) {
      textRenderModeNonFill = true;
    } else if (fn === OPS.constructPath) {
      const pathOps = args[0] || [];
      const coords = args[1] || [];
      lastPathMinMax = args[2] || null;
      if (!args[2]) missingMinMax += 1;
      pathSegs += pathOps.length;
      currentPath = args[2] || coords.length > 4
        ? pathDFromConstruct(pathOps, coords, pdfMultiply(viewport.transform, ctm))
        : null;
      if (!currentPath) complexPath = true;
    } else if (fn === OPS.clip || fn === OPS.eoClip) {
      clipUsed = true;
      currentPath = null;
    } else if (fn === OPS.endPath) {
      currentPath = null;
    } else if (
      fn === OPS.fill || fn === OPS.eoFill || fn === OPS.stroke || fn === OPS.closeStroke
      || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke
    ) {
      const doStroke = fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fillStroke
        || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      const kind = doStroke && fn !== OPS.fill && fn !== OPS.eoFill && fn !== OPS.fillStroke
        && fn !== OPS.eoFillStroke && fn !== OPS.closeFillStroke && fn !== OPS.closeEOFillStroke
        ? 'path-stroke' : 'path-fill';
      if (lastPathMinMax) markCover(pageRectFromUserBox(lastPathMinMax), kind);
      if (currentPath) simplePathCount += 1;
      else complexPath = true;
      currentPath = null;
    } else if (imageOps[fn]) {
      const placement = imagePlacementFromCtm(ctm, viewport);
      markCover({ x: placement.x, y: placement.y, w: placement.w, h: placement.h }, 'image');
      placement.insideRatio = clipInsidePage(placement, viewport);
      if (placement.width >= 1 && placement.height >= 1 && placement.insideRatio >= 0.15 && !placement.sheared) {
        imageCount += 1;
      }
    } else if (complexOps[fn]) {
      complex = true;
      if (fn === OPS.shadingFill && lastPathMinMax) {
        markCover(pageRectFromUserBox(lastPathMinMax), 'shading');
      }
    } else if (textOps[fn]) {
      textOpCount += 1;
      textOpColors.push(fill);
    }
  }

  return {
    complex,
    clipUsed,
    complexPath,
    simplePathCount,
    pathSegs,
    imageCount,
    textOpCount,
    textRenderModeNonFill,
    draws,
    textOpColors,
    laterRects,
    missingMinMax,
    pageWideCovers,
    covers,
  };
}

async function render(page, scale, opts) {
  const h = hook();
  h.reset();
  h.collect = !!(opts && opts.collect);
  h.suppressIds = opts && opts.suppressIds ? new Set(opts.suppressIds) : null;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
  return {
    canvas,
    ctx,
    viewport,
    hookHits: h.hookHits,
    revision: h.revision,
    version: h.version,
    build: h.build,
    occurrences: h.occurrences.slice(),
  };
}

function fontMetaFromPdfjs(font) {
  if (!font || typeof font !== 'object') return null;
  const inner = font.font && typeof font.font === 'object' ? font.font : font;
  return {
    isType3Font: !!(inner.isType3Font || inner.type === 'Type3'),
    isInvalidPDFjsFont: !!inner.isInvalidPDFjsFont,
    composite: inner.composite === true || /Type0|CID/i.test(String(inner.type || '')),
    encoding: inner.cidEncoding || (typeof inner.encoding === 'string' ? inner.encoding : '') || '',
    type: inner.type || '',
    name: inner.name || '',
    loadedName: inner.loadedName || font.loadedName || '',
    dataBytes: inner.data ? inner.data.length : (font.data ? font.data.length : 0),
    mimetype: inner.mimetype || font.mimetype || '',
  };
}

function waitForPdfObj(store, name, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value || null);
    };
    try {
      const value = store.get(name, finish);
      if (value) finish(value);
    } catch (_error) {
      finish(null);
      return;
    }
    setTimeout(() => finish(null), timeoutMs);
  });
}

function stageFail(title, stages) {
  const order = ['geometry', 'fontPresent', 'coverCurrent', 'occurrence', 'suppression', 'mode'];
  for (const key of order) {
    if (stages[key] && stages[key].fail) return { title, stage: key, detail: stages[key] };
  }
  return { title, stage: 'none', detail: { fontAbsent: stages.fontAbsent } };
}

async function tracePage(pdf, pdfjs, pageNumber) {
  const want = TITLES[pageNumber];
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const full = await render(page, SCALE, { collect: true });
  const ops = await page.getOperatorList();
  const paint = analyzePdfPaint(ops, viewport, pdfjs.OPS);
  const content = await page.getTextContent();
  const styles = content.styles || {};
  const items = (content.items || []).filter((item) => item && String(item.str || '').trim());
  const rows = [];
  for (const item of items) {
    const style = styles[item.fontName] || {};
    const pdfjsFont = await waitForPdfObj(page.commonObjs, item.fontName, 2000);
    const meta = fontMetaFromPdfjs(pdfjsFont);
    const parsed = parsePdfFontIdentity((meta && meta.name) || style.fontFamily || item.fontName, pdfjsFont && (pdfjsFont.data || (pdfjsFont.font && pdfjsFont.font.data)));
    const layout = pdfTextLayout(item, viewport, style);
    rows.push({ item, parsed, meta, pdfjsFont, fontName: item.fontName, style, layout });
  }
  for (const row of rows) {
    row.reliable = isReliableTextExtract(row.item.str, row.meta);
    row.geometry = gateTextGeometry(row.layout, viewport);
    row.fontAbsent = matchAvailableFont(row.parsed.family, row.parsed.style, FIGMA_FONTS_ABSENT);
    row.fontPresent = matchAvailableFont(row.parsed.family, row.parsed.style, FIGMA_FONTS_PRESENT);
  }

  const titleRows = rows.filter((row) => String(row.item.str).replace(/\s+/g, ' ').trim() === want
    || String(row.item.str).includes(want));
  const title = titleRows[0] || rows.find((row) => String(row.item.str).toUpperCase().includes(want.split(' ')[0]));

  const candidatePresent = rows.filter((row) => row.reliable && row.geometry && row.fontPresent).map((row) => ({
    characters: row.item.str,
    x: row.layout.x,
    y: row.layout.y,
    baseline: row.layout.baseline,
    width: row.layout.width,
    fontSize: row.layout.fontSize,
    fontFamily: row.fontPresent.family,
    fontStyle: row.fontPresent.style,
  }));
  const candidateAbsent = rows.filter((row) => row.reliable && row.geometry && row.fontAbsent).map((row) => ({
    characters: row.item.str,
    x: row.layout.x,
    y: row.layout.y,
    baseline: row.layout.baseline,
    width: row.layout.width,
    fontSize: row.layout.fontSize,
    fontFamily: row.fontAbsent.family,
    fontStyle: row.fontAbsent.style,
  }));

  const matchedPresent = matchRunsToOccurrences(candidatePresent, full.occurrences, SCALE);
  const titleMatch = matchedPresent.find((item) => String(item.run.characters).replace(/\s+/g, ' ').trim() === want)
    || matchedPresent.find((item) => String(item.run.characters).includes(want));
  const occ = titleMatch ? full.occurrences.find((o) => o.id === titleMatch.id) : null;

  const coverCurrent = titleMatch
    ? coveredTextRunIndices(
      [Object.assign(textRunPaintBox(titleMatch.run), { seq: occurrenceSeq(titleMatch.id) })],
      paint.laterRects
    )
    : [];
  const overlappingCovers = titleMatch
    ? paint.covers.filter((cover) => laterPaintOccludesRun(textRunPaintBox(titleMatch.run), cover))
    : [];

  let suppression = { fail: true, reason: 'no matched occurrence' };
  if (titleMatch) {
    const suppressed = await render(page, SCALE, { suppressIds: [titleMatch.id] });
    const fullData = full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
    const supData = suppressed.ctx.getImageData(0, 0, suppressed.canvas.width, suppressed.canvas.height).data;
    const removed = promotedRunRemoved(fullData, supData, full.canvas.width, full.canvas.height, titleMatch.run, SCALE);
    suppression = { fail: !removed, removed, id: titleMatch.id, renderMode: occ && occ.renderMode, suppressible: occ && occ.suppressible, pathPaint: occ && occ.pathPaint };
    await fetch('/png?name=' + encodeURIComponent('trace-p' + pageNumber + '-full.png'), { method: 'POST', body: await new Promise((resolve) => full.canvas.toBlob(resolve, 'image/png')) });
    await fetch('/png?name=' + encodeURIComponent('trace-p' + pageNumber + '-title-suppressed.png'), { method: 'POST', body: await new Promise((resolve) => suppressed.canvas.toBlob(resolve, 'image/png')) });
  }

  const coveredIdx = coveredTextRunIndices(
    matchedPresent.map((item) => Object.assign(textRunPaintBox(item.run), { seq: occurrenceSeq(item.id) })),
    paint.laterRects
  );
  const afterCover = matchedPresent.filter((_, i) => coveredIdx.indexOf(i) < 0).map((item) => item.run);
  const titleCovered = coverCurrent.length > 0;
  const titleAfterCover = titleMatch && !titleCovered ? titleMatch : null;

  const signalsPresent = {
    gatedCount: titleAfterCover && suppression.removed ? 1 : 0,
    unpromotedVisibleCount: rows.length - 1,
    suppressionOk: !!(titleAfterCover && suppression.removed),
    complex: paint.complex,
    clipUsed: paint.clipUsed,
    complexPath: paint.complexPath,
    simplePathCount: paint.simplePathCount,
    pathSegs: paint.pathSegs,
    imageCount: paint.imageCount,
    textRenderModeNonFill: paint.textRenderModeNonFill,
    fontTextUnpromoted: paint.textOpCount > 0 && !(titleAfterCover && suppression.removed),
  };
  const mode = chooseEditableMode(signalsPresent);

  const stages = {
    geometry: { fail: !(title && title.geometry), layout: title && { x: title.layout.x, y: title.layout.y, fontSize: title.layout.fontSize, angle: title.layout.angle } },
    fontAbsent: { fail: !(title && title.fontAbsent), parsed: title && title.parsed, matched: title && title.fontAbsent, embedded: title && title.meta },
    fontPresent: { fail: !(title && title.fontPresent), matched: title && title.fontPresent },
    coverCurrent: {
      fail: titleCovered,
      titleCovered,
      laterRects: paint.laterRects.length,
      pageWideCovers: paint.pageWideCovers,
      missingMinMax: paint.missingMinMax,
      overlappingCovers: overlappingCovers.slice(0, 8),
      overlappingCount: overlappingCovers.length,
    },
    occurrence: { fail: !titleMatch, id: titleMatch && titleMatch.id, seq: titleMatch && occurrenceSeq(titleMatch.id), dist: titleMatch && titleMatch.dist, occ },
    suppression,
    mode: { fail: mode.mode === 'raster', mode },
  };

  return {
    pageNumber,
    want,
    viewport: { w: viewport.width, h: viewport.height },
    identity: { revision: full.revision, version: full.version, build: full.build, hookHits: full.hookHits },
    extract: {
      items: items.length,
      decoded: rows.filter((r) => r.reliable).length,
      titleChars: title && title.item.str,
      titleFont: title && title.parsed,
      titleEmbedded: title && title.meta,
    },
    paint: {
      textOpCount: paint.textOpCount,
      pathSegs: paint.pathSegs,
      simplePathCount: paint.simplePathCount,
      imageCount: paint.imageCount,
      complex: paint.complex,
      clipUsed: paint.clipUsed,
      complexPath: paint.complexPath,
      laterRects: paint.laterRects.length,
      pageWideCovers: paint.pageWideCovers,
      missingMinMax: paint.missingMinMax,
    },
    candidates: { present: candidatePresent.length, absent: candidateAbsent.length, afterCover: afterCover.length, coveredIdx: coveredIdx.length },
    stages,
    firstFail: stageFail(want, stages),
  };
}

async function main() {
  try {
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    const identity = {
      revision: hook().revision,
      version: hook().version,
      build: hook().build,
    };
    const pdf = await pdfjs.getDocument({
      url: '/corpus.pdf',
      isEvalSupported: false,
      fontExtraProperties: true,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
    }).promise;
    const pages = [];
    for (const n of PAGES) pages.push(await tracePage(pdf, pdfjs, n));
    let lucknow = null;
    try {
      const other = await pdfjs.getDocument({
        url: '/lucknow.pdf',
        isEvalSupported: false,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
      }).promise;
      const sizes = [];
      for (let n = 1; n <= Math.min(3, other.numPages); n++) {
        const page = await other.getPage(n);
        const v1 = page.getViewport({ scale: 1 });
        const v4 = page.getViewport({ scale: 4 });
        sizes.push({
          page: n,
          w: v1.width,
          h: v1.height,
          highW: Math.ceil(v4.width),
          highH: Math.ceil(v4.height),
          over4096: v4.width > 4096 || v4.height > 4096,
        });
      }
      lucknow = { numPages: other.numPages, sizes };
    } catch (error) {
      lucknow = { error: String(error && error.message || error) };
    }
    await fetch('/result', {
      method: 'POST',
      body: JSON.stringify({ ok: true, identity, numPages: pdf.numPages, pages, lucknow }),
    });
  } catch (error) {
    await fetch('/result', {
      method: 'POST',
      body: JSON.stringify({ ok: false, error: String(error && error.stack || error) }),
    });
  }
}

main();
