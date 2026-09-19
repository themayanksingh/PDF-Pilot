#!/usr/bin/env node
// Keep these helpers in sync with ui.html editable import.

export const IMPORT_RENDER_MAX_PIXELS = 16000000;
export const FIGMA_IMAGE_MAX_EDGE = 4096;

export function importRenderScaleForSize(width, height, requestedScale, maxPixels = IMPORT_RENDER_MAX_PIXELS, maxEdge = FIGMA_IMAGE_MAX_EDGE) {
  const requestedPixels = requestedScale * width * requestedScale * height;
  const pixelScale = requestedPixels > maxPixels ? Math.sqrt(maxPixels / (width * height)) : requestedScale;
  return Math.min(pixelScale, maxEdge / width, maxEdge / height);
}
export const FONT_ALIASES = {
  helvetica: 'Arial',
  'helvetica-bold': 'Arial',
  helveticaneue: 'Helvetica Neue',
  times: 'Times New Roman',
  'times-roman': 'Times New Roman',
  'times-bold': 'Times New Roman',
  timesnewroman: 'Times New Roman',
  timesnewromanps: 'Times New Roman',
  courier: 'Courier New',
  'courier-new': 'Courier New',
  arialmt: 'Arial',
  symbol: 'Symbol',
  zapfdingbats: 'Zapf Dingbats',
  sfui: 'SF Pro',
  'sf ui': 'SF Pro',
  sfns: 'SF Pro',
  'sf ns': 'SF Pro',
  dincondensed: 'DIN Condensed',
  'din condensed': 'DIN Condensed',
  futura: 'Futura',
  futurabt: 'Futura',
  hirakakuinterface: 'Hiragino Sans',
  hirakakupro: 'Hiragino Kaku Gothic Pro',
  hirakakupron: 'Hiragino Kaku Gothic ProN',
};

