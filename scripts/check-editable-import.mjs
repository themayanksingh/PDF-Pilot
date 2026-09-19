#!/usr/bin/env node
import {
  pdfTextLayout,
  isDecodedText,
  parsePdfFontName,
  parsePdfFontIdentity,
  parseOpenTypeNames,
  fontFamilyCandidates,
  importRenderScaleForSize,
  isReliableTextExtract,
  indexPdfFontDicts,
  matchAvailableFont,
  pdfFontDescriptor,
  resolvePdfFont,
  collectFontCandidates,
  normalizeFamilyName,
  detectCategory,
  styleWeight,
  composeTextLines,
  imagePlacementFromCtm,
  clipInsidePage,
  gateTextGeometry,
  inferTextColors,
  laterPaintCoversText,
  coveredTextRunIndices,
  createPaintOccurrences,
  canvasTextDevicePoint,
  matchPaintOccurrence,
  matchRunsToOccurrences,
  matchOccurrencesToFragments,
  paintOccurrenceChars,
  promotedRunRemoved,
  suppressionCoverage,
  pathDFromConstruct,
  buildSvgMarkup,
  chooseEditableMode,
  editableRasterKind,
  verifyCandidate,
  verifyImportCandidate,
  centroidDeltaPage,
  boundForOccurrence,
  acceptedOccurrenceIds,
  finalSuppressIds,
  normalizePdfRgb,
  rgbCss,
  suppressionWorked,
  PDF_PATH_OPS,
} from './editable-import-core.mjs';

function assertClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 0.05) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const viewport = { transform: [1, 0, 0, -1, 0, 841.89], width: 595.276, height: 841.89 };
const text = pdfTextLayout({ transform: [10, 0, 0, 10, 100, 200], str: 'A', width: 10 }, viewport, { ascent: 0.8 });
assertClose(text.fontSize, 10, 'fontSize');
assertClose(text.x, 100, 'text x');
assertClose(text.y, 641.89 - 8, 'text y uses ascent, not a full em');

const scaled = pdfTextLayout({ transform: [20, 0, 0, 10, 0, 100], str: 'A' }, viewport, { ascent: 0.8 });
assertClose(scaled.fontSize, 10, 'horizontally scaled text uses the second column');

if (!isDecodedText('¥')) throw new Error('yen is a real character');
if (isDecodedText('\uFFFD')) throw new Error('replacement char is not decoded');

const font = matchAvailableFont('Helvetica', 'Bold', [
  { family: 'Arial', style: 'Regular' },
  { family: 'Arial', style: 'Bold' },
]);
if (!font || font.family !== 'Arial' || font.style !== 'Bold') throw new Error('Helvetica maps to Arial Bold');
if (matchAvailableFont('Futura', 'Book', [{ family: 'Inter', style: 'Regular' }])) {
  throw new Error('missing PDF font must not silently become Inter');
}
const emptyListHelvetica = matchAvailableFont('Helvetica', 'Bold', []);
if (!emptyListHelvetica || emptyListHelvetica.family !== 'Arial') {
  throw new Error('standard PDF fonts must still map when the Figma font list is empty');
}
const sfui = parsePdfFontName('YQIRVF+.SFUI-Regular_opsz13E65F_GRAD1900000_YAXS1900000_wght24');
if (sfui.family !== 'SFUI' || sfui.style !== 'Regular') {
  throw new Error(`SFUI variable name parse failed: ${JSON.stringify(sfui)}`);
}
const sfSemi = parsePdfFontName('.SFUI-Semibold');
if (sfSemi.family !== 'SFUI' || sfSemi.style !== 'Semibold') {
  throw new Error(`SFUI Semibold must not become Bold: ${JSON.stringify(sfSemi)}`);
}
const din = parsePdfFontName('WOMRVE+DINCondensed-Bold');
if (din.family !== 'DINCondensed' || din.style !== 'Bold') {
  throw new Error(`DIN parse failed: ${JSON.stringify(din)}`);
}
const sfMatch = matchAvailableFont('SFUI', 'Semibold', [
  { family: 'SF Pro', style: 'Regular' },
  { family: 'SF Pro', style: 'Semibold' },
]);
if (!sfMatch || sfMatch.family !== 'SF Pro' || sfMatch.style !== 'Semibold') {
  throw new Error('SFUI must map to SF Pro Semibold');
}
if (!isReliableTextExtract('漢字', { composite: true, encoding: 'Identity-H', hasToUnicode: true })) {
  throw new Error('CJK with ToUnicode is reliable');
}
if (isReliableTextExtract('㱺', { composite: true, encoding: 'Identity-H', hasToUnicode: false })) {
  throw new Error('Identity-H without ToUnicode is not a reliable extract');
}
const dicts = indexPdfFontDicts(Uint8Array.from(
  '64 0 obj <</Type /Font /Subtype /Type0 /Encoding /Identity-H /DescendantFonts [590 0 R ] /BaseFont /IBUJNB+.HiraKakuInterface-W6 >> endobj',
  (ch) => ch.charCodeAt(0)
));
const hira = dicts.get('hirakakuinterface');
if (!hira || hira.encoding !== 'Identity-H' || hira.hasToUnicode || !hira.composite) {
  throw new Error(`Type0 font dict scan failed: ${JSON.stringify(hira)}`);
}

