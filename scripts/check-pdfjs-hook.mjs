#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsPath = join(root, 'vendor/pdfjs/pdf.js');
const bundlePath = join(root, 'ui.bundle.html');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pdfjsSource = readFileSync(pdfjsPath, 'utf8');
const bundle = readFileSync(bundlePath, 'utf8');

if (!pdfjsSource.includes('PDF_PILOT_HOOK_REVISION')) {
  throw new Error('vendor/pdfjs/pdf.js is not patched');
}
if (manifest.ui !== 'ui.bundle.html') {
  throw new Error('manifest.json ui must be ui.bundle.html, got ' + manifest.ui);
}
if (bundle.includes('cdnjs.cloudflare.com/ajax/libs/pdf.js')) {
  throw new Error('ui.bundle.html still loads CDN pdf.js');
}
if (!bundle.includes('PDF_PILOT_HOOK_REVISION') || !bundle.includes('id="pdfjs-worker-src"')) {
  throw new Error('ui.bundle.html is missing the hooked engine or worker');
}

const require = createRequire(import.meta.url);
const pdfjs = require(pdfjsPath);
const hook = pdfjs.PDFPilot || (typeof globalThis !== 'undefined' && globalThis.__PDF_PILOT_RENDERER__);
if (!hook || hook.revision !== '2' || hook.version !== '3.11.174') {
  throw new Error('pdf.js PDFPilot export is missing or wrong: ' + JSON.stringify(hook));
}

const sha = createHash('sha256').update(pdfjsSource).digest('hex');
if (sha === 'd83766f20a4c31fbce5a29d98789cdfbef781b147441da45be1d1079e8e0f81c') {
  throw new Error('vendor/pdfjs/pdf.js still matches unmodified upstream');
}

console.log('pdfjs hook ok', {
  revision: hook.revision,
  version: hook.version,
  build: hook.build,
  manifestUi: manifest.ui,
});