export function pdfMultiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function pdfApply(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function parsePdfFontName(fontFamily) {
  let blob = String(fontFamily || '').replace(/^[A-Z]{6}\+/, '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  blob = blob.replace(/^\./, '').replace(/_(opsz|GRAD|YAXS|wght|wdth|ital)[-A-Za-z0-9.]+/gi, '');
  let style = 'Regular';
  if ((/bold/i.test(blob) || /(?:^|[-_])Bd(?:[-_]|$)/i.test(blob)) && /italic|oblique/i.test(blob)) style = 'Bold Italic';
  else if (/semi(?:bold)?|demi(?:bold)?/i.test(blob)) style = 'Semibold';
  else if (/heavy/i.test(blob)) style = 'Heavy';
  else if (/black/i.test(blob)) style = 'Black';
  else if (/bold/i.test(blob) || /(?:^|[-_])Bd/i.test(blob)) style = 'Bold';
  else if (/book/i.test(blob)) style = 'Book';
  else if (/medium/i.test(blob)) style = 'Medium';
  else if (/light/i.test(blob)) style = 'Light';
  else if (/italic|oblique/i.test(blob)) style = 'Italic';
  else {
    const weight = blob.match(/[-_]W(\d)$/i);
    if (weight) style = 'W' + weight[1];
  }
  const family = blob
    .replace(/MT$/i, '')
    .replace(/[-_](BoldItalic|BoldOblique|Semibold|DemiBold|Demi|Bold|Italic|Oblique|Regular|Book|Medium|Light|Black|Heavy|Roman|W\d|BdCn|Bd|Cn|It)$/i, '')
    .replace(/(LTStd|Std|PS|BT)$/i, '')
    .replace(/[-_]+$/, '')
    .trim() || blob;
  return { family, style, raw: blob };
}

export function fontFamilyCandidates(family) {
  const raw = String(family || '').trim();
  if (!raw) return [];
  const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  const alias = FONT_ALIASES[raw.toLowerCase()] || FONT_ALIASES[compact] || FONT_ALIASES[spaced.replace(/\s+/g, '').toLowerCase()];
  const names = [raw];
  if (spaced !== raw) names.push(spaced);
  if (alias) names.push(alias);
  if (alias === 'SF Pro') names.push('SF Pro Text', 'SF Pro Display');
  return [...new Set(names)];
}

function otReadNameString(bytes, offset, length, platform, encoding) {
  if (offset < 0 || offset + length > bytes.length) return '';
  if (platform === 3 || encoding === 1 || encoding === 10) {
    let out = '';
    for (let i = 0; i + 1 < length; i += 2) {
      const code = (bytes[offset + i] << 8) | bytes[offset + i + 1];
      if (code) out += String.fromCharCode(code);
    }
    return out.trim();
  }
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out.trim();
}

export function parseOpenTypeNames(bytes) {
  const empty = {
    family: '',
    style: '',
    fullName: '',
    postscript: '',
    bytes: bytes && bytes.length || 0,
    weight: 0,
    width: 5,
    italic: false,
    panose: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fixedPitch: false,
    unicodeRange: 0,
  };
  if (!bytes || bytes.length < 12) return empty;
  const u16 = (at) => (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  let sfnt = 0;
  const tag = u32(0);
  if (tag === 0x74746366) {
    if (bytes.length < 16) return empty;
    sfnt = u32(12);
  } else if (tag !== 0x00010000 && tag !== 0x4F54544F && tag !== 0x74727565) {
    return empty;
  }
  if (sfnt + 12 > bytes.length) return empty;
  const numTables = u16(sfnt + 4);
  let nameOff = 0;
  let os2Off = 0;
  let postOff = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = sfnt + 12 + i * 16;
    if (rec + 16 > bytes.length) break;
    const t0 = bytes[rec];
    const t1 = bytes[rec + 1];
    const t2 = bytes[rec + 2];
    const t3 = bytes[rec + 3];
    const off = u32(rec + 8);
    if (t0 === 0x6E && t1 === 0x61 && t2 === 0x6D && t3 === 0x65) nameOff = off;
    else if (t0 === 0x4F && t1 === 0x53 && t2 === 0x2F && t3 === 0x32) os2Off = off;
    else if (t0 === 0x70 && t1 === 0x6F && t2 === 0x73 && t3 === 0x74) postOff = off;
  }
  const found = {};
  if (nameOff && nameOff + 6 <= bytes.length) {
    const count = u16(nameOff + 2);
    const stringOff = nameOff + u16(nameOff + 4);
    for (let i = 0; i < count; i++) {
      const rec = nameOff + 6 + i * 12;
      if (rec + 12 > bytes.length) break;
      const platform = u16(rec);
      const encoding = u16(rec + 2);
      const nameId = u16(rec + 6);
      const length = u16(rec + 8);
      const offset = stringOff + u16(rec + 10);
      if (nameId !== 1 && nameId !== 2 && nameId !== 4 && nameId !== 6 && nameId !== 16 && nameId !== 17) continue;
      const text = otReadNameString(bytes, offset, length, platform, encoding);
      if (!text) continue;
      if (!found[nameId] || platform === 3) found[nameId] = text;
    }
  }
  let weight = 0;
  let width = 5;
  let italic = false;
  const panose = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let unicodeRange = 0;
  if (os2Off && os2Off + 64 <= bytes.length) {
    weight = u16(os2Off + 4);
    width = u16(os2Off + 6) || 5;
    for (let i = 0; i < 10; i++) panose[i] = bytes[os2Off + 32 + i];
    unicodeRange = u32(os2Off + 42);
    italic = !!(u16(os2Off + 62) & 1);
  }
  let fixedPitch = false;
  if (postOff && postOff + 16 <= bytes.length) {
    if (u16(postOff + 4) !== 0) italic = true;
    fixedPitch = u32(postOff + 12) !== 0;
  }
  return {
    family: found[16] || found[1] || '',
    style: found[17] || found[2] || '',
    fullName: found[4] || '',
    postscript: found[6] || '',
    bytes: bytes.length,
    weight,
    width,
    italic,
    panose,
    fixedPitch,
    unicodeRange,
  };
}

export function parsePdfFontIdentity(baseFont, fontBytes) {
  const names = parseOpenTypeNames(fontBytes);
  const parsed = [names.family, names.fullName, names.postscript, baseFont]
    .filter(Boolean)
    .map(parsePdfFontName);
  const spaced = parsed.find((item) => / /.test(item.family));
  const aliased = parsed.find((item) => FONT_ALIASES[String(item.family || '').toLowerCase()]);
  const stripped = parsed.find((item) => item.family && item.family !== item.raw);
  const best = spaced || aliased || stripped || parsed[0] || parsePdfFontName(baseFont);
  const baseStyle = parsePdfFontName(baseFont).style;
  const tableStyle = names.style && !/^unknown$/i.test(names.style) ? names.style : '';
  const style = (tableStyle && !/^regular$/i.test(tableStyle)) || !baseStyle || /^regular$/i.test(baseStyle)
    ? (tableStyle || best.style || baseStyle)
    : baseStyle;
  return {
    family: best.family,
    style: style || best.style,
    raw: best.raw,
    embedded: names.bytes > 0,
    postscript: names.postscript || best.raw,
    fullName: names.fullName,
    bytes: names.bytes,
    weight: names.weight || 0,
    width: names.width || 5,
    italic: names.italic === true || /italic|oblique/i.test(style || best.style || ''),
    panose: names.panose || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fixedPitch: names.fixedPitch === true,
    unicodeRange: names.unicodeRange || 0,
  };
}

export function styleEquivalents(style) {
  const wanted = String(style || 'Regular');
  const key = wanted.toLowerCase();
  if (key === 'book' || key === 'roman') return ['Regular', 'Book', 'Roman', 'Medium'];
  if (key === 'regular') return ['Regular', 'Roman', 'Book', 'Medium'];
  if (key === 'medium') return ['Medium', 'Regular', 'Book'];
  if (key === 'heavy') return ['Heavy', 'Black', 'Bold'];
  if (key === 'black') return ['Black', 'Heavy', 'Bold'];
  if (key === 'bold') return ['Bold', 'Heavy', 'Black'];
  if (key === 'semibold' || key === 'demibold' || key === 'demi') return ['Semibold', 'DemiBold', 'Demi', 'SemiBold'];
  if (key === 'oblique') return ['Italic', 'Oblique'];
  if (key === 'italic') return ['Italic', 'Oblique'];
  return [wanted];
}

export function matchAvailableFont(family, style, available) {
  if (!family) return null;
  const wantedStyle = style || 'Regular';
  const names = fontFamilyCandidates(family);
  const alias = names[names.length - 1] || family;
  const styles = styleEquivalents(wantedStyle);
  if (!available || available.length === 0) return { family: alias, style: wantedStyle };
  for (const name of names) {
    for (const st of styles) {
      const exact = available.find((font) => font.family === name && font.style === st)
        || available.find((font) => font.family.toLowerCase() === name.toLowerCase() && font.style === st);
      if (exact) return exact;
    }
  }
  return null;
}

export const CLASS_FALLBACKS = {
  'neutral-sans': ['Arial', 'Inter', 'Helvetica'],
  'geometric-sans': ['Avenir Next', 'Century Gothic', 'Montserrat', 'Futura'],
  'humanist-sans': ['Frutiger', 'Myriad Pro', 'Segoe UI', 'Source Sans 3', 'Source Sans Pro'],
  'condensed-sans': ['DIN Condensed', 'Roboto Condensed', 'Arial Narrow'],
  'transitional-serif': ['Times New Roman', 'Georgia'],
  'modern-serif': ['Didot', 'Bodoni 72', 'Bodoni'],
  'slab-serif': ['Rockwell', 'Roboto Slab'],
  mono: ['Courier New', 'Roboto Mono', 'Menlo'],
  'cjk-sans': ['Noto Sans CJK JP', 'Hiragino Sans', 'Yu Gothic'],
  'cjk-serif': ['Noto Serif CJK JP', 'Hiragino Mincho ProN'],
  arabic: ['Noto Sans Arabic', 'Noto Naskh Arabic'],
  devanagari: ['Noto Sans Devanagari', 'Kohinoor Devanagari'],
};

export function styleWeight(style) {
  const key = String(style || '').toLowerCase();
  if (/thin|hairline/.test(key)) return 100;
  if (/ultra\s*light|extralight/.test(key)) return 200;
  if (/light/.test(key)) return 300;
  if (/medium/.test(key)) return 500;
  if (/semi|demi/.test(key)) return 600;
  if (/heavy|extra\s*bold|ultrabold/.test(key)) return 800;
  if (/black|ultra/.test(key)) return 900;
  if (/bold|\bbd\b/.test(key)) return 700;
  if (/book|roman|regular/.test(key) || !key) return 400;
  return 400;
}

export function styleWidth(style, raw) {
  const blob = String(style || '') + ' ' + String(raw || '');
  if (/ultra\s*cond/i.test(blob)) return 1;
  if (/extra\s*cond/i.test(blob)) return 2;
  if (/semi\s*cond/i.test(blob)) return 4;
  if (/condensed|narrow|compressed|(?:^|[-_\s])(?:Bd)?Cn(?:[-_]|$)/i.test(blob)) return 3;
  if (/semi\s*expand/i.test(blob)) return 6;
  if (/expanded|extended|wide/i.test(blob)) return 7;
  return 5;
}

export function styleItalic(style, raw) {
  return /italic|oblique/i.test(String(style || '') + ' ' + String(raw || ''));
}

export function detectScript(sample) {
  const text = String(sample || '');
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) return 'cjk';
    if (code >= 0x0600 && code <= 0x06ff) return 'arabic';
    if (code >= 0x0900 && code <= 0x097f) return 'devanagari';
  }
  return 'latin';
}

export function detectCategory(family, opts) {
  const name = String(family || '').toLowerCase();
  const panose = (opts && opts.panose) || [];
  const width = (opts && opts.width) || 5;
  const fixed = opts && opts.fixedPitch;
  if (fixed || /mono|courier|menlo|consolas|source code/.test(name)) return 'mono';
  if (/dingbat|symbol|wingding|zapf/.test(name) || panose[0] === 5) return 'symbol';
  if (/script|hand|brush|comic|marker|handwriting/.test(name) || panose[0] === 3) return 'handwriting';
  if (width <= 4 || /condensed|narrow|compressed|din condensed/.test(name)) return 'condensed-sans';
  if (/futura|avenir|century gothic|montserrat|gotham|geometr/.test(name)) return 'geometric-sans';
  if (/frutiger|myriad|gill|segoe|source sans|humanist/.test(name)) return 'humanist-sans';
  if (/didot|bodoni/.test(name)) return 'modern-serif';
  if (/rockwell|slab|egyptienne|clarendon/.test(name)) return 'slab-serif';
  if (/times|georgia|cambria|palatino|garamond|serif/.test(name) || (panose[0] === 2 && panose[1] > 0 && panose[1] < 11)) return 'transitional-serif';
  if (panose[0] === 2 && panose[1] >= 11) return 'neutral-sans';
  return 'neutral-sans';
}

