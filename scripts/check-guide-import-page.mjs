// Browser harness: Essential Guide pages 5 and 11 through hooked pdf.js.
// Extraction, colour, occurrence ownership, and same-canvas suppression only.
// This is not a Figma export or plugin verification.
import {
  gateTextGeometry,
  matchOccurrencesToFragments,
  matchRunsToOccurrences,
  normalizePdfRgb,
  parsePdfFontName,
  pdfFontDescriptor,
  pdfTextLayout,
  resolvePdfFont,
  rgbCss,
  verifyImportCandidate,
} from '/scripts/editable-import-core.mjs';

const PAGES = [5, 11];
const SCALE = 2;
const FIGMA_FONTS = [
  { family: 'Futura', style: 'Regular' },
  { family: 'Futura', style: 'Bold' },
  { family: 'Futura', style: 'Medium' },
  { family: 'Arial', style: 'Regular' },
  { family: 'Arial', style: 'Bold' },
];

function hook() {
  const h = window.pdfjsLib && (window.pdfjsLib.PDFPilot || globalThis.__PDF_PILOT_RENDERER__);
  if (!h || h.revision !== '2') throw new Error('renderer hook unavailable');
  return h;
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
  return { canvas, ctx, viewport, occurrences: h.occurrences.slice(), hookHits: h.hookHits };
}

function isDecoded(str) {
  if (!str || !String(str).trim()) return false;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10) || (code >= 0xE000 && code <= 0xF8FF)) return false;
  }
  return true;
}

function drawCandidate(suppressed, runs, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = suppressed.canvas.width;
  canvas.height = suppressed.canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(suppressed.canvas, 0, 0);
  runs.forEach((run) => {
    const color = run.color || { r: 0, g: 0, b: 0 };
    ctx.fillStyle = rgbCss(color.r, color.g, color.b);
    ctx.font = `${Math.max(8, run.fontSize * scale)}px "${run.fontFamily || 'sans-serif'}"`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(run.characters, run.x * scale, (run.baseline || (run.y + run.fontSize * 0.8)) * scale);
  });
  return canvas;
}

