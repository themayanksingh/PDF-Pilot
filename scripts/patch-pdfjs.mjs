#!/usr/bin/env node
// Apply the PDF Pilot renderer hook to vendored pdf.js 3.11.174.
// Upstream generic build SHA-256: d83766f20a4c31fbce5a29d98789cdfbef781b147441da45be1d1079e8e0f81c
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'vendor/pdfjs/pdf.js');
const UPSTREAM_SHA = 'd83766f20a4c31fbce5a29d98789cdfbef781b147441da45be1d1079e8e0f81c';
const HOOK_MARK = 'PDF_PILOT_HOOK_REVISION';

const source = readFileSync(target, 'utf8');
const sha = createHash('sha256').update(source).digest('hex');
if (source.includes(HOOK_MARK)) {
  console.log('pdf.js already patched (' + HOOK_MARK + ')');
  process.exit(0);
}
if (sha !== UPSTREAM_SHA) {
  throw new Error('vendor/pdfjs/pdf.js is not the expected 3.11.174 generic build (sha ' + sha + ')');
}

function replaceOnce(haystack, find, replacement, label) {
  const count = haystack.split(find).length - 1;
  if (count !== 1) throw new Error('patch ' + label + ': expected 1 match, found ' + count);
  return haystack.replace(find, replacement);
}

const hookPrelude = `const PDF_PILOT_HOOK_REVISION = "2";
function pdfPilotRenderer() {
  const hook = globalThis.__PDF_PILOT_RENDERER__;
  if (!hook || hook.revision !== PDF_PILOT_HOOK_REVISION) {
    throw new Error("PDF Pilot renderer hook is unavailable");
  }
  return hook;
}
function pdfPilotUnicodeFromGlyphs(glyphs) {
  let text = "";
  for (const glyph of glyphs) {
    if (typeof glyph === "number" || !glyph) continue;
    text += glyph.unicode || "";
  }
  return text;
}
if (!globalThis.__PDF_PILOT_RENDERER__) {
  globalThis.__PDF_PILOT_RENDERER__ = {
    revision: PDF_PILOT_HOOK_REVISION,
    version: "3.11.174",
    build: "ce8716743",
    hookHits: 0,
    collect: false,
    suppressIds: null,
    occurrences: [],
    reset() {
      this.hookHits = 0;
      this.occurrences = [];
      this.collect = false;
      this.suppressIds = null;
    }
  };
}
class CanvasGraphics {`;

let next = replaceOnce(source, 'class CanvasGraphics {', hookPrelude, 'prelude');

next = replaceOnce(next, `    this._cachedBitmapsMap = new Map();
  }`, `    this._cachedBitmapsMap = new Map();
    this._pdfPilotFormStack = ["page"];
    this._pdfPilotFormPath = "page";
    this._pdfPilotShowSeq = 0;
  }`, 'constructor');

next = replaceOnce(next, `  paintFormXObjectBegin(matrix, bbox) {
    if (!this.contentVisible) {
      return;
    }
    this.save();`, `  paintFormXObjectBegin(matrix, bbox) {
    if (!this.contentVisible) {
      return;
    }
    this._pdfPilotFormSeq = (this._pdfPilotFormSeq || 0) + 1;
    (this._pdfPilotFormStack ||= ["page"]).push("form" + this._pdfPilotFormSeq);
    this._pdfPilotFormPath = this._pdfPilotFormStack.join("/");
    this.save();`, 'form-begin');

next = replaceOnce(next, `  paintFormXObjectEnd() {
    if (!this.contentVisible) {
      return;
    }
    this.restore();
    this.baseTransform = this.baseTransformStack.pop();
  }`, `  paintFormXObjectEnd() {
    if (!this.contentVisible) {
      return;
    }
    if (this._pdfPilotFormStack && this._pdfPilotFormStack.length > 1) this._pdfPilotFormStack.pop();
    this._pdfPilotFormPath = (this._pdfPilotFormStack || ["page"]).join("/");
    this.restore();
    this.baseTransform = this.baseTransformStack.pop();
  }`, 'form-end');

const oldShowTextStart = `  showText(glyphs) {
    const current = this.current;
    const font = current.font;
    if (font.isType3Font) {
      return this.showType3Text(glyphs);
    }
    const fontSize = current.fontSize;
    if (fontSize === 0) {
      return undefined;
    }`;

const newShowTextStart = `  showText(glyphs) {
    const current = this.current;
    const font = current.font;
    if (font.isType3Font) {
      return this.showType3Text(glyphs);
    }
    const fontSize = current.fontSize;
    if (fontSize === 0) {
      return undefined;
    }
    const pdfPilot = pdfPilotRenderer();
    pdfPilot.hookHits += 1;
    this._pdfPilotShowSeq = (this._pdfPilotShowSeq || 0) + 1;
    const pdfPilotId = (this._pdfPilotFormPath || "page") + "#" + this._pdfPilotShowSeq;
    const pdfPilotRenderMode = current.textRenderingMode;
    const pdfPilotClip = !!(pdfPilotRenderMode & _util.TextRenderingMode.ADD_TO_PATH_FLAG);
    const pdfPilotSuppressible = !pdfPilotClip && !current.patternFill && pdfPilotRenderMode === _util.TextRenderingMode.FILL;
    const pdfPilotSuppress = !!(pdfPilot.suppressIds && pdfPilot.suppressIds.has(pdfPilotId));`;