export function normalizeFamilyName(family) {
  let s = String(family || '').replace(/^[A-Z]{6}\+/, '').trim();
  s = s.replace(/(LTStd|Std|PS|MT|BT)$/i, '');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  const compact = s.replace(/\s+/g, '').toLowerCase();
  return FONT_ALIASES[compact] || FONT_ALIASES[s.toLowerCase()] || s;
}

export function pdfFontDescriptor(identity, sample) {
  const parsed = identity && identity.family ? identity : parsePdfFontName((identity && identity.raw) || '');
  const family = normalizeFamilyName(parsed.family);
  const style = parsed.style || 'Regular';
  const namedWidth = styleWidth(style, parsed.raw || (identity && identity.raw));
  const tableWidth = Number(identity && identity.width) || 0;
  const width = (tableWidth > 0 && tableWidth !== 5) ? tableWidth : namedWidth;
  const italic = !!(identity && identity.italic) || styleItalic(style, parsed.raw);
  const weight = (identity && identity.weight) || styleWeight(style);
  return {
    family,
    style,
    weight: weight || styleWeight(style),
    width: width || 5,
    italic,
    category: detectCategory(family, {
      panose: identity && identity.panose,
      width: width || 5,
      fixedPitch: identity && identity.fixedPitch,
    }),
    script: detectScript(sample),
    raw: parsed.raw || family,
  };
}

export function figmaFontDescriptor(font) {
  const family = String(font.family || '');
  const style = String(font.style || 'Regular');
  return {
    family,
    style,
    weight: styleWeight(style),
    width: styleWidth(style, family),
    italic: styleItalic(style, ''),
    category: detectCategory(family, { width: styleWidth(style, family) }),
    script: /hiragino|gothic|mincho|yu gothic|noto sans cjk|source han|pingfang|apple sd/i.test(family)
      ? 'cjk'
      : (/arabic|naskh|kufi/i.test(family) ? 'arabic' : (/devanagari|kohinoor/i.test(family) ? 'devanagari' : 'latin')),
  };
}

function typographyClass(category) {
  if (category === 'mono') return 'mono';
  if (category === 'handwriting') return 'handwriting';
  if (category === 'symbol') return 'symbol';
  if (category === 'transitional-serif' || category === 'modern-serif' || category === 'slab-serif') return 'serif';
  return 'sans';
}

function weightCompatible(sourceWeight, candidateWeight) {
  const srcBold = sourceWeight >= 700;
  const candBold = candidateWeight >= 700;
  return srcBold === candBold || Math.abs(sourceWeight - candidateWeight) <= 150;
}

export function pdfContentKind(desc, run) {
  if (desc.category === 'handwriting' || desc.category === 'symbol') return desc.category;
  if (desc.category === 'mono') return 'mono';
  if (desc.script === 'cjk' || desc.script === 'arabic' || desc.script === 'devanagari') return desc.script;
  if (desc.width <= 4 || desc.category === 'condensed-sans') return 'condensed';
  const size = Number(run && run.fontSize) || 0;
  const chars = String((run && (run.characters || run.sample)) || '');
  if (size >= 18 || (chars.length > 0 && chars.length <= 24 && size >= 14)) return 'heading';
  return 'body';
}

function availableHas(available, family, style) {
  return (available || []).find((font) => font.family === family && font.style === style)
    || (available || []).find((font) => font.family.toLowerCase() === String(family || '').toLowerCase() && font.style === style)
    || null;
}

function fallbackStyleForWeight(weight, italic) {
  let style = 'Regular';
  if (weight >= 800) style = 'Heavy';
  else if (weight >= 700) style = 'Bold';
  else if (weight >= 600) style = 'Semibold';
  else if (weight >= 500) style = 'Medium';
  if (italic) style = style === 'Regular' ? 'Italic' : style + ' Italic';
  return style;
}

export function collectFontCandidates(source, available, limit) {
  const max = limit || 20;
  const out = [];
  const seen = {};
  const push = (font, rung) => {
    if (!font || out.length >= max) return;
    const key = font.family + '::' + font.style;
    if (seen[key]) return;
    const cand = figmaFontDescriptor(font);
    if (source.script !== 'latin' && cand.script !== source.script) return;
    if (typographyClass(source.category) !== typographyClass(cand.category)) return;
    if (source.italic !== cand.italic) return;
    if (!weightCompatible(source.weight, cand.weight)) return;
    if ((source.width <= 4 || source.category === 'condensed-sans') && cand.width > 4) return;
    if (source.category === 'handwriting' && normalizeFamilyName(source.family).toLowerCase() !== normalizeFamilyName(cand.family).toLowerCase()) return;
    if (source.category === 'symbol' && normalizeFamilyName(source.family).toLowerCase() !== normalizeFamilyName(cand.family).toLowerCase()) return;
    seen[key] = true;
    out.push({ family: font.family, style: font.style, rung: rung || 'other' });
  };
  const names = fontFamilyCandidates(source.family);
  for (const name of names) {
    push(availableHas(available, name, source.style), 'exact');
  }
  const equiv = styleEquivalents(source.style);
  for (const name of names) {
    for (let i = 0; i < equiv.length; i++) push(availableHas(available, name, equiv[i]), 'equivalent');
  }
  const wantStyle = fallbackStyleForWeight(source.weight, source.italic);
  if (source.category !== 'handwriting' && source.category !== 'symbol') {
    for (let i = 0; i < (available || []).length && out.length < max; i++) {
      const font = available[i];
      if (normalizeFamilyName(font.family).toLowerCase() !== normalizeFamilyName(source.family).toLowerCase()) continue;
      push(font, 'same-family');
    }
  }
  const classes = [];
  if (source.script === 'cjk') classes.push(typographyClass(source.category) === 'serif' ? 'cjk-serif' : 'cjk-sans');
  else if (source.script === 'arabic') classes.push('arabic');
  else if (source.script === 'devanagari') classes.push('devanagari');
  else {
    classes.push(source.category);
    if (typographyClass(source.category) === 'sans' && source.category !== 'neutral-sans') classes.push('neutral-sans');
  }
  for (let c = 0; c < classes.length; c++) {
    const families = CLASS_FALLBACKS[classes[c]] || [];
    for (let f = 0; f < families.length; f++) {
      const family = families[f];
      for (const st of styleEquivalents(wantStyle)) push(availableHas(available, family, st), 'fallback');
      push(availableHas(available, family, wantStyle), 'fallback');
    }
  }
  if (source.category !== 'handwriting' && source.category !== 'symbol') {
    for (let i = 0; i < (available || []).length && out.length < max; i++) {
      push(available[i], 'metric');
    }
  }
  return out.slice(0, max);
}

