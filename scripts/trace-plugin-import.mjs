#!/usr/bin/env node
// Trace bundled-plugin Editable import stages for sketches pages 6/10.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfPath = process.env.PDF_PILOT_PROOF_PDF
  || '/Users/mayanksingh/Downloads/pdfcoffee.com_07sketches-volume-3pdf-pdf-free.pdf';
const lucknowPath = process.env.PDF_PILOT_LUCKNOW_PDF
  || '/Users/mayanksingh/Downloads/lucknow.pdf';
const outDir = process.env.PDF_PILOT_TRACE_DIR || '/tmp/pdf-pilot-plugin-trace';

if (!existsSync(pdfPath)) throw new Error('missing corpus PDF: ' + pdfPath);
mkdirSync(outDir, { recursive: true });

const harness = `<!doctype html>
<meta charset="utf-8">
<title>pdf-pilot plugin import trace</title>
<script src="/vendor/pdfjs/pdf.js"></script>
<script type="module" src="/scripts/trace-plugin-import-page.mjs"></script>
`;

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

function sendFile(res, filePath) {
  const types = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.pdf': 'application/pdf',
    '.css': 'text/css; charset=utf-8',
  };
  res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
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
    if (url === '/lucknow.pdf') {
      if (!existsSync(lucknowPath)) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      return sendFile(res, lucknowPath);
    }
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
    const child = spawn(chromeBin(), [
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
      reject(new Error('trace timed out'));
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
console.log(JSON.stringify({
  identity: result.identity,
  numPages: result.numPages,
  lucknow: result.lucknow,
  pages: result.pages.map((page) => ({
    page: page.pageNumber,
    want: page.want,
    firstFail: page.firstFail,
    extract: page.extract,
    paint: page.paint,
    candidates: page.candidates,
    stages: page.stages,
  })),
}, null, 2));