const lines = composeTextLines([
  { characters: 'ABOUT', x: 10, y: 10, baseline: 20, width: 40, fontSize: 12, fontFamily: 'Arial', fontStyle: 'Bold', angle: 0 },
  { characters: 'THIS', x: 56, y: 10, baseline: 20, width: 32, fontSize: 12, fontFamily: 'Arial', fontStyle: 'Bold', angle: 0 },
]);
if (lines.length !== 1 || lines[0].characters !== 'ABOUT THIS') {
  throw new Error(`line compose failed: ${JSON.stringify(lines)}`);
}

const image = imagePlacementFromCtm([385.82, 0, 0, 317.04, 181.11, 93.5], viewport);
assertClose(image.width, 385.82, 'image width');
if (image.sheared) throw new Error('axis-aligned image is not sheared');
if (clipInsidePage({ x: -100, y: -100, w: 10, h: 10 }, viewport) > 0.01) {
  throw new Error('off-page image must not count as inside');
}

if (gateTextGeometry({ ...text, angle: 0.4 }, viewport)) {
  throw new Error('rotated text must stay graphics');
}

const colors = inferTextColors([{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }], 3);
if (!colors || colors.length !== 3) throw new Error('uniform text color should expand');
if (inferTextColors([{ r: 0, g: 0, b: 0 }, { r: 1, g: 0, b: 0 }], 3).length !== 3) {
  throw new Error('mismatched text colors should still assign a color');
}

const d = pathDFromConstruct(
  [PDF_PATH_OPS.rectangle],
  [10, 20, 30, 40],
  [1, 0, 0, -1, 0, 841.89],
);
if (!d || d[0] !== 'M') throw new Error('rectangle path');
const svg = buildSvgMarkup(100, 100, [{ type: 'path', d: 'M0 0H10V10Z', fill: '#000000' }]);
if (!svg.includes('viewBox="0 0 100 100"') || !svg.includes('M0 0H10V10Z')) {
  throw new Error('svg markup');
}