export function scoreFontCandidate(source, candidate, measured, kind) {
  const cand = candidate.style ? figmaFontDescriptor(candidate) : candidate;
  if (source.script !== 'latin' && cand.script !== source.script) return { score: Infinity, widthError: 1, heightError: 1, reject: 'script' };
  if (typographyClass(source.category) !== typographyClass(cand.category)) return { score: Infinity, widthError: 1, heightError: 1, reject: 'class' };
  if (source.italic !== cand.italic) return { score: Infinity, widthError: 1, heightError: 1, reject: 'italic' };
  if (!weightCompatible(source.weight, cand.weight)) return { score: Infinity, widthError: 1, heightError: 1, reject: 'weight' };
  const hasMeasure = !!(measured && Number(measured.width) > 0);
  const pdfWidth = Number(measured && measured.pdfWidth) || 0;
  const pdfHeight = Number(measured && measured.pdfHeight) || 0;
  const unmeasured = !hasMeasure || pdfWidth <= 0;
  const widthError = unmeasured ? 0.2 : Math.abs(measured.width - pdfWidth) / pdfWidth;
  const heightError = unmeasured ? 0.2 : (pdfHeight > 0 ? Math.abs((measured.height || 0) - pdfHeight) / pdfHeight : 0);
  let score = widthError * 120 + heightError * 40;
  score += Math.abs(source.weight - cand.weight) / 100 * 12;
  score += Math.abs(source.width - cand.width) * 10;
  if (normalizeFamilyName(source.family).toLowerCase() === normalizeFamilyName(cand.family).toLowerCase()) score -= 40;
  if (kind === 'heading' && (widthError > 0.06 || Math.abs(source.weight - cand.weight) > 100)) score += 40;
  if (kind === 'condensed' && cand.width > 4) return { score: Infinity, widthError, heightError, reject: 'width' };
  return { score, widthError, heightError, reject: '', unmeasured };
}

function confidenceFor(source, cand, scored, kind, rung) {
  if (scored.score === Infinity) return 'low';
  if (kind === 'handwriting' || kind === 'symbol') {
    return normalizeFamilyName(source.family).toLowerCase() === normalizeFamilyName(cand.family).toLowerCase() ? 'high' : 'low';
  }
  if (kind === 'heading' && (scored.widthError > 0.06 || Math.abs(source.weight - cand.weight) > 100)) {
    if (rung !== 'exact' && rung !== 'equivalent' && rung !== 'same-family') return 'low';
    if (scored.widthError > 0.06 && !scored.unmeasured) return 'low';
  }
  if (kind === 'condensed' && cand.width > 4) return 'low';
  if (rung === 'exact' || rung === 'equivalent' || rung === 'same-family') return 'high';
  if (scored.unmeasured) return 'low';
  if (scored.widthError <= 0.08 && Math.abs(source.weight - cand.weight) <= 100) return 'high';
  if (kind === 'body' && scored.widthError <= 0.15 && Math.abs(source.weight - cand.weight) <= 150) return 'medium';
  if (scored.widthError <= 0.12 && (rung === 'fallback' || rung === 'metric')) return 'medium';
  return 'low';
}

export function resolvePdfFont(source, available, opts) {
  const options = opts || {};
  const kind = options.kind || pdfContentKind(source, options.run);
  if (options.override && availableHas(available, options.override.family, options.override.style)) {
    const font = availableHas(available, options.override.family, options.override.style);
    return { family: font.family, style: font.style, confidence: 'high', widthError: 0, reason: 'override', kind };
  }
  const measures = options.measures || {};
  const candidates = collectFontCandidates(source, available, 20);
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const measured = measures[cand.family + '::' + cand.style] || {};
    const scored = scoreFontCandidate(source, cand, {
      width: measured.width,
      height: measured.height,
      pdfWidth: options.pdfWidth,
      pdfHeight: options.pdfHeight,
    }, kind);
    const confidence = confidenceFor(source, figmaFontDescriptor(cand), scored, kind, cand.rung);
    if (confidence === 'low') continue;
    if (!best || scored.score < best.score) {
      best = {
        family: cand.family,
        style: cand.style,
        confidence,
        widthError: scored.widthError,
        score: scored.score,
        reason: cand.rung,
        kind,
      };
    }
  }
  if (!best) return { family: '', style: '', confidence: 'low', widthError: 1, reason: 'no-credible-match', kind };
  return best;
}

export function isReliableTextExtract(str, fontMeta) {
  if (!isDecodedText(str)) return false;
  if (!fontMeta) return true;
  if (fontMeta.isType3Font || fontMeta.isInvalidPDFjsFont) return false;
  const composite = fontMeta.composite === true
    || /type0|cid/i.test(String(fontMeta.type || fontMeta.subtype || ''));
  const identity = /identity/i.test(String(fontMeta.encoding || fontMeta.cidEncoding || ''));
  if (composite && identity && fontMeta.hasToUnicode !== true) return false;
  return true;
}

function findBytes(haystack, needle, from = 0) {
  if (!needle.length || haystack.length < needle.length) return -1;
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function bytesToLatin1(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(haystackByte(bytes, i));
  return out;
}

function haystackByte(bytes, i) {
  return bytes[i];
}

export function indexPdfFontDicts(bytes) {
  const out = new Map();
  if (!bytes || !bytes.length) return out;
  const markers = [
    Uint8Array.from('/Type /Font', (ch) => ch.charCodeAt(0)),
    Uint8Array.from('/Type/Font', (ch) => ch.charCodeAt(0)),
  ];
  const endMarker = Uint8Array.from('>>', (ch) => ch.charCodeAt(0));
  const descriptor = Uint8Array.from('Descriptor', (ch) => ch.charCodeAt(0));
  for (const marker of markers) {
    let from = 0;
    while (from < bytes.length) {
      const at = findBytes(bytes, marker, from);
      if (at < 0) break;
      from = at + marker.length;
      if (findBytes(bytes, descriptor, from) === from) continue;
      const end = findBytes(bytes, endMarker, at);
      if (end < 0 || end - at > 1200) continue;
      const dict = bytesToLatin1(bytes, at, end + 2);
      if (!/\/Subtype\s*\//.test(dict)) continue;
      const base = dict.match(/\/BaseFont\s*\/([^\s/>]+)/);
      if (!base) continue;
      const subtype = (dict.match(/\/Subtype\s*\/([^\s/>]+)/) || [])[1] || '';
      const encoding = (dict.match(/\/Encoding\s*\/([^\s/>]+)/) || [])[1] || '';
      const parsed = parsePdfFontName(base[1]);
      const next = {
        subtype,
        encoding,
        hasToUnicode: /\/ToUnicode\b/.test(dict),
        composite: /Type0|CID/i.test(subtype),
        isType3Font: subtype === 'Type3',
      };
      const key = parsed.family.toLowerCase();
      const prev = out.get(key);
      if (!prev) {
        out.set(key, next);
        continue;
      }
      out.set(key, {
        subtype: prev.subtype === 'Type0' ? prev.subtype : next.subtype,
        encoding: /identity/i.test(prev.encoding) ? prev.encoding : next.encoding,
        hasToUnicode: prev.hasToUnicode || next.hasToUnicode,
        composite: prev.composite || next.composite,
        isType3Font: prev.isType3Font || next.isType3Font,
      });
    }
  }
  return out;
}

export function pdfTextLayout(item, viewport, style) {
  const tx = pdfMultiply(viewport.transform, item.transform);
  const fontSize = Math.hypot(tx[2], tx[3]);
  const angle = Math.atan2(tx[1], tx[0]);
  const ascentFrac = typeof style?.ascent === 'number' ? style.ascent : 0.8;
  return {
    x: tx[4],
    y: tx[5] - fontSize * ascentFrac,
    fontSize,
    angle,
    baseline: tx[5],
    width: typeof item.width === 'number' ? item.width * Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1) : fontSize * String(item.str || '').length * 0.5,
  };
}

export function isDecodedText(str) {
  if (!str || !String(str).trim()) return false;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10) || (code >= 0xE000 && code <= 0xF8FF)) return false;
  }
  return true;
}

