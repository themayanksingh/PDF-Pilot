#!/usr/bin/env node
// Prove the patched pdf.js hook executes and can hide one ordinary showText
// occurrence on the local sketches corpus. Captures stay in /tmp (not git).
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfPath = process.env.PDF_PILOT_PROOF_PDF
  || '/Users/mayanksingh/Downloads/pdfcoffee.com_07sketches-volume-3pdf-pdf-free.pdf';
const outDir = process.env.PDF_PILOT_PROOF_DIR || '/tmp/pdf-pilot-hook-proof';
const pages = (process.env.PDF_PILOT_PROOF_PAGES || '3,4,6,10').split(',').map((n) => Number(n.trim())).filter(Boolean);

if (!existsSync(pdfPath)) throw new Error('missing corpus PDF: ' + pdfPath);
mkdirSync(outDir, { recursive: true });

const harness = `<!doctype html>
<meta charset="utf-8">
<title>pdf-pilot hook proof</title>
<script src="/vendor/pdfjs/pdf.js"></script>
<script type="module">
import { composeTextLines, matchRunsToOccurrences, pdfTextLayout, promotedRunRemoved, rectMeanAbsDiff, textRunPaintBox } from "/scripts/editable-import-core.mjs";

const SCALE = 1.5;
const PAGES = ${JSON.stringify(pages)};

function hook() {
  const h = window.pdfjsLib && (window.pdfjsLib.PDFPilot || globalThis.__PDF_PILOT_RENDERER__);
  if (!h || h.revision !== "2") throw new Error("renderer hook unavailable");
  return h;
}

function isDecoded(str) {
  if (!str || !String(str).trim()) return false;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10) || (code >= 0xE000 && code <= 0xF8FF)) return false;
  }
  return true;
}

async function render(page, scale, opts) {
  const h = hook();
  h.reset();
  h.collect = !!(opts && opts.collect);
  h.suppressIds = opts && opts.suppressIds ? new Set(opts.suppressIds) : null;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, intent: "display" }).promise;
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

function pngDataUrl(canvas) {
  return canvas.toDataURL("image/png");
}

async function uploadPng(name, canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await fetch("/png?name=" + encodeURIComponent(name), { method: "POST", body: blob });
}

function occById(occurrences, id) {
  return occurrences.find((occ) => occ.id === id);
}

function pickLine(occurrences, matched, wantPath) {
  const hit = matched.find((item) => {
    if (!item.run || String(item.run.characters).trim().length < 4) return false;
    const occ = occById(occurrences, item.id);
    return occ && occ.suppressible && !!occ.pathPaint === wantPath;
  });
  if (hit) return { id: hit.id, unicode: hit.run.characters, via: wantPath ? "path" : "fill", dist: hit.dist, pathPaint: wantPath };
  return null;
}

function measureTarget(full, suppressed, matched, occurrences, target) {
  if (!target) return null;
  const fullData = full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
  const supData = suppressed.ctx.getImageData(0, 0, suppressed.canvas.width, suppressed.canvas.height).data;
  const occ = occById(occurrences, target.id);
  const run = (matched.find((item) => item.id === target.id) || {}).run;
  const removed = !!(run && promotedRunRemoved(fullData, supData, full.canvas.width, full.canvas.height, run, SCALE));
  const box = run ? textRunPaintBox(run) : { x: 0, y: 0, w: 1, h: 1 };
  return {
    ...target,
    removed,
    pathPaint: !!(occ && occ.pathPaint),
    renderMode: occ && occ.renderMode,
    formPath: occ && occ.formPath,
    regionDiff: rectMeanAbsDiff(fullData, supData, full.canvas.width, full.canvas.height, {
      x: box.x * SCALE,
      y: box.y * SCALE,
      w: Math.max(1, box.w * SCALE),
      h: Math.max(1, box.h * SCALE),
    }),
    elsewhereDiff: rectMeanAbsDiff(fullData, supData, full.canvas.width, full.canvas.height, {
      x: 0,
      y: 0,
      w: full.canvas.width,
      h: Math.max(1, Math.floor(box.y * SCALE) - 4),
    }),
  };
}

async function provePage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const full = await render(page, SCALE, { collect: true });
  if (full.hookHits < 1) {
    throw new Error("hook did not execute on page " + pageNumber);
  }
  const viewport1 = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const styles = content.styles || {};
  const runs = (content.items || []).filter((item) => item && String(item.str || "").trim()).map((item) => {
    const layout = pdfTextLayout(item, viewport1, styles[item.fontName] || {});
    return {
      characters: item.str,
      x: layout.x,
      y: layout.y,
      baseline: layout.baseline,
      width: layout.width,
      fontSize: layout.fontSize,
      fontName: item.fontName,
      decoded: isDecoded(item.str),
    };
  });
  const matched = matchRunsToOccurrences(runs, full.occurrences, SCALE);
  const fillTarget = pickLine(full.occurrences, matched, false);
  const pathTarget = pickLine(full.occurrences, matched, true);
  const fillRender = fillTarget ? await render(page, SCALE, { suppressIds: [fillTarget.id] }) : null;
  const pathRender = pathTarget ? await render(page, SCALE, { suppressIds: [pathTarget.id] }) : null;
  const allIds = matched.map((item) => item.id);
  const allRender = allIds.length ? await render(page, SCALE, { suppressIds: allIds }) : null;
  const fullData = full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
  let kept = 0;
  if (allRender) {
    const allData = allRender.ctx.getImageData(0, 0, allRender.canvas.width, allRender.canvas.height).data;
    matched.forEach((item) => {
      if (promotedRunRemoved(fullData, allData, full.canvas.width, full.canvas.height, item.run, SCALE)) kept += 1;
    });
  }
  const formPaths = {};
  full.occurrences.forEach((o) => { formPaths[o.formPath] = (formPaths[o.formPath] || 0) + 1; });
  const repeats = {};
  full.occurrences.forEach((o) => {
    if (!o.unicode) return;
    repeats[o.unicode] = (repeats[o.unicode] || 0) + 1;
  });
  const fill = fillRender ? measureTarget(full, fillRender, matched, full.occurrences, fillTarget) : null;
  const path = pathRender ? measureTarget(full, pathRender, matched, full.occurrences, pathTarget) : null;
  const target = (fill && fill.removed) ? fill : (path && path.removed) ? path : (fill || path);
  const chosenCanvas = (fill && fill.removed && fillRender)
    || (path && path.removed && pathRender)
    || fillRender
    || pathRender
    || full;
  return {
    pageNumber,
    hookHits: full.hookHits,
    revision: full.revision,
    version: full.version,
    build: full.build,
    occ: full.occurrences.length,
    suppressible: full.occurrences.filter((o) => o.suppressible).length,
    pathPaint: full.occurrences.filter((o) => o.pathPaint).length,
    fillPaint: full.occurrences.filter((o) => o.suppressible && !o.pathPaint).length,
    type3: full.occurrences.filter((o) => o.suppressible === false).length,
    textItems: runs.length,
    decodedItems: runs.filter((r) => r.decoded).length,
    matched: matched.length,
    kept,
    fonts: [...new Set(full.occurrences.map((o) => o.fontName).filter(Boolean))],
    formPaths,
    repeated: Object.keys(repeats).filter((k) => repeats[k] > 1).slice(0, 8).map((k) => ({ unicode: k.slice(0, 40), n: repeats[k] })),
    fill,
    path,
    target,
    removed: !!(target && target.removed),
    sampleOcc: full.occurrences.slice(0, 8).map((o) => ({
      id: o.id,
      unicode: String(o.unicode || "").slice(0, 48),
      x: Math.round(o.x),
      y: Math.round(o.y),
      suppressible: o.suppressible,
      pathPaint: o.pathPaint,
      renderMode: o.renderMode,
      formPath: o.formPath,
    })),
    sampleRuns: runs.slice(0, 8).map((r) => ({
      characters: String(r.characters).slice(0, 48),
      x: Math.round(r.x),
      baseline: Math.round(r.baseline),
      fontSize: Math.round(r.fontSize * 10) / 10,
      decoded: r.decoded,
    })),
    refPng: null,
    suppressedPng: null,
    pathPng: null,
    allPng: null,
    uploaded: [
      await uploadPng("page-" + pageNumber + "-ref.png", full.canvas),
      await uploadPng("page-" + pageNumber + "-suppressed.png", chosenCanvas.canvas),
      pathRender ? await uploadPng("page-" + pageNumber + "-path.png", pathRender.canvas) : null,
      allRender ? await uploadPng("page-" + pageNumber + "-all.png", allRender.canvas) : null,
    ].filter(Boolean),
  };
}

async function main() {
  try {
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
    const identity = {
      revision: hook().revision,
      version: hook().version,
      build: hook().build,
    };
    const pdf = await pdfjs.getDocument({
      url: "/corpus.pdf",
      isEvalSupported: false,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
    }).promise;
    const result = {
      ok: true,
      numPages: pdf.numPages,
      identity,
      pages: [],
      corpus: [],
    };
    for (const n of PAGES) result.pages.push(await provePage(pdf, n));
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const full = await render(page, SCALE, { collect: true });
      const viewport1 = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const styles = content.styles || {};
      const runs = (content.items || []).filter((item) => item && String(item.str || "").trim()).map((item) => {
        const layout = pdfTextLayout(item, viewport1, styles[item.fontName] || {});
        return {
          characters: item.str,
          x: layout.x,
          y: layout.y,
          baseline: layout.baseline,
          width: layout.width,
          fontSize: layout.fontSize,
        };
      });
      const matched = matchRunsToOccurrences(runs, full.occurrences, SCALE);
      const ids = matched.map((item) => item.id);
      const suppressed = ids.length ? await render(page, SCALE, { suppressIds: ids }) : full;
      const fullData = full.ctx.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
      const supData = suppressed.ctx.getImageData(0, 0, suppressed.canvas.width, suppressed.canvas.height).data;
      const keptRuns = [];
      matched.forEach((item) => {
        if (promotedRunRemoved(fullData, supData, full.canvas.width, full.canvas.height, item.run, SCALE)) {
          keptRuns.push(item.run);
        }
      });
      const lines = composeTextLines(keptRuns);
      result.corpus.push({
        page: n,
        hookHits: full.hookHits,
        occ: full.occurrences.length,
        fill: full.occurrences.filter((o) => o.suppressible && !o.pathPaint).length,
        invisible: full.occurrences.filter((o) => o.renderMode === 3).length,
        matched: matched.length,
        kept: keptRuns.length,
        lines: lines.map((line) => line.characters.slice(0, 80)),
        fallback: keptRuns.length ? "text over suppressed page image" : (full.hookHits ? "visible lettering is path artwork or invisible overlay" : "no text ops"),
      });
    }
    await fetch("/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) });
  } catch (error) {
    await fetch("/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(error && error.stack || error) }),
    });
  }
}
main();
</script>
`;