if (chooseEditableMode({
  fontTextUnpromoted: true,
  imageCount: 3,
}).mode !== 'raster') {
  throw new Error('font-drawn text must not be dropped to keep only images');
}
if (chooseEditableMode({ complex: true, visibleTextCount: 4, gatedCount: 4 }).mode !== 'raster') {
  throw new Error('complex pages without suppression stay raster');
}
if (chooseEditableMode({
  complex: true,
  visibleTextCount: 4,
  gatedCount: 4,
  suppressionOk: true,
}).mode !== 'text') {
  throw new Error('photos and transparency must not drop gated text');
}
if (chooseEditableMode({
  visibleTextCount: 2,
  gatedCount: 2,
  simplePathCount: 3,
  pathSegs: 8,
  imageCount: 1,
}).mode !== 'svg') {
  throw new Error('simple pages can be svg');
}
if (chooseEditableMode({
  visibleTextCount: 2,
  gatedCount: 1,
  unpromotedVisibleCount: 1,
  simplePathCount: 3,
  pathSegs: 8,
}).mode !== 'raster') {
  throw new Error('leftover glyphs must not use svg');
}
if (chooseEditableMode({
  visibleTextCount: 2,
  gatedCount: 1,
  unpromotedVisibleCount: 1,
  suppressionOk: true,
}).mode !== 'text') {
  throw new Error('gated text can promote next to leftover glyphs');
}
if (chooseEditableMode({
  visibleTextCount: 2,
  gatedCount: 2,
  paintAfterText: true,
}).mode !== 'raster') {
  throw new Error('covered text stays raster');
}
if (editableRasterKind(294, 314) !== 'unsafe-text') {
  throw new Error('gated-but-unplaced text is still unsafe to separate');
}
if (editableRasterKind(0, 0) !== 'no-text') {
  throw new Error('covers without text ops are ordinary images');
}
if (laterPaintCoversText(
  [{ x: 10, y: 10, w: 40, h: 12 }],
  [{ x: 200, y: 200, w: 10, h: 10 }],
)) {
  throw new Error('far-away paint must not count as covering text');
}
if (laterPaintCoversText(
  [{ x: 10, y: 10, w: 40, h: 12 }],
  [{ x: 20, y: 8, w: 10, h: 10 }],
)) {
  throw new Error('nearby path boxes that only graze a glyph must not count as occlusion');
}
if (!laterPaintCoversText(
  [{ x: 10, y: 10, w: 40, h: 12 }],
  [{ x: 10, y: 10, w: 40, h: 12 }],
)) {
  throw new Error('later paint that covers the glyph box is occlusion');
}
if (JSON.stringify(coveredTextRunIndices(
  [{ x: 10, y: 10, w: 40, h: 12, seq: 4 }, { x: 10, y: 10, w: 40, h: 12, seq: 1 }],
  [{ x: 10, y: 10, w: 40, h: 12, afterSeq: 2, kind: 'path-fill' }],
)) !== '[1]') {
  throw new Error('later paint must only occlude text that was already painted');
}
if (laterPaintCoversText(
  [{ x: 10, y: 10, w: 40, h: 12 }],
  [{ x: 10, y: 10, w: 40, h: 12, kind: 'path-stroke' }],
)) {
  throw new Error('later strokes are not a veil over text');
}

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const helloOcc = () => createPaintOccurrences([{
  characters: 'Hello', x: 10, y: 20, width: 50, fontSize: 12,
}], 1);
const leftoverHello = [{ x: 200, y: 20, w: 50, h: 14 }];
if (new Set(['Hello']).has('H')) throw new Error('control: whole-string Set must miss glyphs');
const glyphOcc = helloOcc();
['H', 'e', 'l', 'l', 'o'].forEach((ch, index) => {
  const pt = canvasTextDevicePoint(identity, 10 + index * 10, 28);
  if (matchPaintOccurrence(glyphOcc, leftoverHello, ch, pt.x, pt.y) !== 'suppress') {
    throw new Error(`glyph ${ch} at ${index} must match a Hello occurrence`);
  }
});
if (paintOccurrenceChars(glyphOcc) !== 0) throw new Error('all Hello glyphs should be consumed');
const leftoverOcc = helloOcc();
if (matchPaintOccurrence(leftoverOcc, leftoverHello, 'H', 205, 28) !== 'leftover') {
  throw new Error('rejected text at another location must stay painted');
}
if (paintOccurrenceChars(leftoverOcc) !== 5) {
  throw new Error('leftover glyphs must not consume gated occurrences');
}
const wholeOcc = helloOcc();
if (matchPaintOccurrence(wholeOcc, leftoverHello, 'Hello', 10, 28) !== 'suppress' || paintOccurrenceChars(wholeOcc) !== 0) {
  throw new Error('batched fillText of the whole run must still suppress');
}
const puaOcc = helloOcc();
if (matchPaintOccurrence(puaOcc, leftoverHello, '\uE020', 12, 28) !== 'suppress') {
  throw new Error('fontChar that is not extracted Unicode must still match by position');
}
if (suppressionCoverage(3, 5)) throw new Error('under-consumed glyphs are not suppressed');
if (!suppressionCoverage(4, 5)) throw new Error('exactly 80% coverage should pass');
const matched = matchRunsToOccurrences(
  [{ characters: 'Hello', x: 10, y: 20, baseline: 30, fontSize: 12, width: 50 }],
  [{ id: 'page#1', unicode: 'Hello', x: 10, y: 30, suppressible: true }, { id: 'page#2', unicode: 'Hello', x: 200, y: 30, suppressible: true }],
  1,
);
if (matched.length !== 1 || matched[0].id !== 'page#1') {
  throw new Error('repeated strings must match the nearest unused occurrence, not a padded box');
}
if (chooseEditableMode({
  visibleTextCount: 2,
  gatedCount: 2,
  clipUsed: true,
  simplePathCount: 4,
  pathSegs: 20,
  suppressionOk: true,
}).mode !== 'text') {
  throw new Error('clipped pages can still use suppressed raster plus text');
}