export function composeTextLines(runs) {
  if (!runs.length) return [];
  const sorted = runs.slice().sort((a, b) => (a.baseline - b.baseline) || (a.x - b.x));
  const lines = [];
  let current = null;
  for (const run of sorted) {
    if (!current) {
      current = { ...run, characters: run.characters };
      continue;
    }
    const sameLine = Math.abs(run.baseline - current.baseline) <= Math.max(1, current.fontSize * 0.22)
      && Math.abs(run.fontSize - current.fontSize) <= 0.6
      && run.fontFamily === current.fontFamily
      && run.fontStyle === current.fontStyle
      && Math.abs(run.angle - current.angle) < 0.05;
    const gap = run.x - (current.x + current.width);
    if (sameLine && gap > -current.fontSize * 0.2 && gap < current.fontSize * 1.6) {
      const space = gap > current.fontSize * 0.18 ? ' ' : '';
      current.characters += space + run.characters;
      current.width = run.x + run.width - current.x;
      continue;
    }
    lines.push(current);
    current = { ...run, characters: run.characters };
  }
  if (current) lines.push(current);
  return lines;
}

export function imagePlacementFromCtm(ctm, viewport) {
  const m = pdfMultiply(viewport.transform, ctm);
  const p00 = pdfApply(m, 0, 0);
  const p10 = pdfApply(m, 1, 0);
  const p01 = pdfApply(m, 0, 1);
  const p11 = pdfApply(m, 1, 1);
  const wVec = { x: p10.x - p00.x, y: p10.y - p00.y };
  const hVec = { x: p01.x - p00.x, y: p01.y - p00.y };
  const width = Math.hypot(wVec.x, wVec.y);
  const height = Math.hypot(hVec.x, hVec.y);
  const shear = Math.abs(wVec.x * hVec.x + wVec.y * hVec.y) / (width * height || 1);
  const xs = [p00.x, p10.x, p01.x, p11.x];
  const ys = [p00.y, p10.y, p01.y, p11.y];
  const x = Math.min.apply(null, xs);
  const y = Math.min.apply(null, ys);
  return {
    x,
    y,
    w: Math.max.apply(null, xs) - x,
    h: Math.max.apply(null, ys) - y,
    width,
    height,
    rotation: Math.atan2(wVec.y, wVec.x) * 180 / Math.PI,
    sheared: shear > 0.08,
    insideRatio: 0,
  };
}

export function clipInsidePage(rect, viewport) {
  const x1 = Math.max(0, rect.x);
  const y1 = Math.max(0, rect.y);
  const x2 = Math.min(viewport.width, rect.x + rect.w);
  const y2 = Math.min(viewport.height, rect.y + rect.h);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = Math.max(1, rect.w * rect.h);
  return overlap / area;
}

export function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 1;
  }
  return count ? sum / (count * 3 * 255) : 1;
}

export const PDF_PATH_OPS = {
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
};

export function normalizePdfRgb(r, g, b) {
  let nr = Number(r);
  let ng = Number(g);
  let nb = Number(b);
  if (!Number.isFinite(nr) || !Number.isFinite(ng) || !Number.isFinite(nb)) return { r: 0, g: 0, b: 0 };
  if (nr > 1 || ng > 1 || nb > 1) {
    nr /= 255;
    ng /= 255;
    nb /= 255;
  }
  return {
    r: Math.max(0, Math.min(1, nr)),
    g: Math.max(0, Math.min(1, ng)),
    b: Math.max(0, Math.min(1, nb)),
  };
}