const mime = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
};

function sendFile(res, filePath) {
  const type = mime[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  createReadStream(filePath).pipe(res);
}

function chromeBin() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  throw new Error('Chrome/Chromium not found');
}

const pending = new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (req.method === 'POST' && url.startsWith('/png')) {
      const name = new URL(req.url, 'http://127.0.0.1').searchParams.get('name') || 'capture.png';
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const chunks = [];
      req.on('data', (chunk) => { chunks.push(chunk); });
      req.on('end', () => {
        writeFileSync(join(outDir, safe), Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      return;
    }
    if (req.method === 'POST' && url === '/result') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
        server.close();
      });
      return;
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(harness);
      return;
    }
    if (url === '/corpus.pdf') return sendFile(res, pdfPath);
    if (url.startsWith('/vendor/') || url.startsWith('/scripts/')) {
      const filePath = join(root, url.slice(1));
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      return sendFile(res, filePath);
    }
    res.writeHead(404);
    res.end('not found');
  });
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const bin = chromeBin();
    const child = spawn(bin, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${join(outDir, 'chrome-profile-' + Date.now())}`,
      `http://127.0.0.1:${port}/`,
    ], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      server.close();
      reject(new Error('proof timed out'));
    }, 180000);
    pending.finally(() => {
      clearTimeout(timer);
      child.kill();
    });
  });
});

const result = await pending;
writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error(result.error || result);
  process.exit(1);
}
if (result.numPages !== 17) {
  console.error('expected 17 pages, got', result.numPages);
  process.exit(1);
}

let failed = false;
let anyRemoved = false;
for (const page of result.pages) {
  const line = {
    page: page.pageNumber,
    hookHits: page.hookHits,
    occ: page.occ,
    matched: page.matched,
    kept: page.kept,
    fill: page.fill,
    path: page.path,
    removed: page.removed,
  };
  console.log(JSON.stringify(line));
  if (!page.hookHits) failed = true;
  if (page.removed) anyRemoved = true;
}
if (!anyRemoved) failed = true;
if (result.identity.revision !== '2') failed = true;
console.log('identity', result.identity);
console.log('corpus', JSON.stringify(result.corpus));
console.log('wrote', outDir);
if (failed) process.exit(1);