const same = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]);
if (!verifyCandidate(same, same, 2, 1, []).pass) throw new Error('identical pixels must pass');
const refPage = new Uint8Array(8 * 8 * 4).fill(255);
const holePage = refPage.slice();
for (let i = 0; i < 32; i++) holePage[i] = 0;
if (verifyCandidate(refPage, holePage, 8, 8, [{ x: 0, y: 0, w: 8, h: 1 }]).pass) {
  throw new Error('large text-region holes must fail verification');
}
const mildPage = refPage.slice();
mildPage[0] = 250;
mildPage[1] = 250;
mildPage[2] = 250;
if (!verifyCandidate(refPage, mildPage, 8, 8, [{ x: 0, y: 0, w: 8, h: 1 }]).pass) {
  throw new Error('small Figma text raster differences must pass');
}
if (suppressionWorked(0.0001, 0.001)) throw new Error('tiny diffs are not suppression');
if (!suppressionWorked(0.01, 0.08)) throw new Error('glyph-sized diffs count as suppression');

const runBox = { characters: 'Hi', x: 0, y: 0, width: 4, fontSize: 2 };
const white = new Uint8Array(8 * 8 * 4).fill(255);
const blackGlyph = white.slice();
for (let y = 0; y < 2; y++) {
  for (let x = 0; x < 4; x++) {
    const i = (y * 8 + x) * 4;
    blackGlyph[i] = blackGlyph[i + 1] = blackGlyph[i + 2] = 0;
  }
}
if (!promotedRunRemoved(blackGlyph, white, 8, 8, runBox, 1)) {
  throw new Error('fully cleared glyphs must count as removed');
}
const outlineLeft = white.slice();
for (let x = 0; x < 4; x++) {
  const i = x * 4;
  outlineLeft[i] = outlineLeft[i + 1] = outlineLeft[i + 2] = 40;
}
if (promotedRunRemoved(blackGlyph, outlineLeft, 8, 8, runBox, 1)) {
  throw new Error('leftover glyph outlines must not count as complete removal');
}
const banner = new Uint8Array(16 * 8 * 4);
for (let i = 0; i < banner.length; i += 4) {
  banner[i] = 200;
  banner[i + 1] = 16;
  banner[i + 2] = 16;
  banner[i + 3] = 255;
}
const titled = banner.slice();
for (let y = 0; y < 3; y++) {
  for (let x = 1; x < 12; x++) {
    const i = (y * 16 + x) * 4;
    titled[i] = titled[i + 1] = titled[i + 2] = 255;
  }
}
for (let x = 5; x < 10; x++) {
  const i = (7 * 16 + x) * 4;
  titled[i] = titled[i + 1] = titled[i + 2] = 0;
  banner[i] = banner[i + 1] = banner[i + 2] = 0;
}
if (!promotedRunRemoved(titled, banner, 16, 8, { characters: 'TITLE', x: 0, y: 0, width: 14, fontSize: 4 }, 1)) {
  throw new Error('white title on a red banner must count as removed even if nearby artwork stays');
}

if (!fontFamilyCandidates('DINCondensed').includes('DIN Condensed')) {
  throw new Error('DINCondensed must still alias to DIN Condensed');
}