export function rgbCss(r, g, b) {
  const color = normalizePdfRgb(r, g, b);
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

export function colorsEqual(a, b) {
  return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b;
}

export function inferTextColors(opColors, itemCount) {
  if (!itemCount) return [];
  if (opColors.length === itemCount) return opColors;
  if (opColors.length === 0) return Array.from({ length: itemCount }, () => ({ r: 0, g: 0, b: 0 }));
  const first = opColors[0];
  if (opColors.every((color) => colorsEqual(color, first))) {
    return Array.from({ length: itemCount }, () => first);
  }
  return Array.from({ length: itemCount }, (_, index) => opColors[Math.min(index, opColors.length - 1)]);
}

export function gateTextGeometry(layout, viewport) {
      if (!layout || !(layout.fontSize >= 3)) return false;
      const maxSize = Math.min(viewport.width, viewport.height) * 0.22;
      if (layout.fontSize > maxSize) return false;
      if (Math.abs(layout.angle) > 0.2) return false;
  if (layout.x > viewport.width - 2 || layout.y > viewport.height - 2) return false;
  if (layout.y + layout.fontSize < 2) return false;
  if (layout.x + layout.fontSize < 2) return false;
  return true;
}

export function suppressionWorked(mean, tile) {
  return mean >= 0.002 && tile >= 0.02;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectOverlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

export function laterPaintOccludesRun(run, later) {
  if (!later || later.kind === 'path-stroke') return false;
  const runArea = Math.max(1, Number(run.w) * Number(run.h));
  return rectOverlapArea(run, later) / runArea >= 0.5;
}

export function laterPaintCoversText(textRects, laterRects) {
  return coveredTextRunIndices(textRects, laterRects).length > 0;
}

export function occurrenceSeq(id) {
  const match = String(id || '').match(/#(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function coveredTextRunIndices(textRects, laterRects) {
  if (!textRects.length || !laterRects.length) return [];
  const out = [];
  for (let i = 0; i < textRects.length; i++) {
    const run = textRects[i];
    const seq = Number(run.seq);
    const hit = laterRects.some((later) => {
      const after = Number(later.afterSeq);
      if (Number.isFinite(seq) && seq > 0 && Number.isFinite(after) && after < seq) return false;
      return laterPaintOccludesRun(run, later);
    });
    if (hit) out.push(i);
  }
  return out;
}

export function textRunPaintBox(run) {
  const fontSize = Number(run.fontSize) || 0;
  return {
    x: Number(run.x) || 0,
    y: Number(run.y) || 0,
    w: Math.max(Number(run.width) || 0, fontSize),
    h: fontSize * 1.2,
    pad: fontSize * 0.4,
  };
}

export function createPaintOccurrences(runs, scale) {
  const s = scale || 1;
  return (runs || []).map((run) => {
    const box = textRunPaintBox(run);
    return {
      remaining: Array.from(String(run.characters || '')),
      x: box.x * s,
      y: box.y * s,
      w: box.w * s,
      h: box.h * s,
      pad: box.pad * s,
    };
  }).filter((occ) => occ.remaining.length);
}

export function scaleRects(rects, scale) {
  const s = scale || 1;
  return (rects || []).map((rect) => ({
    x: rect.x * s,
    y: rect.y * s,
    w: rect.w * s,
    h: rect.h * s,
  }));
}

export function canvasTextDevicePoint(transform, x, y) {
  const a = Number(transform && transform.a) || 1;
  const b = Number(transform && transform.b) || 0;
  const c = Number(transform && transform.c) || 0;
  const d = Number(transform && transform.d) || 1;
  const e = Number(transform && transform.e) || 0;
  const f = Number(transform && transform.f) || 0;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function pointInPadded(px, py, box) {
  const pad = box.pad || 0;
  return px >= box.x - pad && px <= box.x + box.w + pad
    && py >= box.y - pad && py <= box.y + box.h + pad;
}

export function paintOccurrenceChars(occurrences) {
  return (occurrences || []).reduce((sum, occ) => sum + (occ.remaining ? occ.remaining.length : 0), 0);
}

export function matchPaintOccurrence(occurrences, leftoverRects, text, px, py) {
  const str = String(text ?? '');
  if (!str) return 'miss';
  const chars = Array.from(str);
  const inLeftover = (leftoverRects || []).some((rect) => pointInPadded(px, py, { ...rect, pad: rect.pad || 2 }));
  const hits = (occurrences || []).filter((occ) => occ.remaining && occ.remaining.length && pointInPadded(px, py, occ));
  if (inLeftover) return 'leftover';
  for (let i = 0; i < hits.length; i++) {
    const rem = hits[i].remaining.join('');
    if (rem.startsWith(str)) {
      hits[i].remaining = hits[i].remaining.slice(chars.length);
      return 'suppress';
    }
  }
  // ponytail: uniform run boxes, not glyph advances. fontChar may differ from extracted Unicode — consume one slot by position. Upgrade: per-glyph widths from the text matrix.
  if (hits.length && chars.length === 1) {
    hits[0].remaining.shift();
    return 'suppress';
  }
  return 'miss';
}

export function suppressionCoverage(consumed, expected) {
  return expected > 0 && consumed >= expected * 0.8;
}

export function normalizeMatchText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

function joinFragmentTexts(frags) {
  const strs = (frags || []).map((frag) => String(frag.characters || frag.str || ''));
  let hyphen = '';
  for (const piece of strs) {
    if (!hyphen) {
      hyphen = piece;
      continue;
    }
    hyphen = hyphen.endsWith('-') && /^\S/.test(piece) ? hyphen.slice(0, -1) + piece : hyphen + piece;
  }
  return [strs.join(''), strs.join(' '), hyphen].map(normalizeMatchText);
}

export function matchOccurrencesToFragments(occurrences, fragments, scale) {
  const s = scale || 1;
  const unused = (fragments || []).map((frag, index) => ({ frag, index })).filter((row) => {
    const chars = String(row.frag.characters || row.frag.str || '');
    return !!chars && row.frag.reliable !== false;
  });
  const usedFrag = new Set();
  const matches = [];
  for (const occ of occurrences || []) {
    if (!occ || !occ.suppressible || !occ.unicode) continue;
    const want = normalizeMatchText(occ.unicode);
    if (!want) continue;
    const oy = Number(occ.y) || 0;
    const ox = Number(occ.x) || 0;
    const tol = Math.max(4 * s, (Number(occ.fontSize) || 12) * 0.5);
    const pool = unused.filter((row) => {
      if (usedFrag.has(row.index)) return false;
      const layout = row.frag.layout || row.frag;
      const baseline = typeof layout.baseline === 'number' ? layout.baseline : (Number(layout.y) || 0) + (Number(layout.fontSize) || 0) * 0.8;
      return Math.abs(baseline * s - oy) <= tol;
    }).sort((a, b) => a.index - b.index);
    let found = null;
    let bestStart = Infinity;
    for (let i = 0; i < pool.length && !found; i++) {
      const seq = [];
      for (let j = i; j < pool.length; j++) {
        if (seq.length && pool[j].index !== seq[seq.length - 1].index + 1) break;
        seq.push(pool[j]);
        if (joinFragmentTexts(seq.map((row) => row.frag)).includes(want)) {
          const startX = Math.abs(((Number((seq[0].frag.layout || seq[0].frag).x) || 0) * s) - ox);
          if (startX <= Math.max(tol * 3, (Number(occ.width) || Number(occ.fontSize) || 12))) {
            found = seq;
            break;
          }
          if (startX < bestStart) bestStart = startX;
        }
        const glued = normalizeMatchText(seq.map((row) => String(row.frag.characters || row.frag.str || '')).join(''));
        if (glued.length > want.length + 6) break;
      }
    }
    if (!found) continue;
    found.forEach((row) => usedFrag.add(row.index));
    matches.push({ occ, id: occ.id, fragments: found.map((row) => row.frag) });
  }
  return matches;
}

export function matchRunsToOccurrences(runs, occurrences, scale) {
  const s = scale || 1;
  const unused = (occurrences || []).filter((occ) => occ && occ.suppressible && occ.unicode);
  const used = new Set();
  const matches = [];
  for (const run of runs || []) {
    const chars = String(run.characters || '');
    if (!chars) continue;
    const baseline = typeof run.baseline === 'number' ? run.baseline : (Number(run.y) || 0) + (Number(run.fontSize) || 0) * 0.8;
    const rx = (Number(run.x) || 0) * s;
    const ry = baseline * s;
    const tol = Math.max(2 * s, (Number(run.fontSize) || 0) * 0.35 * s);
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < unused.length; i++) {
      const occ = unused[i];
      if (used.has(occ.id) || occ.unicode !== chars) continue;
      const dist = Math.hypot((Number(occ.x) || 0) - rx, (Number(occ.y) || 0) - ry);
      if (dist < bestDist) {
        bestDist = dist;
        best = occ;
      }
    }
    if (best && bestDist <= tol) {
      used.add(best.id);
      matches.push({ run, id: best.id, dist: bestDist });
    }
  }
  return matches;
}

export function rectMeanAbsDiff(a, b, width, height, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      count += 1;
    }
  }
  return count ? sum / (count * 3 * 255) : 0;
}

function quantizedModeColor(data, width, height, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  const counts = new Map();
  let best = 0;
  let bestKey = (15 << 8) | (15 << 4) | 15;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      if (next > best) {
        best = next;
        bestKey = key;
      }
    }
  }
  return {
    r: ((bestKey >> 8) & 15) * 17,
    g: ((bestKey >> 4) & 15) * 17,
    b: (bestKey & 15) * 17,
  };
}

export function inkFraction(data, width, height, rect, bg, tol = 28) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  let ink = 0;
  let count = 0;
  const limit = tol * 3;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      count += 1;
      if (Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) > limit) ink += 1;
    }
  }
  return count ? ink / count : 0;
}

export function promotedRunRemoved(full, suppressed, width, height, run, scale) {
  const s = scale || 1;
  const box = textRunPaintBox(run);
  const rect = {
    x: box.x * s,
    y: box.y * s,
    w: Math.max(1, box.w * s),
    h: Math.max(1, box.h * s),
  };
  if (rectMeanAbsDiff(full, suppressed, width, height, rect) < 0.008) return false;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let changed = 0;
  const unchanged = [];
  const changedAt = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const d = Math.abs(full[i] - suppressed[i]) + Math.abs(full[i + 1] - suppressed[i + 1]) + Math.abs(full[i + 2] - suppressed[i + 2]);
      if (d > 40) {
        cr += full[i];
        cg += full[i + 1];
        cb += full[i + 2];
        changed += 1;
        changedAt.push(i);
      } else {
        unchanged.push(i);
      }
    }
  }
  if (changed < 8) return false;
  cr /= changed;
  cg /= changed;
  cb /= changed;
  const far = [];
  for (let n = 0; n < unchanged.length; n++) {
    const i = unchanged[n];
    if (Math.abs(suppressed[i] - cr) + Math.abs(suppressed[i + 1] - cg) + Math.abs(suppressed[i + 2] - cb) > 80) {
      far.push(i);
    }
  }
  const bgSamples = far.length ? far : unchanged;
  const bg = { r: 255, g: 255, b: 255 };
  if (bgSamples.length) {
    const counts = new Map();
    let best = 0;
    let bestKey = (15 << 8) | (15 << 4) | 15;
    for (let n = 0; n < bgSamples.length; n++) {
      const i = bgSamples[n];
      const key = ((suppressed[i] >> 4) << 8) | ((suppressed[i + 1] >> 4) << 4) | (suppressed[i + 2] >> 4);
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      if (next > best) {
        best = next;
        bestKey = key;
      }
    }
    bg.r = ((bestKey >> 8) & 15) * 17;
    bg.g = ((bestKey >> 4) & 15) * 17;
    bg.b = (bestKey & 15) * 17;
  }
  const vx = cr - bg.r;
  const vy = cg - bg.g;
  const vz = cb - bg.b;
  const denom = vx * vx + vy * vy + vz * vz;
  if (denom < 64) return false;
  let original = 0;
  let leftover = 0;
  for (let n = 0; n < changedAt.length; n++) {
    const i = changedAt[n];
    const fullT = ((full[i] - bg.r) * vx + (full[i + 1] - bg.g) * vy + (full[i + 2] - bg.b) * vz) / denom;
    if (fullT <= 0.35) continue;
    original += 1;
    const supT = ((suppressed[i] - bg.r) * vx + (suppressed[i + 1] - bg.g) * vy + (suppressed[i + 2] - bg.b) * vz) / denom;
    if (supT > 0.12) leftover += 1;
  }
  return original > 0 && leftover <= original * 0.08;
}

