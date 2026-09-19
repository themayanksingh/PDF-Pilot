#!/usr/bin/env node
// Chromium extraction check for Essential Guide pages 5 and 11.
// Covers RGB, occurrence concat, and same-canvas suppression. Not a Figma export verify.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfPath = process.env.PDF_PILOT_GUIDE_PDF
  || '/Users/mayanksingh/Downloads/The Essential Guide to Architecture and Interior Designing (07sketches) (z-library.sk, 1lib.sk, z-lib.sk).pdf';
const outDir = process.env.PDF_PILOT_GUIDE_DIR || '/tmp/pdf-pilot-guide-import';

if (!existsSync(pdfPath)) throw new Error('missing Essential Guide PDF: ' + pdfPath);
mkdirSync(outDir, { recursive: true });

const harness = `<!doctype html>
<meta charset="utf-8">
<title>pdf-pilot guide import check</title>
<script src="/vendor/pdfjs/pdf.js"></script>
<script type="module" src="/scripts/check-guide-import-page.mjs"></script>
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
  };
  res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

const pending = new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = req.url.split('?')[0];
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
      reject(new Error('guide import check timed out'));
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
  console.error(result.errors || result);
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  pages: result.pages,
}, null, 2));