function utf16be(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out.push((code >> 8) & 255, code & 255);
  }
  return out;
}
function u16a(n) { return [(n >> 8) & 255, n & 255]; }
function u32a(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
const famBytes = utf16be('DIN Condensed');
const styBytes = utf16be('Bold');
const nameRecords = [1, 2].flatMap((nameId, index) => {
  const length = index === 0 ? famBytes.length : styBytes.length;
  const offset = index === 0 ? 0 : famBytes.length;
  return [...u16a(3), ...u16a(1), ...u16a(0x0409), ...u16a(nameId), ...u16a(length), ...u16a(offset)];
});
const nameTable = [...u16a(0), ...u16a(2), ...u16a(6 + nameRecords.length), ...nameRecords, ...famBytes, ...styBytes];
const ot = Uint8Array.from([
  ...u32a(0x00010000), ...u16a(1), ...u16a(16), ...u16a(0), ...u16a(0),
  0x6E, 0x61, 0x6D, 0x65, ...u32a(0), ...u32a(28), ...u32a(nameTable.length),
  ...nameTable,
]);
const names = parseOpenTypeNames(ot);
if (names.family !== 'DIN Condensed' || names.style !== 'Bold') {
  throw new Error('OpenType name table parse failed: ' + JSON.stringify(names));
}
const embeddedIdentity = parsePdfFontIdentity('WOMRVE+DINCondensed-Bold', ot);
if (!embeddedIdentity.embedded || embeddedIdentity.family !== 'DIN Condensed' || embeddedIdentity.style !== 'Bold') {
  throw new Error('embedded PDF font identity should prefer the name table: ' + JSON.stringify(embeddedIdentity));
}

const subsetIdentity = parsePdfFontIdentity('WOMRVE+DINCondensed-Bold', Uint8Array.from([]));
if (subsetIdentity.family !== 'DINCondensed' || subsetIdentity.style !== 'Bold') {
  throw new Error('BaseFont identity must survive an empty embedded file: ' + JSON.stringify(subsetIdentity));
}
const lucknowScale = importRenderScaleForSize(1440, 810, 4);
if (lucknowScale * 1440 > 4096 + 0.01 || lucknowScale * 810 > 4096 + 0.01) {
  throw new Error('Figma import scale must keep both edges at most 4096, got ' + lucknowScale);
}

const rgbBytes = normalizePdfRgb(44, 46, 53);
if (Math.abs(rgbBytes.r - 44 / 255) > 0.0005 || Math.abs(rgbBytes.g - 46 / 255) > 0.0005 || Math.abs(rgbBytes.b - 53 / 255) > 0.0005) {
  throw new Error('byte RGB must become 0–1, got ' + JSON.stringify(rgbBytes));
}
if (rgbBytes.r >= 1 || rgbBytes.g >= 1 || rgbBytes.b >= 1) {
  throw new Error('[44,46,53] must never become white');
}
if (rgbCss(44, 46, 53).toLowerCase() !== '#2c2e35') {
  throw new Error('rgbCss must not multiply byte-range values by 255 again, got ' + rgbCss(44, 46, 53));
}
const alreadyUnit = normalizePdfRgb(0.1725, 0.1804, 0.2078);
if (Math.abs(alreadyUnit.r - 0.1725) > 0.0001) throw new Error('already-normalized RGB must stay in 0–1');

const futuraBook = parsePdfFontName('FuturaBT-Book');
if (futuraBook.family !== 'Futura' || futuraBook.style !== 'Book') {
  throw new Error('FuturaBT-Book must be Futura Book, got ' + JSON.stringify(futuraBook));
}
const futuraHeavy = parsePdfFontName('FuturaBT-Heavy');
if (futuraHeavy.family !== 'Futura' || futuraHeavy.style !== 'Heavy') {
  throw new Error('FuturaBT-Heavy must be Futura Heavy, got ' + JSON.stringify(futuraHeavy));
}
const futuraBold = parsePdfFontName('Futura-Bold');
if (futuraBold.family !== 'Futura' || futuraBold.style !== 'Bold') {
  throw new Error('Futura-Bold must be Futura Bold, got ' + JSON.stringify(futuraBold));
}
const bookToRegular = matchAvailableFont('Futura', 'Book', [
  { family: 'Futura', style: 'Bold' },
  { family: 'Futura', style: 'Regular' },
]);
if (!bookToRegular || bookToRegular.style !== 'Regular') {
  throw new Error('Book may use Regular, never the first family style: ' + JSON.stringify(bookToRegular));
}
if (matchAvailableFont('Futura', 'Book', [{ family: 'Futura', style: 'Bold' }])) {
  throw new Error('Book must not silently become Bold');
}

const bookDesc = pdfFontDescriptor({ family: 'Futura', style: 'Book', raw: 'FuturaBT-Book' }, 'Foreword');
if (bookDesc.family !== 'Futura' || bookDesc.weight !== 400 || bookDesc.italic) {
  throw new Error('Futura Book descriptor failed: ' + JSON.stringify(bookDesc));
}
if (bookDesc.category !== 'geometric-sans') throw new Error('Futura must be geometric-sans, got ' + bookDesc.category);
const installed = [
  { family: 'Futura', style: 'Bold' },
  { family: 'Futura', style: 'Regular' },
  { family: 'Futura', style: 'Medium' },
  { family: 'Inter', style: 'Regular' },
];
const bookResolved = resolvePdfFont(bookDesc, installed, { kind: 'body' });
if (bookResolved.family !== 'Futura' || bookResolved.style === 'Bold' || bookResolved.confidence === 'low') {
  throw new Error('Futura Book must auto-map to regular Futura, got ' + JSON.stringify(bookResolved));
}
const bookBoldOnly = resolvePdfFont(bookDesc, [{ family: 'Futura', style: 'Bold' }, { family: 'Inter', style: 'Regular' }], { kind: 'body' });
if (bookBoldOnly.style === 'Bold') throw new Error('Book must not resolve to Bold when Regular is missing');
const handDesc = pdfFontDescriptor({ family: 'GoodNotes', style: 'Regular', raw: 'GoodNotes-Hand' }, 'hello');
handDesc.category = 'handwriting';
const handResolved = resolvePdfFont(handDesc, [{ family: 'Inter', style: 'Regular' }, { family: 'Arial', style: 'Regular' }], { kind: 'handwriting' });
if (handResolved.confidence !== 'low' || handResolved.family) {
  throw new Error('handwriting must not become Inter, got ' + JSON.stringify(handResolved));
}
if (normalizeFamilyName('FuturaBT') !== 'Futura') throw new Error('FuturaBT must normalize to Futura');
if (normalizeFamilyName('ArialMT') !== 'Arial') throw new Error('ArialMT must normalize to Arial');
if (styleWeight('Book') !== 400 || styleWeight('Heavy') < 800) throw new Error('style weights are wrong');
const bdCn = parsePdfFontName('HelveticaNeueLTStd-BdCn');
if (bdCn.style !== 'Bold') throw new Error('BdCn must be Bold, got ' + JSON.stringify(bdCn));
const bdDesc = pdfFontDescriptor({ family: bdCn.family, style: bdCn.style, raw: 'HelveticaNeueLTStd-BdCn' }, 'Title');
if (bdDesc.weight < 700) throw new Error('BdCn must be bold weight, got ' + JSON.stringify(bdDesc));
if (bdDesc.width > 4) throw new Error('BdCn must be condensed, got width ' + bdDesc.width);
if (bookBoldOnly.confidence === 'high') throw new Error('unmeasured Inter must not be a high-confidence Futura substitute');
if (detectCategory('DIN Condensed', { width: 3 }) !== 'condensed-sans') throw new Error('DIN must be condensed-sans');
const cands = collectFontCandidates(bookDesc, installed, 20);
if (cands.some((font) => font.style === 'Bold')) throw new Error('Book candidate list must not include Bold');
if (!cands.some((font) => font.style === 'Regular' || font.style === 'Medium')) {
  throw new Error('Book candidates must include Regular or Medium');
}

const regularBytes = utf16be('Regular');
const bookNameRecords = [1, 2].flatMap((nameId, index) => {
  const length = index === 0 ? famBytes.length : regularBytes.length;
  const offset = index === 0 ? 0 : famBytes.length;
  return [...u16a(3), ...u16a(1), ...u16a(0x0409), ...u16a(nameId), ...u16a(length), ...u16a(offset)];
});
const bookNameTable = [...u16a(0), ...u16a(2), ...u16a(6 + bookNameRecords.length), ...bookNameRecords, ...famBytes, ...regularBytes];
const bookOt = Uint8Array.from([
  ...u32a(0x00010000), ...u16a(1), ...u16a(16), ...u16a(0), ...u16a(0),
  0x6E, 0x61, 0x6D, 0x65, ...u32a(0), ...u32a(28), ...u32a(bookNameTable.length),
  ...bookNameTable,
]);
const bookIdentity = parsePdfFontIdentity('FuturaBT-Book', bookOt);
if (bookIdentity.style !== 'Book') {
  throw new Error('OpenType Regular must not overwrite BaseFont Book: ' + JSON.stringify(bookIdentity));
}

const hyphenOcc = [{ id: 'page#1', unicode: 'architecture', x: 10, y: 30, fontSize: 12, width: 90, suppressible: true }];
const hyphenFrags = [
  { characters: 'architec-', layout: { x: 10, y: 20, baseline: 30, fontSize: 12, width: 50 }, reliable: true },
  { characters: 'ture', layout: { x: 62, y: 20, baseline: 30, fontSize: 12, width: 28 }, reliable: true },
];
const occOwned = matchOccurrencesToFragments(hyphenOcc, hyphenFrags, 1);
if (occOwned.length !== 1 || occOwned[0].fragments.length !== 2 || occOwned[0].id !== 'page#1') {
  throw new Error('hyphenated fragments must join to one showText occurrence: ' + JSON.stringify(occOwned));
}
const exactSplit = matchRunsToOccurrences(
  hyphenFrags.map((frag) => ({ characters: frag.characters, x: frag.layout.x, y: frag.layout.y, baseline: frag.layout.baseline, fontSize: 12, width: frag.layout.width })),
  hyphenOcc,
  1,
);
if (exactSplit.length !== 0) {
  throw new Error('exact item-to-occurrence equality must not own a split showText');
}

const inkW = 16;
const inkH = 8;
const paper = new Uint8Array(inkW * inkH * 4).fill(255);
const glyphs = paper.slice();
for (let y = 1; y < 4; y++) {
  for (let x = 1; x < 10; x++) {
    const i = (y * inkW + x) * 4;
    glyphs[i] = 44;
    glyphs[i + 1] = 46;
    glyphs[i + 2] = 53;
  }
}
const darkRun = [{ characters: 'Hi', x: 1, y: 1, width: 9, fontSize: 3, color: rgbBytes, occurrenceId: 'page#1' }];
const actualBound = [{ x: 1, y: 1, width: 9, height: 3, occurrenceId: 'page#1' }];
const blankVerify = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: paper,
  candidate: paper,
  figWidth: inkW,
  figHeight: inkH,
  runs: darkRun,
  actualBounds: actualBound,
  scale: 1,
  figmaScale: 1,
});
if (blankVerify.pass) throw new Error('blank candidate must fail per-run ink');
if (!/blank|missing|white/i.test(blankVerify.reason || '')) {
  throw new Error('blank candidate must name the text failure, got ' + blankVerify.reason);
}
const restoredVerify = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: paper,
  candidate: glyphs,
  figWidth: inkW,
  figHeight: inkH,
  runs: darkRun,
  actualBounds: actualBound,
  scale: 1,
  figmaScale: 1,
});
if (!restoredVerify.pass) {
  throw new Error('same-pipeline restored dark text must pass: ' + restoredVerify.reason);
}