export function tileDiff(a, b, width, height, x0, y0, tile) {
  const x1 = Math.min(width, x0 + tile);
  const y1 = Math.min(height, y0 + tile);
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      count += 1;
    }
  }
  return count ? sum / (count * 3 * 255) : 0;
}

export function tileMaxDiff(a, b, width, height, tile = 32) {
  let worst = 0;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const diff = tileDiff(a, b, width, height, x, y, tile);
      if (diff > worst) worst = diff;
    }
  }
  return worst;
}

export function verifyCandidate(ref, cand, width, height, textBounds, tile = 32) {
  const mean = meanAbsDiff(ref, cand);
  let worstGraphics = 0;
  const bounds = textBounds || [];
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const rect = { x, y, w: Math.min(tile, width - x), h: Math.min(tile, height - y) };
      if (bounds.some((bound) => rectsOverlap(rect, bound))) continue;
      const diff = tileDiff(ref, cand, width, height, x, y, tile);
      if (diff > worstGraphics) worstGraphics = diff;
    }
  }
  let worstText = 0;
  for (let i = 0; i < bounds.length; i++) {
    const diff = rectMeanAbsDiff(ref, cand, width, height, bounds[i]);
    if (diff > worstText) worstText = diff;
  }
  return {
    pass: worstGraphics <= 0.25 && (bounds.length ? worstText <= 0.5 : true),
    mean,
    worstGraphics,
    worstText,
  };
}

function luma01(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function measureChangedInk(from, to, width, height, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const d = Math.abs(from[i] - to[i]) + Math.abs(from[i + 1] - to[i + 1]) + Math.abs(from[i + 2] - to[i + 2]);
      if (d < 36) continue;
      count += 1;
      sx += x;
      sy += y;
      sr += from[i];
      sg += from[i + 1];
      sb += from[i + 2];
    }
  }
  return {
    count,
    x: count ? sx / count : (x0 + x1) / 2,
    y: count ? sy / count : (y0 + y1) / 2,
    r: count ? sr / count / 255 : 1,
    g: count ? sg / count / 255 : 1,
    b: count ? sb / count / 255 : 1,
  };
}

export function textRunVerifyBound(run, scale) {
  const s = scale || 1;
  const fontSize = Number(run.fontSize) || 0;
  const width = Math.max(Number(run.width) || 0, fontSize * Math.max(1, String(run.characters || '').length * 0.35));
  return {
    x: (Number(run.x) || 0) * s,
    y: (Number(run.y) || 0) * s,
    w: Math.max(8 * s, width * s),
    h: Math.max(8 * s, fontSize * 1.4 * s),
  };
}

export const VERIFY_AA_PAD = 2;

export function scalePageRect(bound, scale) {
  const s = scale || 1;
  return {
    x: Number(bound.x) * s,
    y: Number(bound.y) * s,
    w: Number(bound.w != null ? bound.w : bound.width) * s,
    h: Number(bound.h != null ? bound.h : bound.height) * s,
  };
}

export function padRect(rect, pad) {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

export function pageRectFromBound(bound) {
  return {
    x: Number(bound.x) || 0,
    y: Number(bound.y) || 0,
    w: Number(bound.w != null ? bound.w : bound.width) || 0,
    h: Number(bound.h != null ? bound.h : bound.height) || 0,
  };
}

export function figmaExcludeBounds(sourcePageRects, actualPageRects, figmaScale, pad = VERIFY_AA_PAD) {
  const out = [];
  (sourcePageRects || []).forEach((rect) => out.push(padRect(scalePageRect(rect, figmaScale), pad)));
  (actualPageRects || []).forEach((rect) => out.push(padRect(scalePageRect(rect, figmaScale), pad)));
  return out;
}

export function figmaGraphicsDiff(background, candidate, width, height, excludeBounds, tile = 32) {
  let worst = 0;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const rect = { x, y, w: Math.min(tile, width - x), h: Math.min(tile, height - y) };
      if ((excludeBounds || []).some((bound) => rectsOverlap(rect, bound))) continue;
      const diff = tileDiff(background, candidate, width, height, x, y, tile);
      if (diff > worst) worst = diff;
    }
  }
  return worst;
}

function scorePromotedRun(run, removed, added, pdfScale, figmaScale) {
  const fontSize = Math.max(1, Number(run.fontSize) || 0);
  const minRemoved = Math.max(3, Math.round(fontSize * pdfScale * 0.12));
  const minAdded = Math.max(3, Math.round(fontSize * figmaScale * 0.12));
  const expected = normalizePdfRgb((run.color && run.color.r) || 0, (run.color && run.color.g) || 0, (run.color && run.color.b) || 0);
  const expectedLuma = luma01(expected.r, expected.g, expected.b);
  const addedLuma = luma01(added.r, added.g, added.b);
  const removedLuma = luma01(removed.r, removed.g, removed.b);
  const delta = centroidDeltaPage(removed, added, pdfScale, figmaScale);
  let reason = '';
  if (removed.count < minRemoved) reason = 'source glyph not removed';
  else if (added.count < minAdded) reason = 'missing Figma text';
  else if (Math.hypot(delta.dx, delta.dy) > fontSize * 0.9) reason = 'displaced text';
  else if (added.count < removed.count * 0.18 || added.count > removed.count * 8) reason = 'ink amount mismatch';
  else if (expectedLuma < 0.55 && addedLuma > 0.82) reason = 'blank or white text';
  else if (expectedLuma < 0.55 && removedLuma < 0.55 && addedLuma - removedLuma > 0.45) reason = 'blank or white text';
  return { reason, dx: delta.dx, dy: delta.dy, removed: removed.count, added: added.count };
}

export function centroidDeltaPage(removed, added, pdfScale, figmaScale) {
  const ps = pdfScale || 1;
  const fs = figmaScale || 1;
  return {
    dx: (Number(removed.x) || 0) / ps - (Number(added.x) || 0) / fs,
    dy: (Number(removed.y) || 0) / ps - (Number(added.y) || 0) / fs,
  };
}