next = replaceOnce(next, oldShowTextStart, newShowTextStart, 'showText-start');

next = replaceOnce(next, `    if (font.isInvalidPDFjsFont) {
      const chars = [];
      let width = 0;
      for (const glyph of glyphs) {
        chars.push(glyph.unicode);
        width += glyph.width;
      }
      ctx.fillText(chars.join(""), 0, 0);
      current.x += width * widthAdvanceScale * textHScale;
      ctx.restore();
      this.compose();
      return undefined;
    }
    let x = 0,
      i;`, `    if (pdfPilot.collect) {
      const origin = (0, _display_utils.getCurrentTransform)(ctx);
      let pdfPilotWidth = 0;
      for (const glyph of glyphs) {
        if (typeof glyph === "number") {
          pdfPilotWidth -= glyph * widthAdvanceScale;
          continue;
        }
        if (glyph) pdfPilotWidth += glyph.width * widthAdvanceScale;
      }
      const fillHex = typeof current.fillColor === "string" ? current.fillColor : "";
      const fillMatch = /^#([0-9a-f]{6})$/i.exec(fillHex);
      pdfPilot.occurrences.push({
        id: pdfPilotId,
        unicode: pdfPilotUnicodeFromGlyphs(glyphs),
        fontName: font && (font.name || font.loadedName) || "",
        x: origin[4],
        y: origin[5],
        fontSize: fontSize * (current.textMatrixScale || 1),
        width: Math.abs(pdfPilotWidth * textHScale),
        renderMode: pdfPilotRenderMode,
        fill: fillMatch ? {
          r: parseInt(fillMatch[1].slice(0, 2), 16) / 255,
          g: parseInt(fillMatch[1].slice(2, 4), 16) / 255,
          b: parseInt(fillMatch[1].slice(4, 6), 16) / 255
        } : {
          r: 0,
          g: 0,
          b: 0
        },
        formPath: this._pdfPilotFormPath || "page",
        pathPaint: !!(font.disableFontFace || current.patternFill || !simpleFillText),
        suppressible: pdfPilotSuppressible && !font.isInvalidPDFjsFont
      });
    }
    if (font.isInvalidPDFjsFont) {
      const chars = [];
      let width = 0;
      for (const glyph of glyphs) {
        chars.push(glyph.unicode);
        width += glyph.width;
      }
      if (!pdfPilotSuppress) ctx.fillText(chars.join(""), 0, 0);
      current.x += width * widthAdvanceScale * textHScale;
      ctx.restore();
      this.compose();
      return undefined;
    }
    let x = 0,
      i;`, 'showText-collect');

next = replaceOnce(next, `      if (this.contentVisible && (glyph.isInFont || font.missingFile)) {
        if (simpleFillText && !accent) {
          ctx.fillText(character, scaledX, scaledY);
        } else {
          this.paintChar(character, scaledX, scaledY, patternTransform);`, `      if (!pdfPilotSuppress && this.contentVisible && (glyph.isInFont || font.missingFile)) {
        if (simpleFillText && !accent) {
          ctx.fillText(character, scaledX, scaledY);
        } else {
          this.paintChar(character, scaledX, scaledY, patternTransform);`, 'showText-paint');

next = replaceOnce(next, `    if (isTextInvisible || fontSize === 0) {
      return;
    }
    this._cachedScaleForStroking[0] = -1;`, `    if (isTextInvisible || fontSize === 0) {
      return;
    }
    const pdfPilot = pdfPilotRenderer();
    pdfPilot.hookHits += 1;
    this._pdfPilotShowSeq = (this._pdfPilotShowSeq || 0) + 1;
    if (pdfPilot.collect) {
      pdfPilot.occurrences.push({
        id: (this._pdfPilotFormPath || "page") + "#" + this._pdfPilotShowSeq,
        unicode: pdfPilotUnicodeFromGlyphs(glyphs),
        fontName: font && (font.name || font.loadedName) || "",
        x: 0,
        y: 0,
        fontSize,
        renderMode: current.textRenderingMode,
        formPath: this._pdfPilotFormPath || "page",
        pathPaint: true,
        suppressible: false
      });
    }
    this._cachedScaleForStroking[0] = -1;`, 'type3');

next = replaceOnce(next, `const pdfjsVersion = '3.11.174';
const pdfjsBuild = 'ce8716743';
})();`, `const pdfjsVersion = '3.11.174';
const pdfjsBuild = 'ce8716743';
Object.defineProperty(exports, "PDFPilot", ({
  enumerable: true,
  get: function () {
    return globalThis.__PDF_PILOT_RENDERER__;
  }
}));
})();`, 'export');

writeFileSync(target, next);
console.log('patched vendor/pdfjs/pdf.js hook revision 2');