async function extractPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const full = await render(page, SCALE, { collect: true });
  if (full.hookHits < 1) throw new Error('hook did not execute on page ' + pageNumber);
  const content = await page.getTextContent();
  const styles = content.styles || {};
  const fragments = (content.items || []).filter((item) => item && String(item.str || '').trim()).map((item) => {
    const layout = pdfTextLayout(item, viewport, styles[item.fontName] || {});
    return {
      characters: item.str,
      str: item.str,
      layout,
      parsed: parsePdfFontName(item.fontName || ''),
      reliable: isDecoded(item.str) && gateTextGeometry(layout, viewport),
    };
  });
  const suppressible = full.occurrences.filter((occ) => occ.suppressible && occ.unicode);
  const exact = matchRunsToOccurrences(
    fragments.filter((frag) => frag.reliable).map((frag) => ({
      characters: frag.characters,
      x: frag.layout.x,
      y: frag.layout.y,
      baseline: frag.layout.baseline,
      fontSize: frag.layout.fontSize,
      width: frag.layout.width,
    })),
    suppressible,
    SCALE,
  );
  const owned = matchOccurrencesToFragments(suppressible, fragments, SCALE);
  const runs = [];
  const fonts = [];
  owned.forEach((match) => {
    const occ = match.occ;
    const first = match.fragments[0];
    const parsed = parsePdfFontName(occ.fontName || first.parsed.raw || '');
    const resolved = resolvePdfFont(pdfFontDescriptor(parsed, occ.unicode), FIGMA_FONTS, {
      run: { characters: occ.unicode, fontSize: first.layout.fontSize },
    });
    const font = resolved.family ? { family: resolved.family, style: resolved.style } : null;
    if (!font) return;
    if (parsed.style === 'Book' && font.style === 'Bold') {
      throw new Error('page ' + pageNumber + ' Book resolved to Bold');
    }
    const fill = occ.fill || { r: 0, g: 0, b: 0 };
    const color = normalizePdfRgb(fill.r, fill.g, fill.b);
    const x = Math.min.apply(null, match.fragments.map((frag) => frag.layout.x));
    const y = Math.min.apply(null, match.fragments.map((frag) => frag.layout.y));
    const right = Math.max.apply(null, match.fragments.map((frag) => frag.layout.x + frag.layout.width));
    const label = font.family + ' ' + font.style;
    if (fonts.indexOf(label) < 0) fonts.push(label);
    runs.push({
      characters: occ.unicode,
      x,
      y,
      baseline: first.layout.baseline,
      width: Math.max(1, right - x),
      fontSize: first.layout.fontSize,
      fontFamily: font.family,
      fontStyle: font.style,
      color,
      occurrenceId: occ.id,
    });
  });
  const ids = new Set(runs.map((run) => run.occurrenceId));
  const suppressed = await render(page, SCALE, { suppressIds: ids });
  const restored = drawCandidate(suppressed, runs, SCALE);
  const blank = suppressed.canvas;
  const fullData = full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
  const suppressedData = suppressed.ctx.getImageData(0, 0, suppressed.canvas.width, suppressed.canvas.height).data;
  const restoredData = restored.getContext('2d').getImageData(0, 0, restored.width, restored.height).data;
  const blankData = blank.getContext('2d').getImageData(0, 0, blank.width, blank.height).data;
  const actualBounds = runs.map((run) => ({
    x: run.x,
    y: run.y,
    width: run.width,
    height: run.fontSize * 1.4,
    occurrenceId: run.occurrenceId,
  }));
  // Same browser canvas as suppression — not a Figma PNG export.
  const restoredVerify = verifyImportCandidate({
    full: fullData,
    suppressed: suppressedData,
    pdfWidth: full.canvas.width,
    pdfHeight: full.canvas.height,
    background: suppressedData,
    candidate: restoredData,
    figWidth: restored.width,
    figHeight: restored.height,
    runs,
    actualBounds,
    scale: SCALE,
    figmaScale: SCALE,
  });
  const blankVerify = verifyImportCandidate({
    full: fullData,
    suppressed: suppressedData,
    pdfWidth: full.canvas.width,
    pdfHeight: full.canvas.height,
    background: suppressedData,
    candidate: blankData,
    figWidth: blank.width,
    figHeight: blank.height,
    runs,
    actualBounds,
    scale: SCALE,
    figmaScale: SCALE,
  });
  const fills = suppressible.map((occ) => occ.fill).filter(Boolean);
  const dark = fills.find((fill) => fill.r < 0.5 && fill.g < 0.5 && fill.b < 0.5);
  const byteFill = fills.find((fill) => fill.r > 1 || fill.g > 1 || fill.b > 1);
  const whitePromoted = runs.some((run) => run.color.r >= 0.99 && run.color.g >= 0.99 && run.color.b >= 0.99);
  return {
    pageNumber,
    items: fragments.length,
    occurrences: full.occurrences.length,
    suppressible: suppressible.length,
    exact: exact.length,
    owned: owned.length,
    promoted: runs.length,
    fonts,
    darkFill: dark || null,
    byteFill: !!byteFill,
    whitePromoted,
    blankPass: blankVerify.pass,
    blankReason: blankVerify.reason,
    restoredPass: restoredVerify.pass,
    restoredReason: restoredVerify.reason,
    mean: restoredVerify.mean,
    worstGraphics: restoredVerify.worstGraphics,
    worstText: restoredVerify.worstText,
    sample: runs.slice(0, 6).map((run) => ({
      characters: String(run.characters).slice(0, 40),
      font: run.fontFamily + ' ' + run.fontStyle,
      color: run.color,
    })),
  };
}

async function main() {
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ url: '/corpus.pdf', verbosity: 0 }).promise;
  const pages = [];
  for (const pageNumber of PAGES) pages.push(await extractPage(pdf, pageNumber));
  const page5 = pages.find((page) => page.pageNumber === 5);
  const page11 = pages.find((page) => page.pageNumber === 11);
  const errors = [];
  if (!page5) errors.push('missing page 5');
  if (page5 && page5.byteFill) errors.push('page 5 stored byte-range RGB');
  if (page5 && page5.whitePromoted) errors.push('page 5 promoted white text');
  if (page5 && page5.darkFill && (page5.darkFill.r >= 1 || page5.darkFill.g >= 1 || page5.darkFill.b >= 1)) {
    errors.push('page 5 fill clamped to white');
  }
  if (page5 && page5.blankPass) errors.push('page 5 blank candidate passed verification');
  if (page5 && page5.promoted > 0 && page5.fonts.some((font) => /Book/.test(font) && /Bold/.test(font))) {
    errors.push('page 5 Book became Bold');
  }
  if (page11 && page11.owned <= page11.exact) {
    errors.push('page 11 occurrence concat did not beat exact Unicode matching');
  }
  await fetch('/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: errors.length === 0, errors, pages }),
  });
}

main().catch(async (error) => {
  await fetch('/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, errors: [String(error && error.message || error)], pages: [] }),
  });
});