const resampled = new Uint8Array(inkW * inkH * 4);
for (let i = 0; i < resampled.length; i += 4) {
  resampled[i] = 128;
  resampled[i + 1] = 128;
  resampled[i + 2] = 128;
  resampled[i + 3] = 255;
}
const figmaCand = resampled.slice();
for (let y = 1; y < 4; y++) {
  for (let x = 1; x < 10; x++) {
    const i = (y * inkW + x) * 4;
    figmaCand[i] = 44;
    figmaCand[i + 1] = 46;
    figmaCand[i + 2] = 53;
  }
}
const crossRenderer = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: resampled,
  candidate: figmaCand,
  figWidth: inkW,
  figHeight: inkH,
  runs: darkRun,
  actualBounds: actualBound,
  scale: 1,
  figmaScale: 1,
});
if (!crossRenderer.pass) {
  throw new Error('pdf.js vs resampled Figma pixels must not fail Figma graphics: ' + crossRenderer.reason);
}

const leak = glyphs.slice();
for (let y = 0; y < 4; y++) {
  for (let x = 12; x < 16; x++) {
    const i = (y * inkW + x) * 4;
    leak[i] = leak[i + 1] = leak[i + 2] = 0;
  }
}
const outside = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: paper,
  candidate: leak,
  figWidth: inkW,
  figHeight: inkH,
  runs: darkRun,
  actualBounds: actualBound,
  scale: 1,
  figmaScale: 1,
});
if (!outside.pass) {
  throw new Error('TextNode paint outside estimated rectangles must not reject the Figma pair: ' + outside.reason);
}