export function boundForOccurrence(actualBounds, occurrenceId) {
  const id = String(occurrenceId || '');
  if (!id) return null;
  return (actualBounds || []).find((bound) => String(bound.occurrenceId || '') === id) || null;
}

export function acceptedOccurrenceIds(runResults) {
  return (runResults || []).filter((row) => row && row.occurrenceId && !row.reason).map((row) => row.occurrenceId);
}

export function finalSuppressIds(acceptedIds) {
  return (acceptedIds || []).filter(Boolean);
}

export function verifyImportCandidate(opts) {
  const full = opts.full;
  const suppressed = opts.suppressed;
  const background = opts.background;
  const candidate = opts.candidate;
  const pdfWidth = opts.pdfWidth;
  const pdfHeight = opts.pdfHeight;
  const figWidth = opts.figWidth;
  const figHeight = opts.figHeight;
  const runs = opts.runs || [];
  const actualBounds = opts.actualBounds || [];
  const scale = opts.scale || 1;
  const figmaScale = opts.figmaScale || scale;
  const mean = meanAbsDiff(background, candidate);
  let worstText = 0;
  const runResults = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const sourceBound = textRunVerifyBound(run, scale);
    const matched = boundForOccurrence(actualBounds, run.occurrenceId);
    const figmaBound = matched
      ? scalePageRect(pageRectFromBound(matched), figmaScale)
      : { x: 0, y: 0, w: 0, h: 0 };
    const textDiff = matched ? rectMeanAbsDiff(background, candidate, figWidth, figHeight, figmaBound) : 1;
    if (textDiff > worstText) worstText = textDiff;
    const removed = measureChangedInk(full, suppressed, pdfWidth, pdfHeight, sourceBound);
    const added = matched
      ? measureChangedInk(candidate, background, figWidth, figHeight, figmaBound)
      : { count: 0, x: 0, y: 0, r: 1, g: 1, b: 1 };
    const scored = matched
      ? scorePromotedRun(run, removed, added, scale, figmaScale)
      : { reason: 'missing Figma text', dx: 0, dy: 0, removed: removed.count, added: 0 };
    runResults.push({
      occurrenceId: run.occurrenceId || '',
      characters: String(run.characters || '').slice(0, 48),
      reason: scored.reason,
      dx: scored.dx,
      dy: scored.dy,
      removed: scored.removed,
      added: scored.added,
    });
  }
  const failedRuns = runResults.filter((row) => row.reason);
  const acceptedIds = acceptedOccurrenceIds(runResults);
  const moves = runResults.filter((row) => row.reason === 'displaced text').map((row) => ({
    occurrenceId: row.occurrenceId,
    dx: row.dx,
    dy: row.dy,
  }));
  const reason = failedRuns.length
    ? failedRuns[0].reason + ' · "' + failedRuns[0].characters + '"'
    : '';
  return {
    pass: failedRuns.length === 0,
    mean,
    worstGraphics: 0,
    worstText,
    failedRuns,
    runResults,
    acceptedIds,
    rejected: failedRuns,
    moves,
    reason,
  };
}

export function chooseEditableMode(signals) {
  const promoted = signals.gatedCount || 0;
  const leftover = signals.unpromotedVisibleCount || 0;
  if (signals.textRenderModeNonFill) {
    return { mode: 'raster', reason: 'text clip or stroke' };
  }
  if (promoted > 0 && (signals.colorsUnusable || signals.paintAfterText)) {
    return { mode: 'raster', reason: signals.paintAfterText ? 'text is not topmost' : 'text failed gates' };
  }
  const graphicsCount = (signals.simplePathCount || 0) + (signals.imageCount || 0);
  const svgOk = !signals.complex
    && !signals.clipUsed
    && !signals.complexPath
    && leftover === 0
    && !signals.fontTextUnpromoted
    && (signals.pathSegs || 0) <= 8000
    && (signals.imageCount || 0) <= 40
    && (graphicsCount > 0 || promoted > 0);
  if (svgOk) return { mode: 'svg', reason: graphicsCount ? 'simple paths and images' : 'gated text' };
  if (promoted > 0 && signals.suppressionOk) {
    return { mode: 'text', reason: leftover ? 'gated text over page image' : 'gated text over suppressed page image' };
  }
  return { mode: 'raster', reason: 'page image fallback' };
}

export const EDITABLE_UNSAFE_TEXT_LABEL =
  "Preserved as an image because this page's text could not be safely separated from its artwork.";

export function editableRasterKind(decodedCount, textOpCount) {
  if ((decodedCount || 0) > 0 || (textOpCount || 0) > 0) return 'unsafe-text';
  return 'no-text';
}

function svgPoint(matrix, x, y) {
  const p = pdfApply(matrix, x, y);
  return `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
}

export function pathDFromConstruct(ops, coords, matrix) {
  let d = '';
  let j = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] | 0;
    if (op === PDF_PATH_OPS.rectangle) {
      const rx = coords[j++];
      const ry = coords[j++];
      const w = coords[j++];
      const h = coords[j++];
      d += `M${svgPoint(matrix, rx, ry)}L${svgPoint(matrix, rx + w, ry)}L${svgPoint(matrix, rx + w, ry + h)}L${svgPoint(matrix, rx, ry + h)}Z`;
      x = rx;
      y = ry;
    } else if (op === PDF_PATH_OPS.moveTo) {
      x = coords[j++];
      y = coords[j++];
      d += `M${svgPoint(matrix, x, y)}`;
    } else if (op === PDF_PATH_OPS.lineTo) {
      x = coords[j++];
      y = coords[j++];
      d += `L${svgPoint(matrix, x, y)}`;
    } else if (op === PDF_PATH_OPS.curveTo) {
      const x1 = coords[j++];
      const y1 = coords[j++];
      const x2 = coords[j++];
      const y2 = coords[j++];
      x = coords[j++];
      y = coords[j++];
      d += `C${svgPoint(matrix, x1, y1)} ${svgPoint(matrix, x2, y2)} ${svgPoint(matrix, x, y)}`;
    } else if (op === PDF_PATH_OPS.curveTo2) {
      const x2 = coords[j++];
      const y2 = coords[j++];
      const x3 = coords[j++];
      const y3 = coords[j++];
      d += `C${svgPoint(matrix, x, y)} ${svgPoint(matrix, x2, y2)} ${svgPoint(matrix, x3, y3)}`;
      x = x3;
      y = y3;
    } else if (op === PDF_PATH_OPS.curveTo3) {
      const x1 = coords[j++];
      const y1 = coords[j++];
      x = coords[j++];
      y = coords[j++];
      d += `C${svgPoint(matrix, x1, y1)} ${svgPoint(matrix, x, y)} ${svgPoint(matrix, x, y)}`;
    } else if (op === PDF_PATH_OPS.closePath) {
      d += 'Z';
    } else {
      return null;
    }
  }
  return d;
}

export function buildSvgMarkup(width, height, nodes) {
  let body = '';
  for (const node of nodes) {
    if (node.type === 'path') {
      const widthAttr = node.stroke ? ` stroke-width="${node.strokeWidth || 1}"` : '';
      const rule = node.evenodd ? ' fill-rule="evenodd"' : '';
      body += `<path d="${node.d}" fill="${node.fill || 'none'}" stroke="${node.stroke || 'none'}"${widthAttr}${rule}/>`;
    } else if (node.type === 'image' && node.imageBase64) {
      body += `<image href="data:image/png;base64,${node.imageBase64}" x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
