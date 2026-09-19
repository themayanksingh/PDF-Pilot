#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'ui.html'), 'utf8');
const pdfjs = readFileSync(join(root, 'vendor/pdfjs/pdf.js'), 'utf8');
const worker = readFileSync(join(root, 'vendor/pdfjs/pdf.worker.min.js'), 'utf8');
if (!pdfjs.includes('PDF_PILOT_HOOK_REVISION')) {
  throw new Error('vendor/pdfjs/pdf.js is missing the PDF Pilot hook; run scripts/patch-pdfjs.mjs');
}
if (!html.includes('<!--PDFJS_MAIN-->') || !html.includes('<!--/PDFJS_MAIN-->')) {
  throw new Error('ui.html is missing PDFJS_MAIN markers');
}
const inject = [
  '<!--PDFJS_MAIN-->',
  '<script>',
  pdfjs.replace(/<\/script/gi, '<\\/script'),
  '</script>',
  '<script id="pdfjs-worker-src" type="text/plain">',
  worker.replace(/<\/script/gi, '<\\/script'),
  '</script>',
  '<!--/PDFJS_MAIN-->',
].join('\n');
const out = html.replace(/<!--PDFJS_MAIN-->[\s\S]*?<!--\/PDFJS_MAIN-->/, inject);
if (out.includes('cdnjs.cloudflare.com/ajax/libs/pdf.js')) {
  throw new Error('bundled UI still references the CDN pdf.js build');
}
if (!out.includes('PDF_PILOT_HOOK_REVISION')) {
  throw new Error('bundled UI is missing the renderer hook');
}
writeFileSync(join(root, 'ui.bundle.html'), out);
console.log('wrote ui.bundle.html');