const shifted = paper.slice();
for (let y = 4; y < 7; y++) {
  for (let x = 1; x < 10; x++) {
    const i = (y * inkW + x) * 4;
    shifted[i] = 44;
    shifted[i + 1] = 46;
    shifted[i + 2] = 53;
  }
}
const shiftedVerify = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: paper,
  candidate: shifted,
  figWidth: inkW,
  figHeight: inkH,
  runs: darkRun,
  actualBounds: [{ x: 1, y: 4, width: 9, height: 3, occurrenceId: 'page#1' }],
  scale: 1,
  figmaScale: 1,
});
if (!shiftedVerify.moves.length || shiftedVerify.moves[0].dy >= 0) {
  throw new Error('displaced Figma text must request an upward move, got ' + JSON.stringify(shiftedVerify.moves));
}

const lowFigma = centroidDeltaPage({ x: 10, y: 10 }, { x: 10, y: 20 }, 1, 1);
if (lowFigma.dy >= 0) throw new Error('Figma text below the source glyph must move up, dy=' + lowFigma.dy);
const scaledDelta = centroidDeltaPage({ x: 20, y: 40 }, { x: 10, y: 20 }, 2, 1);
if (Math.abs(scaledDelta.dx) > 0.01 || Math.abs(scaledDelta.dy) > 0.01) {
  throw new Error('PDF/Figma scale conversion must cancel, got ' + JSON.stringify(scaledDelta));
}

const reversedBounds = [
  { x: 40, y: 1, width: 9, height: 3, occurrenceId: 'page#2' },
  { x: 1, y: 1, width: 9, height: 3, occurrenceId: 'page#1' },
];
if (!boundForOccurrence(reversedBounds, 'page#1') || boundForOccurrence(reversedBounds, 'page#1').x !== 1) {
  throw new Error('occurrenceId must match the TextNode bound, not array index');
}
if (boundForOccurrence(reversedBounds, 'page#9')) {
  throw new Error('unknown occurrenceId must not match a bound');
}

const secondRun = { characters: 'No', x: 12, y: 1, width: 4, fontSize: 3, color: rgbBytes, occurrenceId: 'page#2' };
const partial = verifyImportCandidate({
  full: glyphs,
  suppressed: paper,
  pdfWidth: inkW,
  pdfHeight: inkH,
  background: paper,
  candidate: glyphs,
  figWidth: inkW,
  figHeight: inkH,
  runs: [darkRun[0], secondRun],
  actualBounds: actualBound,
  scale: 1,
  figmaScale: 1,
});
if (partial.acceptedIds.join() !== 'page#1') {
  throw new Error('partial acceptance must keep the passing run, got ' + JSON.stringify(partial.acceptedIds));
}
if (!partial.rejected.some((row) => row.occurrenceId === 'page#2')) {
  throw new Error('partial acceptance must reject the missing run');
}
if (partial.pass) throw new Error('a rejected sibling run must not mark the whole candidate as pass');
const accepted = acceptedOccurrenceIds(partial.runResults);
if (accepted.join() !== 'page#1') throw new Error('acceptedOccurrenceIds mismatch: ' + accepted.join());
if (finalSuppressIds(accepted).join() !== 'page#1') {
  throw new Error('final suppress set must contain only accepted runs');
}

console.log('editable import math ok');
