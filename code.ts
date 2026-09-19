figma.showUI(__html__, { width: 480, height: 620, themeColors: true });
let pluginDebugMode = false;

void figma.clientStorage.getAsync('debug-mode')
  .then(value => {
    pluginDebugMode = value === true;
  })
  .catch(() => {
    pluginDebugMode = false;
  });

function emitPluginDebugLog(level: 'log' | 'warn' | 'error', args: unknown[]) {
  if (!pluginDebugMode) return;
  const [rawMessage, ...rest] = args;
  const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? '');
  const payload = rest.length === 0 ? undefined : (rest.length === 1 ? rest[0] : rest);
  figma.ui.postMessage({
    type: 'debug-log',
    source: 'plugin',
    level,
    timestamp: Date.now(),
    message,
    payload,
  });
}

function pluginLog(...args: unknown[]) {
  if (!pluginDebugMode) return;
  console.log('[PDF Pilot Plugin]', ...args);
  emitPluginDebugLog('log', args);
}

function pluginWarn(...args: unknown[]) {
  if (!pluginDebugMode) return;
  console.warn('[PDF Pilot Plugin]', ...args);
  emitPluginDebugLog('warn', args);
}

function pluginError(...args: unknown[]) {
  console.error('[PDF Pilot Plugin]', ...args);
  if (!pluginDebugMode) return;
  emitPluginDebugLog('error', args);
}

interface LinkInfo {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextNodeInfo {
  mappingKey: string;
  text: string;
  charCount: number;
  fontSize: number | "mixed";
  textAutoResize: string;
  width: number;
  height: number;
  truncated: boolean;
}

interface SettingsPayload {
  provider?: string;
  model?: string;
  apiKeyGemini?: string;
  apiKeyOpenai?: string;
  quotaProfile?: string;
  targetLanguages?: string[];
  debugMode?: boolean;
  enableTranslation?: boolean;
}

interface PdfImportPagePayload {
  pageNumber: number;
  width: number;
  height: number;
  imageBase64: string;
}

interface PdfEditableTextElement {
  type: 'text';
  characters: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  color: RGB;
  occurrenceId: string;
}

interface PdfEditableImageElement {
  type: 'image';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  imageBase64: string;
}

type PdfEditableElement = PdfEditableTextElement | PdfEditableImageElement;
type EditableImportMode = 'raster' | 'text' | 'svg';

interface PdfEditablePagePayload {
  pageNumber: number;
  width: number;
  height: number;
  mode: EditableImportMode;
  elements: PdfEditableElement[];
  fallbackImageBase64: string | null;
  backgroundImageBase64: string | null;
  svg: string | null;
  verifyScale: number;
  reason: string;
  userLabel: string;
  rasterKind: string;
}

interface EditableImportSession {
  groupFrame: FrameNode;
  fileName: string;
  nextX: number;
  nextY: number;
  rowHeight: number;
  maxWidth: number;
  created: number;
  total: number;
  layerCount: number;
  rasterCount: number;
  unsafeTextCount: number;
  viewportCenter: { x: number; y: number };
  fontCache: Map<string, FontName | null>;
}

interface PendingEditableVerify {
  session: EditableImportSession;
  pageFrame: FrameNode;
  page: PdfEditablePagePayload;
}

let editableImportSession: EditableImportSession | null = null;
let pendingEditableVerify: PendingEditableVerify | null = null;

interface ModelSpendBreakdown {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

interface SpendRunRecord {
  run_id: string;
  last_run_at: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  model_breakdown: ModelSpendBreakdown[];
}

interface SpendSummary {
  total_cost_usd: number;
  total_tokens: number;
  count: number;
}

const SPEND_RECENT_RUNS_KEY = 'spend-runs-v2';
const SPEND_ALL_TIME_SUMMARY_KEY = 'spend-all-time-summary-v1';
const SPEND_KNOWN_RUN_IDS_KEY = 'spend-known-run-ids-v1';
const SPEND_RECENT_RUN_LIMIT = 10;
const SPEND_KNOWN_RUN_IDS_LIMIT = 200;
const EXPORT_SCALE_KEY = 'export-scale';
const EXPORT_QUALITY_KEY = 'export-quality';
const IMPORT_QUALITY_KEY = 'import-quality';
const IMPORT_MODE_KEY = 'import-mode';
const IMPORT_FONT_OVERRIDES_KEY = 'import-font-overrides';
const VALID_EXPORT_SCALES = new Set([1, 1.5, 2, 3, 4, 5, 6]);
const VALID_EXPORT_QUALITIES = new Set(['best', 'recommended', 'smaller']);
const VALID_IMPORT_QUALITIES = new Set(['low', 'medium', 'high']);
const VALID_IMPORT_MODES = new Set(['image', 'editable']);
const IMPORT_PAGE_GAP = 80;
const IMPORT_MAX_ITEMS_PER_ROW = 20;
const EDITABLE_UNSAFE_TEXT_LABEL = "Preserved as an image because this page's text could not be safely separated from its artwork.";

function normalizeExportScale(value: unknown): number {
  const numeric = asNumber(value);
  return numeric !== null && VALID_EXPORT_SCALES.has(numeric) ? numeric : 2;
}

function normalizeExportQuality(value: unknown): string {
  const quality = asString(value);
  return quality && VALID_EXPORT_QUALITIES.has(quality) ? quality : 'recommended';
}

function normalizeImportQuality(value: unknown): string {
  const quality = asString(value);
  return quality && VALID_IMPORT_QUALITIES.has(quality) ? quality : 'medium';
}

function normalizeImportMode(value: unknown): string {
  const mode = asString(value);
  return mode && VALID_IMPORT_MODES.has(mode) ? mode : 'image';
}

function parseTargetLanguagesPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string') as string[];
}

function parsePdfImportPagesPayload(value: unknown): PdfImportPagePayload[] {
  if (!Array.isArray(value)) return [];
  const pages: PdfImportPagePayload[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const pageNumber = asNumber(obj.pageNumber);
    const width = asNumber(obj.width);
    const height = asNumber(obj.height);
    const imageBase64 = asString(obj.imageBase64);
    if (
      pageNumber === null ||
      width === null ||
      height === null ||
      !imageBase64 ||
      pageNumber < 1 ||
      width <= 0 ||
      height <= 0
    ) {
      continue;
    }
    pages.push({ pageNumber, width, height, imageBase64 });
  }
  return pages;
}

function parsePdfEditableElement(value: unknown): PdfEditableElement | null {
  const obj = asObject(value);
  if (!obj) return null;
  const type = asString(obj.type);
  if (type === 'text') {
    const characters = asString(obj.characters);
    const x = asNumber(obj.x);
    const y = asNumber(obj.y);
    const fontSize = asNumber(obj.fontSize);
    const fontFamily = asString(obj.fontFamily);
    if (!characters || !fontFamily || x === null || y === null || fontSize === null || fontSize <= 0) return null;
    return {
      type: 'text',
      characters,
      x,
      y,
      fontSize,
      fontFamily,
      fontStyle: asString(obj.fontStyle) || 'Regular',
      color: parseRgb(obj.color),
      occurrenceId: asString(obj.occurrenceId) || '',
    };
  }
  if (type === 'image') {
    const imageBase64 = asString(obj.imageBase64);
    const x = asNumber(obj.x);
    const y = asNumber(obj.y);
    const w = asNumber(obj.w);
    const h = asNumber(obj.h);
    if (!imageBase64 || x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
    return {
      type: 'image',
      name: makeSafeNodeName(asString(obj.name) || 'Image'),
      x,
      y,
      w,
      h,
      imageBase64,
    };
  }
  return null;
}

function parsePdfEditablePagePayload(value: unknown): PdfEditablePagePayload | null {
  const obj = asObject(value);
  if (!obj) return null;
  const pageNumber = asNumber(obj.pageNumber);
  const width = asNumber(obj.width);
  const height = asNumber(obj.height);
  if (pageNumber === null || width === null || height === null || pageNumber < 1 || width <= 0 || height <= 0) {
    return null;
  }
  const elements: PdfEditableElement[] = [];
  for (const item of asArray(obj.elements)) {
    const parsed = parsePdfEditableElement(item);
    if (parsed) elements.push(parsed);
  }
  const fallbackImageBase64 = asString(obj.fallbackImageBase64);
  const backgroundImageBase64 = asString(obj.backgroundImageBase64);
  const svg = asString(obj.svg);
  const verifyScale = asNumber(obj.verifyScale);
  return {
    pageNumber,
    width,
    height,
    mode: parseEditableImportMode(obj.mode),
    elements,
    fallbackImageBase64,
    backgroundImageBase64,
    svg,
    verifyScale: verifyScale && verifyScale > 0 ? verifyScale : 1,
    reason: asString(obj.reason) || 'page image fallback',
    userLabel: asString(obj.userLabel) || '',
    rasterKind: asString(obj.rasterKind) || '',
  };
}

function styleEquivalents(style: string): string[] {
  const wanted = style || 'Regular';
  const key = wanted.toLowerCase();
  if (key === 'book' || key === 'roman') return ['Book', 'Regular', 'Roman'];
  if (key === 'regular') return ['Regular', 'Roman', 'Book'];
  if (key === 'heavy') return ['Heavy', 'Bold', 'Black'];
  if (key === 'black') return ['Black', 'Heavy', 'Bold'];
  if (key === 'bold') return ['Bold', 'Heavy', 'Black'];
  if (key === 'semibold' || key === 'demibold' || key === 'demi') return ['Semibold', 'DemiBold', 'Demi', 'SemiBold'];
  return [wanted];
}

async function resolveImportFont(cache: Map<string, FontName | null>, family: string, style: string): Promise<FontName | null> {
  const key = `${family}::${style}`;
  if (cache.has(key)) return cache.get(key) || null;
  for (const nextStyle of styleEquivalents(style)) {
    const font = { family, style: nextStyle };
    try {
      await figma.loadFontAsync(font);
      cache.set(key, font);
      return font;
    } catch {
      // Missing fonts stay graphics; never substitute Inter or a random family style.
    }
  }
  cache.set(key, null);
  return null;
}

function placeImportedPageImage(pageFrame: FrameNode, width: number, height: number, imageBase64: string, name: string): void {
  const image = figma.createImage(figma.base64Decode(imageBase64));
  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(width, height);
  rect.x = 0;
  rect.y = 0;
  rect.fills = [{
    type: 'IMAGE',
    scaleMode: 'FILL',
    imageHash: image.hash,
  }];
  pageFrame.appendChild(rect);
}

function prepareImportSlot(session: EditableImportSession): void {
  if (session.created > 0 && session.created % IMPORT_MAX_ITEMS_PER_ROW === 0) {
    session.nextX = 0;
    session.nextY += session.rowHeight + IMPORT_PAGE_GAP;
    session.rowHeight = 0;
  }
}

function advanceImportGrid(session: EditableImportSession, width: number, height: number): void {
  session.nextX += width + IMPORT_PAGE_GAP;
  session.rowHeight = Math.max(session.rowHeight, height);
  session.maxWidth = Math.max(session.maxWidth, session.nextX - IMPORT_PAGE_GAP);
}

function parseFontOverrides(value: unknown): Record<string, { family: string; style: string }> {
  const obj = asObject(value);
  if (!obj) return {};
  const out: Record<string, { family: string; style: string }> = {};
  for (const key of Object.keys(obj)) {
    const row = asObject(obj[key]);
    const family = asString(row?.family);
    const style = asString(row?.style);
    if (family && style) out[key] = { family, style };
  }
  return out;
}

async function measureImportFontJobs(jobs: unknown[]): Promise<Array<{
  key: string;
  measures: Array<{ family: string; style: string; width: number; height: number }>;
}>> {
  const results: Array<{ key: string; measures: Array<{ family: string; style: string; width: number; height: number }> }> = [];
  for (const job of jobs) {
    const obj = asObject(job);
    const key = asString(obj?.key) || '';
    const sample = (asString(obj?.sample) || 'Hg').slice(0, 48);
    const fontSize = Math.max(1, asNumber(obj?.fontSize) || 12);
    const measures: Array<{ family: string; style: string; width: number; height: number }> = [];
    for (const cand of asArray(obj?.candidates).slice(0, 20)) {
      const font = asObject(cand);
      const family = asString(font?.family);
      const style = asString(font?.style) || 'Regular';
      if (!family) continue;
      try {
        await figma.loadFontAsync({ family, style });
        const text = figma.createText();
        text.fontName = { family, style };
        text.characters = sample;
        text.fontSize = fontSize;
        text.textAutoResize = 'WIDTH_AND_HEIGHT';
        text.x = -20000;
        text.y = -20000;
        measures.push({ family, style, width: text.width, height: text.height });
        text.remove();
      } catch {
        // Skip fonts Figma cannot load.
      }
    }
    results.push({ key, measures });
  }
  return results;
}

async function placeEditableText(pageFrame: FrameNode, session: EditableImportSession, page: PdfEditablePagePayload): Promise<{ placed: number; failed: number }> {
  let placed = 0;
  let failed = 0;
  for (const element of page.elements) {
    if (element.type !== 'text') continue;
    try {
      const font = await resolveImportFont(session.fontCache, element.fontFamily, element.fontStyle);
      if (!font) {
        failed += 1;
        console.log('[PDF Pilot]', 'Skipped PDF text', {
          page: page.pageNumber,
          family: element.fontFamily,
          style: element.fontStyle,
          reason: 'font not available',
        });
        continue;
      }
      const text = figma.createText();
      text.fontName = font;
      text.characters = element.characters;
      text.fontSize = element.fontSize;
      text.fills = [{ type: 'SOLID', color: element.color }];
      text.textAutoResize = 'WIDTH_AND_HEIGHT';
      text.x = element.x;
      text.y = element.y;
      if (element.occurrenceId) text.setPluginData('pdf-pilot-occurrence', element.occurrenceId);
      pageFrame.appendChild(text);
      placed += 1;
    } catch (error: unknown) {
      failed += 1;
      console.log('[PDF Pilot]', 'Skipped PDF text', {
        page: page.pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { placed, failed };
}

function clearFrameChildren(frame: FrameNode): void {
  for (const child of [...frame.children]) child.remove();
}

async function fillEditablePageFrame(pageFrame: FrameNode, session: EditableImportSession, page: PdfEditablePagePayload): Promise<'raster' | 'candidate'> {
  const hasText = page.elements.some((element) => element.type === 'text');
  const hasSvg = !!(page.svg && (page.svg.includes('<path') || page.svg.includes('<image')));
  if (page.mode === 'svg' && !hasSvg && !hasText) {
    if (page.fallbackImageBase64) {
      placeImportedPageImage(pageFrame, page.width, page.height, page.fallbackImageBase64, 'Page image');
    }
    return 'raster';
  }

  if (page.mode === 'svg') {
    try {
      let hasGraphics = false;
      if (page.svg && (page.svg.includes('<path') || page.svg.includes('<image'))) {
        const svgNode = figma.createNodeFromSvg(page.svg);
        svgNode.name = 'PDF graphics';
        svgNode.x = 0;
        svgNode.y = 0;
        pageFrame.appendChild(svgNode);
        hasGraphics = true;
      }
      const textResult = await placeEditableText(pageFrame, session, page);
      if (hasGraphics && (textResult.placed > 0 || !hasText)) return 'candidate';
    } catch (error: unknown) {
      pluginWarn('SVG import failed', { page: page.pageNumber, error: error instanceof Error ? error.message : String(error) });
    }
    clearFrameChildren(pageFrame);
  }

  if (page.mode === 'text' && page.backgroundImageBase64) {
    placeImportedPageImage(pageFrame, page.width, page.height, page.backgroundImageBase64, 'Page image');
    const textResult = await placeEditableText(pageFrame, session, page);
    if (textResult.placed > 0) return 'candidate';
    clearFrameChildren(pageFrame);
  }

  if (page.fallbackImageBase64) {
    placeImportedPageImage(pageFrame, page.width, page.height, page.fallbackImageBase64, 'Page image');
  }
  return 'raster';
}

function editablePageFrameName(session: EditableImportSession, page: PdfEditablePagePayload, layered: boolean): string {
  const prefix = `${session.fileName} / Page ${page.pageNumber} · ${layered ? page.mode : 'image'}`;
  if (layered) return prefix.slice(0, 140);
  if (page.rasterKind === 'unsafe-text' || page.userLabel) {
    return `${prefix} · text not separated from artwork`.slice(0, 140);
  }
  return prefix.slice(0, 140);
}

async function exportPagePng(pageFrame: FrameNode, scale: number): Promise<string> {
  const bytes = await pageFrame.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  });
  return figma.base64Encode(bytes);
}

function pageTextNodes(pageFrame: FrameNode): TextNode[] {
  return pageFrame.children.filter((child): child is TextNode => child.type === 'TEXT');
}

function parseVerifyMoves(value: unknown): Array<{ occurrenceId: string; dx: number; dy: number }> {
  const moves: Array<{ occurrenceId: string; dx: number; dy: number }> = [];
  for (const item of asArray(value)) {
    const obj = asObject(item);
    const occurrenceId = asString(obj?.occurrenceId);
    const dx = asNumber(obj?.dx);
    const dy = asNumber(obj?.dy);
    if (!occurrenceId || dx === null || dy === null) continue;
    moves.push({ occurrenceId, dx, dy });
  }
  return moves;
}

function parseIdList(value: unknown): string[] {
  const ids: string[] = [];
  for (const item of asArray(value)) {
    const id = asString(item);
    if (id) ids.push(id);
  }
  return ids;
}

function replacePageImageFill(pageFrame: FrameNode, width: number, height: number, imageBase64: string): void {
  const image = figma.createImage(figma.base64Decode(imageBase64));
  const existing = pageFrame.children.find((child) => child.type === 'RECTANGLE' && child.name === 'Page image');
  if (existing && existing.type === 'RECTANGLE') {
    existing.resize(width, height);
    existing.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    return;
  }
  placeImportedPageImage(pageFrame, width, height, imageBase64, 'Page image');
}

async function exportFigmaVerifyPair(pageFrame: FrameNode, scale: number): Promise<{
  backgroundPngBase64: string;
  candidatePngBase64: string;
  actualTextBounds: Array<{ x: number; y: number; width: number; height: number; characters: string; occurrenceId: string }>;
  exportWidth: number;
  exportHeight: number;
}> {
  const texts = pageTextNodes(pageFrame);
  const actualTextBounds = texts.map((node) => ({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    characters: node.characters,
    occurrenceId: node.getPluginData('pdf-pilot-occurrence') || '',
  }));
  try {
    for (const text of texts) text.visible = false;
    const backgroundPngBase64 = await exportPagePng(pageFrame, scale);
    for (const text of texts) text.visible = true;
    const candidatePngBase64 = await exportPagePng(pageFrame, scale);
    return {
      backgroundPngBase64,
      candidatePngBase64,
      actualTextBounds,
      exportWidth: Math.round(pageFrame.width * scale),
      exportHeight: Math.round(pageFrame.height * scale),
    };
  } finally {
    for (const text of texts) text.visible = true;
  }
}

function commitEditablePage(session: EditableImportSession, pageFrame: FrameNode, page: PdfEditablePagePayload, layered: boolean, failReason?: string): void {
  if (pageFrame.parent !== session.groupFrame) session.groupFrame.appendChild(pageFrame);
  const stage = layered
    ? 'accepted'
    : (failReason && failReason.indexOf('verification-rejected') === 0
      ? 'verification-rejected'
      : (failReason && failReason.indexOf('candidate-export-failure') === 0
        ? 'candidate-export-failure'
        : (failReason && failReason.indexOf('text-placement-failure') === 0
          ? 'text-placement-failure'
          : 'extraction-rejected')));
  const reason = layered ? page.reason : (failReason || page.reason);
  const userLabel = layered ? '' : (page.userLabel || ((page.rasterKind === 'unsafe-text' || page.elements.some((element) => element.type === 'text'))
    ? EDITABLE_UNSAFE_TEXT_LABEL
    : ''));
  pageFrame.name = editablePageFrameName(session, {
    ...page,
    userLabel,
    rasterKind: page.rasterKind || (userLabel ? 'unsafe-text' : page.rasterKind),
  }, layered);
  pageFrame.setPluginData('pdf-pilot-import', layered ? page.mode : 'raster');
  pageFrame.setPluginData('pdf-pilot-reason', reason);
  if (userLabel) pageFrame.setPluginData('pdf-pilot-label', userLabel);
  session.created += 1;
  if (layered) session.layerCount += 1;
  else {
    session.rasterCount += 1;
    if (page.rasterKind === 'unsafe-text' || userLabel) session.unsafeTextCount += 1;
  }
  console.log('[PDF Pilot]', `page ${page.pageNumber}`, {
    stage,
    mode: layered ? page.mode : 'raster',
    reason,
    userLabel,
    layered,
  });
  advanceImportGrid(session, page.width, page.height);
  figma.ui.postMessage({
    type: 'import-pdf-page-placed',
    completed: session.created,
    total: session.total,
    pageNumber: page.pageNumber,
    mode: layered ? page.mode : 'raster',
  });
}

async function postCandidateExport(pageFrame: FrameNode, page: PdfEditablePagePayload): Promise<void> {
  const pair = await exportFigmaVerifyPair(pageFrame, page.verifyScale || 1);
  console.log('[PDF Pilot]', `page ${page.pageNumber} figma-export`, {
    background: { width: pair.exportWidth, height: pair.exportHeight, bytes: pair.backgroundPngBase64.length },
    candidate: { width: pair.exportWidth, height: pair.exportHeight, bytes: pair.candidatePngBase64.length },
    actualTextBounds: pair.actualTextBounds,
  });
  figma.ui.postMessage({
    type: 'import-pdf-candidate-export',
    pageNumber: page.pageNumber,
    backgroundPngBase64: pair.backgroundPngBase64,
    candidatePngBase64: pair.candidatePngBase64,
    actualTextBounds: pair.actualTextBounds,
    exportWidth: pair.exportWidth,
    exportHeight: pair.exportHeight,
  });
}

function failPendingEditableVerify(failReason?: string): void {
  const pending = pendingEditableVerify;
  pendingEditableVerify = null;
  if (!pending) return;
  clearFrameChildren(pending.pageFrame);
  if (pending.page.fallbackImageBase64) {
    placeImportedPageImage(
      pending.pageFrame,
      pending.page.width,
      pending.page.height,
      pending.page.fallbackImageBase64,
      'Page image'
    );
  }
  commitEditablePage(pending.session, pending.pageFrame, pending.page, false, failReason);
}

async function placeEditableImportPage(session: EditableImportSession, page: PdfEditablePagePayload): Promise<void> {
  const pageFrame = figma.createFrame();
  pageFrame.name = `${session.fileName} / Page ${page.pageNumber}`;
  pageFrame.resizeWithoutConstraints(page.width, page.height);
  prepareImportSlot(session);
  pageFrame.x = session.nextX;
  pageFrame.y = session.nextY;
  pageFrame.clipsContent = true;
  pageFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  session.groupFrame.appendChild(pageFrame);

  const kind = await fillEditablePageFrame(pageFrame, session, page);
  if (kind !== 'candidate') {
    commitEditablePage(
      session,
      pageFrame,
      page,
      false,
      page.mode === 'raster' ? page.reason : `text-placement-failure · ${page.reason}`
    );
    return;
  }
  try {
    pendingEditableVerify = { session, pageFrame, page };
    await postCandidateExport(pageFrame, page);
  } catch (error: unknown) {
    pluginWarn('Editable verify export failed', {
      page: page.pageNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    failPendingEditableVerify('candidate-export-failure · ' + (error instanceof Error ? error.message : String(error)));
  }
}

function finishEditableImportSession(canceled: boolean): void {
  if (pendingEditableVerify) failPendingEditableVerify();
  const session = editableImportSession;
  editableImportSession = null;
  if (!session) return;
  if (session.created === 0) {
    session.groupFrame.remove();
    figma.ui.postMessage({
      type: canceled ? 'import-pdf-complete' : 'import-pdf-error',
      pageCount: 0,
      layerCount: 0,
      rasterCount: 0,
      unsafeTextCount: 0,
      fileName: session.fileName,
      error: canceled ? undefined : 'No PDF pages were ready to import.',
    });
    if (!canceled) figma.notify('No PDF pages were ready to import');
    return;
  }
  const height = Math.max(1, session.rowHeight > 0 ? session.nextY + session.rowHeight : session.nextY - IMPORT_PAGE_GAP);
  session.groupFrame.resizeWithoutConstraints(Math.max(1, session.maxWidth), height);
  session.groupFrame.x = session.viewportCenter.x - session.groupFrame.width / 2;
  session.groupFrame.y = session.viewportCenter.y - session.groupFrame.height / 2;
  figma.currentPage.selection = [session.groupFrame];
  figma.viewport.scrollAndZoomIntoView([session.groupFrame]);
  figma.ui.postMessage({
    type: 'import-pdf-complete',
    pageCount: session.created,
    layerCount: session.layerCount,
    rasterCount: session.rasterCount,
    unsafeTextCount: session.unsafeTextCount,
    fileName: session.fileName,
  });
  figma.notify(`Imported ${session.created} PDF page${session.created === 1 ? '' : 's'} to canvas`);
}

function makeSafeNodeName(value: string): string {
  const trimmed = value.trim();
  return trimmed || 'Imported PDF';
}

interface TranslationNodePayload {
  mappingKey: string;
  translatedText: string;
}

interface PatchNodePayload {
  cloneFrameId: string;
  mappingKey: string;
  translatedText: string;
}

interface TranslationPayload {
  sourceFrameId: string;
  language: string;
  languageCode: string;
  nodes: TranslationNodePayload[];
}

interface OverflowInfo {
  mappingKey: string;
  nodeId: string;
  nodeName: string;
  language: string;
  languageCode: string;
  frameName: string;
  cloneFrameId: string;
  overflowX: number;
  overflowY: number;
  currentWidth: number;
  currentHeight: number;
  containerWidth: number;
  containerHeight: number;
  textAutoResize: string;
}

async function loadAllFontsForTextNode(textNode: TextNode): Promise<void> {
  const fontName = textNode.fontName;
  if (fontName === figma.mixed) {
    const segments = textNode.getStyledTextSegments(['fontName']);
    const seen = new Set<string>();
    for (const seg of segments) {
      const fn = seg.fontName as FontName;
      const key = `${fn.family}::${fn.style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await figma.loadFontAsync(fn);
    }
    return;
  }
  await figma.loadFontAsync(fontName);
}

async function decreaseTextNodeFontByOne(textNode: TextNode): Promise<void> {
  const fontName = textNode.fontName;
  if (fontName === figma.mixed) {
    const segments = textNode.getStyledTextSegments(['fontName', 'fontSize']);
    for (const seg of segments) {
      await figma.loadFontAsync(seg.fontName as FontName);
      const currentSize = seg.fontSize as number;
      if (currentSize > 6) {
        textNode.setRangeFontSize(seg.start, seg.end, currentSize - 1);
      }
    }
    return;
  }

  await figma.loadFontAsync(fontName);
  const currentSize = textNode.fontSize as number;
  if (currentSize > 6) {
    textNode.fontSize = currentSize - 1;
  }
}

function expandTextNodeLayer(textNode: TextNode): void {
  if (textNode.textAutoResize === 'NONE') {
    textNode.textAutoResize = 'HEIGHT';
    return;
  }
  const widthDelta = 40;
  const parent = textNode.parent;
  const parentUsesAutoLayout = !!parent && 'layoutMode' in parent && parent.layoutMode !== 'NONE';
  const preserveRightEdge = textNode.textAlignHorizontal === 'RIGHT' && !parentUsesAutoLayout;
  textNode.resize(textNode.width + widthDelta, textNode.height);
  if (preserveRightEdge) {
    textNode.x -= widthDelta;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = asNumber(value);
  return numeric === null ? fallback : numeric;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseRgb(value: unknown): RGB {
  const obj = asObject(value);
  const r = asNumber(obj?.r);
  const g = asNumber(obj?.g);
  const b = asNumber(obj?.b);
  if (r === null || g === null || b === null) return { r: 0, g: 0, b: 0 };
  if (r > 1 || g > 1 || b > 1) {
    return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255) };
  }
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

function parseEditableImportMode(value: unknown): EditableImportMode {
  return value === 'text' || value === 'svg' ? value : 'raster';
}

function parseSettingsPayload(value: unknown): SettingsPayload {
  const obj = asObject(value);
  if (!obj) return {};
  let targetLanguages: string[] | undefined;
  if (Array.isArray(obj.targetLanguages)) {
    targetLanguages = obj.targetLanguages.filter(item => typeof item === 'string') as string[];
  }
  return {
    provider: asString(obj.provider) || undefined,
    model: asString(obj.model) || undefined,
    apiKeyGemini: asString(obj.apiKeyGemini) || undefined,
    apiKeyOpenai: asString(obj.apiKeyOpenai) || undefined,
    quotaProfile: asString(obj.quotaProfile) || undefined,
    targetLanguages,
    debugMode: asBoolean(obj.debugMode) ?? undefined,
    enableTranslation: asBoolean(obj.enableTranslation) ?? undefined,
  };
}

function emptySpendSummary(): SpendSummary {
  return {
    total_cost_usd: 0,
    total_tokens: 0,
    count: 0,
  };
}

function normalizeModelSpendBreakdown(entry: unknown): ModelSpendBreakdown | null {
  const obj = asObject(entry);
  if (!obj) return null;
  const model = asString(obj.model) || asString(obj.modelName) || '';
  if (!model) return null;
  const promptTokens = numberOr(obj.prompt_tokens ?? obj.promptTokens, 0);
  const completionTokens = numberOr(obj.completion_tokens ?? obj.completionTokens, 0);
  const totalTokens = numberOr(obj.total_tokens ?? obj.totalTokens, promptTokens + completionTokens);
  return {
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost_usd: numberOr(obj.cost_usd ?? obj.costUsd, 0),
  };
}

function normalizeSpendRunRecord(value: unknown): SpendRunRecord | null {
  const obj = asObject(value);
  if (!obj) return null;
  const runId = asString(obj.run_id) || asString(obj.runId) || `run-${Date.now().toString(36)}`;
  const runAt = asString(obj.last_run_at) || asString(obj.lastRunAt) || new Date().toISOString();
  const promptTokens = numberOr(obj.prompt_tokens ?? obj.promptTokens, 0);
  const completionTokens = numberOr(obj.completion_tokens ?? obj.completionTokens, 0);
  const totalTokens = numberOr(obj.total_tokens ?? obj.totalTokens, promptTokens + completionTokens);
  const normalizedBreakdown = asArray(obj.model_breakdown ?? obj.modelBreakdown)
    .map(normalizeModelSpendBreakdown)
    .filter((item): item is ModelSpendBreakdown => item !== null);
  return {
    run_id: runId,
    last_run_at: runAt,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    total_cost_usd: numberOr(obj.total_cost_usd ?? obj.totalCostUsd, 0),
    model_breakdown: normalizedBreakdown,
  };
}

function mergeSummaryWithRun(summary: SpendSummary, run: SpendRunRecord): SpendSummary {
  return {
    total_cost_usd: summary.total_cost_usd + run.total_cost_usd,
    total_tokens: summary.total_tokens + run.total_tokens,
    count: summary.count + 1,
  };
}

function normalizeSpendSummary(value: unknown): SpendSummary {
  const obj = asObject(value);
  if (!obj) return emptySpendSummary();
  return {
    total_cost_usd: numberOr(obj.total_cost_usd ?? obj.totalCostUsd, 0),
    total_tokens: numberOr(obj.total_tokens ?? obj.totalTokens, 0),
    count: numberOr(obj.count, 0),
  };
}

function getSummaryForRuns(runs: SpendRunRecord[]): SpendSummary {
  return runs.reduce((summary, run) => mergeSummaryWithRun(summary, run), emptySpendSummary());
}

async function loadRecentSpendRuns(): Promise<SpendRunRecord[]> {
  const stored = await figma.clientStorage.getAsync(SPEND_RECENT_RUNS_KEY);
  const normalized = asArray(stored)
    .map(normalizeSpendRunRecord)
    .filter((item): item is SpendRunRecord => item !== null);
  return normalized
    .sort((a, b) => Date.parse(b.last_run_at) - Date.parse(a.last_run_at))
    .slice(0, SPEND_RECENT_RUN_LIMIT);
}

async function loadAllTimeSpendSummary(): Promise<SpendSummary> {
  const stored = await figma.clientStorage.getAsync(SPEND_ALL_TIME_SUMMARY_KEY);
  return normalizeSpendSummary(stored);
}

function parseTranslationPayloads(value: unknown): TranslationPayload[] {
  if (!Array.isArray(value)) return [];
  const parsed: TranslationPayload[] = [];

  for (const entry of value) {
    const obj = asObject(entry);
    if (!obj) continue;
    const sourceFrameId = asString(obj.sourceFrameId);
    const language = asString(obj.language);
    const languageCode = asString(obj.languageCode);
    if (!sourceFrameId || !language || !languageCode || !Array.isArray(obj.nodes)) continue;

    const nodes: TranslationNodePayload[] = [];
    for (const nodeEntry of obj.nodes) {
      const nodeObj = asObject(nodeEntry);
      if (!nodeObj) continue;
      const mappingKey = asString(nodeObj.mappingKey);
      const translatedText = asString(nodeObj.translatedText);
      if (!mappingKey || translatedText === null) continue;
      nodes.push({ mappingKey, translatedText });
    }

    parsed.push({ sourceFrameId, language, languageCode, nodes });
  }

  return parsed;
}

type FrameLike = FrameNode | ComponentNode;

function isAllowedSelectionNode(node: SceneNode): node is FrameLike {
  return node.type === 'FRAME' || node.type === 'COMPONENT';
}

function getSelectedFrames(): { id: string; name: string; width: number; height: number }[] {
  return figma.currentPage.selection
    .filter(isAllowedSelectionNode)
    .map(serializeFrame);
}

function serializeFrame(frame: FrameLike): { id: string; name: string; width: number; height: number } {
  return {
    id: frame.id,
    name: frame.name,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  };
}

async function getFramesFromIds(frameIds: string[]): Promise<FrameLike[]> {
  const frames: FrameLike[] = [];
  const seen = new Set<string>();
  for (const frameId of frameIds) {
    if (seen.has(frameId)) continue;
    seen.add(frameId);
    const node = await figma.getNodeByIdAsync(frameId);
    if (node && 'type' in node && isAllowedSelectionNode(node as SceneNode)) {
      frames.push(node as FrameLike);
    }
  }
  return frames;
}

function getNodeAbsolutePosition(node: SceneNode): { x: number; y: number } {
  return {
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
  };
}

function getUniqueCloneName(sourceFrameName: string, language: string, parent: BaseNode | null): string {
  const baseName = `${sourceFrameName} — ${language}`;
  if (!parent || !('children' in parent)) return baseName;

  const siblingNames = new Set(parent.children.map(child => child.name));
  if (!siblingNames.has(baseName)) return baseName;

  let version = 2;
  while (siblingNames.has(`${baseName} v${version}`)) {
    version += 1;
  }
  return `${baseName} v${version}`;
}

function getCanvasPlacementStartY(page: PageNode, gap: number): number {
  if (page.children.length === 0) return gap;
  const maxBottom = Math.max(...page.children.map(child => {
    const pos = getNodeAbsolutePosition(child);
    return pos.y + child.height;
  }));
  return maxBottom + gap;
}

function getNodePath(node: BaseNode, rootFrame: BaseNode): string {
  const indices: number[] = [];
  let current = node;
  while (current && current.id !== rootFrame.id) {
    const parent = current.parent;
    if (!parent || !('children' in parent)) break;
    const children = (parent as FrameNode).children;
    const index = children.findIndex(child => child.id === current.id);
    indices.unshift(index);
    current = parent;
  }
  return indices.join('/');
}

function extractTextNodes(frame: SceneNode): TextNodeInfo[] {
  const nodes: TextNodeInfo[] = [];

  function traverse(node: SceneNode) {
    if (!node.visible) return;

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      if (textNode.characters.length === 0) return;

      const path = getNodePath(textNode, frame);
      const fontSize = textNode.fontSize === figma.mixed ? "mixed" : textNode.fontSize as number;

      nodes.push({
        mappingKey: `${frame.id}::${path}`,
        text: textNode.characters,
        charCount: textNode.characters.length,
        fontSize,
        textAutoResize: textNode.textAutoResize,
        width: textNode.width,
        height: textNode.height,
        truncated: textNode.textAutoResize === 'TRUNCATE',
      });
    }

    if ('children' in node) {
      for (const child of (node as FrameNode).children) {
        traverse(child);
      }
    }
  }

  traverse(frame);
  return nodes;
}

function findOverflowContainers(textNode: TextNode): SceneNode[] {
  let current: BaseNode | null = textNode.parent;
  let fallbackContainer: SceneNode | null = null;
  const clippingContainers: SceneNode[] = [];
  while (current && current.type !== 'PAGE') {
    if (current.type === 'FRAME' || current.type === 'COMPONENT' || current.type === 'INSTANCE') {
      if (!fallbackContainer) fallbackContainer = current as SceneNode;
      const maybeClipsContent = current as SceneNode & { clipsContent?: boolean };
      if (maybeClipsContent.clipsContent) clippingContainers.push(current as SceneNode);
    }
    current = current.parent;
  }
  if (clippingContainers.length > 0) return clippingContainers;
  return fallbackContainer ? [fallbackContainer] : [];
}

function checkOverflow(textNode: TextNode, mappingKey: string, language: string, languageCode: string, frameName: string, cloneFrameId: string): OverflowInfo | null {
  const containers = findOverflowContainers(textNode);
  if (containers.length === 0) return null;

  let effectiveWidth = textNode.width;
  let effectiveHeight = textNode.height;
  const originalResize = textNode.textAutoResize;
  const originalWidth = textNode.width;
  const originalHeight = textNode.height;
  const usesTemporaryMeasure = originalResize === 'NONE' || originalResize === 'TRUNCATE';
  let selfOverflowY = 0;
  let lineHeightClipRiskY = 0;

  try {
    // For fixed/truncate modes, text can overflow inside its own layer.
    // Temporarily switch to HEIGHT to measure true content height.
    if (usesTemporaryMeasure) {
      textNode.textAutoResize = 'HEIGHT';
      const measuredHeight = textNode.height;
      effectiveHeight = measuredHeight;
      effectiveWidth = originalWidth;
      selfOverflowY = Math.max(0, Math.round(measuredHeight - originalHeight));
    }

    const nodeRight = textNode.absoluteTransform[0][2] + effectiveWidth;
    const nodeBottom = textNode.absoluteTransform[1][2] + effectiveHeight;

    // Heuristic: detect glyph clipping caused by line-height set below font size.
    try {
      const segments = textNode.getStyledTextSegments(['fontSize', 'lineHeight']);
      for (const seg of segments) {
        if (typeof seg.fontSize !== 'number') continue;
        const fontSize = seg.fontSize;
        const lineHeight = seg.lineHeight;
        if (!lineHeight || typeof lineHeight !== 'object' || !('unit' in lineHeight)) continue;

        if (lineHeight.unit === 'PIXELS' && typeof lineHeight.value === 'number') {
          const risk = Math.max(0, Math.round(fontSize - lineHeight.value));
          lineHeightClipRiskY = Math.max(lineHeightClipRiskY, risk);
        } else if (lineHeight.unit === 'PERCENT' && typeof lineHeight.value === 'number') {
          const px = fontSize * (lineHeight.value / 100);
          const risk = Math.max(0, Math.round(fontSize - px));
          lineHeightClipRiskY = Math.max(lineHeightClipRiskY, risk);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      pluginWarn('Line-height overflow heuristic failed', { mappingKey, nodeId: textNode.id, error: message });
    }

    let containerOverflowX = 0;
    let containerOverflowY = 0;
    for (const container of containers) {
      const containerRight = container.absoluteTransform[0][2] + container.width;
      const containerBottom = container.absoluteTransform[1][2] + container.height;
      containerOverflowX = Math.max(containerOverflowX, Math.round(Math.max(0, nodeRight - containerRight)));
      containerOverflowY = Math.max(containerOverflowY, Math.round(Math.max(0, nodeBottom - containerBottom)));
    }
    const overflowX = containerOverflowX;
    const overflowY = Math.max(containerOverflowY, selfOverflowY, lineHeightClipRiskY);

    if (overflowX > 0 || overflowY > 0) {
      return {
        mappingKey,
        nodeId: textNode.id,
        nodeName: textNode.name,
        language,
        languageCode,
        frameName,
        cloneFrameId,
        overflowX,
        overflowY,
        currentWidth: Math.round(effectiveWidth),
        currentHeight: Math.round(effectiveHeight),
        containerWidth: Math.round(containers[0].width),
        containerHeight: Math.round(containers[0].height),
        textAutoResize: originalResize,
      };
    }
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    pluginWarn('Overflow check failed', { mappingKey, nodeId: textNode.id, error: message });
    return null;
  } finally {
    if (usesTemporaryMeasure) {
      try {
        textNode.textAutoResize = originalResize;
        textNode.resize(originalWidth, originalHeight);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        pluginWarn('Overflow measure restore failed', { mappingKey, nodeId: textNode.id, error: message });
      }
    }
  }
}

/**
 * Resolve a Figma LineHeight to a pixel value, falling back to
 * `fontSize * 1.2` when the line height is set to AUTO.
 */
function resolveLineHeightPx(lh: LineHeight, fontSize: number): number {
  if (lh.unit === 'PIXELS') return lh.value;
  if (lh.unit === 'PERCENT') return fontSize * (lh.value / 100);
  // AUTO – Figma uses ≈1.2× the font size
  return fontSize * 1.2;
}

/**
 * Estimate per-hyperlink bounding boxes within a text node by splitting
 * the full text into lines, mapping each hyperlink segment to a line,
 * and computing approximate x/y/w/h from font metrics.
 *
 * This replaces the previous whole-node hitbox approach and produces
 * significantly tighter link annotations in the exported PDF.
 */
function extractTextNodeLinks(
  textNode: TextNode,
  frameX: number,
  frameY: number,
): LinkInfo[] {
  const segments = textNode.getStyledTextSegments(
    ['hyperlink', 'fontSize', 'lineHeight', 'letterSpacing'],
  );

  // Collect only segments that carry a URL hyperlink.
  const linkSegments = segments.filter(
    (seg) => seg.hyperlink && seg.hyperlink.type === 'URL' && (seg.hyperlink as { value: string }).value,
  );
  if (linkSegments.length === 0) return [];

  const fullText = textNode.characters;
  const nodeX = textNode.absoluteTransform[0][2];
  const nodeY = textNode.absoluteTransform[1][2];
  const nodeW = textNode.width;
  const align = textNode.textAlignHorizontal; // LEFT | CENTER | RIGHT | JUSTIFIED

  // Average char width heuristic (proportional fonts).
  const AVG_CHAR_WIDTH_FACTOR = 0.55;

  // Build visual lines that account for both hard breaks (\n) and soft wraps.
  // First split by explicit '\n' into paragraphs, then subdivide each
  // paragraph into visual lines based on the container width.
  interface VisualLine { start: number; end: number; fontSize: number; lineHeight: number }
  const visualLines: VisualLine[] = [];

  // Split into paragraphs by '\n'.
  const paragraphs: { start: number; end: number }[] = [];
  let pStart = 0;
  for (let ci = 0; ci <= fullText.length; ci++) {
    if (ci === fullText.length || fullText[ci] === '\n') {
      paragraphs.push({ start: pStart, end: ci });
      pStart = ci + 1;
    }
  }

  for (const para of paragraphs) {
    // Find dominant font metrics for this paragraph.
    const overlapping = segments.find(
      (seg) => seg.start < para.end && seg.end > para.start,
    );
    const fSize = overlapping ? overlapping.fontSize : 12;
    const lhPx = overlapping
      ? resolveLineHeightPx(overlapping.lineHeight, fSize)
      : fSize * 1.2;
    const charW = fSize * AVG_CHAR_WIDTH_FACTOR;

    const paraLen = para.end - para.start;
    if (paraLen === 0) {
      // Empty paragraph (blank line) still occupies one visual line.
      visualLines.push({ start: para.start, end: para.end, fontSize: fSize, lineHeight: lhPx });
      continue;
    }

    // Estimate how many characters fit per visual line.
    const charsPerLine = Math.max(1, Math.floor(nodeW / charW));

    // Subdivide paragraph into visual lines.
    let offset = para.start;
    while (offset < para.end) {
      const lineEnd = Math.min(offset + charsPerLine, para.end);
      visualLines.push({ start: offset, end: lineEnd, fontSize: fSize, lineHeight: lhPx });
      offset = lineEnd;
    }
  }

  // Compute cumulative y-offsets per visual line.
  const lineYOffsets: number[] = [];
  let cumulativeY = 0;
  for (const vl of visualLines) {
    lineYOffsets.push(cumulativeY);
    cumulativeY += vl.lineHeight;
  }

  const results: LinkInfo[] = [];

  // No URL deduplication: each occurrence of a hyperlink segment gets its own
  // hitbox so that repeated links in the same text node are all annotated.
  for (const seg of linkSegments) {
    const url = (seg.hyperlink as { value: string }).value;
    const fSize = seg.fontSize;
    const charW = fSize * AVG_CHAR_WIDTH_FACTOR;
    const lhPx = resolveLineHeightPx(seg.lineHeight, fSize);

    // Find which visual line(s) this segment spans.
    for (let li = 0; li < visualLines.length; li++) {
      const vl = visualLines[li];
      const overlapStart = Math.max(seg.start, vl.start);
      const overlapEnd = Math.min(seg.end, vl.end);
      if (overlapStart >= overlapEnd) continue;

      // Characters before the link on this visual line.
      const charsBeforeOnLine = overlapStart - vl.start;
      const linkCharCount = overlapEnd - overlapStart;
      const lineCharCount = vl.end - vl.start;

      // Estimated full line width & link width.
      const estLineWidth = lineCharCount * charW;
      const estLinkWidth = Math.min(linkCharCount * charW, nodeW);

      // X offset depends on text alignment.
      let lineStartX = 0;
      if (align === 'CENTER') {
        lineStartX = (nodeW - estLineWidth) / 2;
      } else if (align === 'RIGHT') {
        lineStartX = nodeW - estLineWidth;
      }
      // LEFT and JUSTIFIED start at 0.

      const linkX = Math.max(0, lineStartX + charsBeforeOnLine * charW);
      const linkY = lineYOffsets[li] ?? 0;

      results.push({
        url,
        x: (nodeX - frameX) + linkX,
        y: (nodeY - frameY) + linkY,
        width: Math.min(estLinkWidth, nodeW - linkX),
        height: lhPx,
      });
    }
  }

  return results;
}

function extractLinks(frame: SceneNode): LinkInfo[] {
  const links: LinkInfo[] = [];
  const frameX = frame.absoluteTransform[0][2];
  const frameY = frame.absoluteTransform[1][2];

  function traverse(node: SceneNode) {
    if (!node.visible) return;

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      if (textNode.characters.length === 0) return;

      const segmentLinks = extractTextNodeLinks(textNode, frameX, frameY);
      if (segmentLinks.length > 0) {
        links.push(...segmentLinks);
      }
    }

    // Check node-level hyperlink (reactions with URL)
    if ('reactions' in node) {
      const reactions = (node as SceneNode & { reactions: readonly Reaction[] }).reactions;
      for (const reaction of reactions) {
        if (reaction.action && reaction.action.type === 'URL' && reaction.action.url) {
          const nodeX = node.absoluteTransform[0][2];
          const nodeY = node.absoluteTransform[1][2];
          links.push({
            url: reaction.action.url,
            x: nodeX - frameX,
            y: nodeY - frameY,
            width: node.width,
            height: node.height,
          });
        }
      }
    }

    if ('children' in node) {
      for (const child of (node as FrameNode).children) {
        traverse(child);
      }
    }
  }

  traverse(frame);
  return links;
}

function sendSelection() {
  const frames = getSelectedFrames();
  figma.ui.postMessage({ type: 'selection-update', frames });
}

let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let translationCancelRequested = false;
const EXPORT_CONCURRENCY = 3;
function debouncedSendSelection() {
  if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
  selectionDebounceTimer = setTimeout(sendSelection, 150);
}

figma.on('selectionchange', debouncedSendSelection);

figma.ui.onmessage = async (rawMsg: unknown) => {
  const msg = asObject(rawMsg);
  const type = asString(msg?.type);
  if (!type) return;

  if (type === 'init') {
    sendSelection();
  }

  if (type === 'export') {
    const rawScale = msg?.scale;
    const scale = typeof rawScale === 'number' && rawScale > 0 ? rawScale : 2;
    const exportQuality = asString(msg?.exportQuality);
    const exportFormat = 'JPG';
    const frameIds = Array.isArray(msg?.frameIds)
      ? (msg?.frameIds as unknown[]).filter(item => typeof item === 'string') as string[]
      : [];
    const frames = frameIds.length > 0
      ? await getFramesFromIds(frameIds)
      : figma.currentPage.selection.filter(isAllowedSelectionNode);

    if (frames.length === 0) {
      figma.notify('No frames selected');
      return;
    }
    const images = new Array<string>(frames.length);
    const allLinks = new Array<LinkInfo[]>(frames.length);

    try {
      let completed = 0;
      let nextIndex = 0;
      const workerCount = Math.max(1, Math.min(EXPORT_CONCURRENCY, frames.length));

      const runWorker = async (): Promise<void> => {
        while (nextIndex < frames.length) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= frames.length) break;

          const frame = frames[index];
          const bytes = await (frame as FrameLike).exportAsync({
            format: exportFormat,
            constraint: { type: 'SCALE', value: scale },
          });
          images[index] = 'data:image/jpeg;base64,' + figma.base64Encode(bytes);
          const extractedLinks = extractLinks(frame);
          allLinks[index] = extractedLinks;
          pluginLog('Export frame links extracted', {
            frameId: frame.id,
            frameName: frame.name,
            linkCount: extractedLinks.length,
            scale,
            exportQuality,
            exportFormat,
          });

          completed += 1;
          figma.ui.postMessage({
            type: 'export-progress',
            completed,
            total: frames.length,
            frameName: frame.name,
            stage: 'render',
          });
        }
      };

      const workers: Promise<void>[] = [];
      for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
        workers.push(runWorker());
      }
      await Promise.all(workers);

      pluginLog('Export link extraction summary', {
        frameCount: frames.length,
        totalLinkCount: allLinks.reduce((sum, links) => sum + (Array.isArray(links) ? links.length : 0), 0),
        scale,
        exportQuality,
        exportFormat,
      });

      figma.ui.postMessage({ type: 'export-data', images, links: allLinks, frames: frames.map(serializeFrame) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      figma.ui.postMessage({ type: 'export-error', error: message });
      figma.notify('PDF export failed ⚠️');
      pluginError('Export failed', { error: message });
    }
  }

  if (type === 'export-done') {
    figma.notify('PDF exported successfully! ✅');
  }

  if (type === 'get-export-settings') {
    const scale = normalizeExportScale(await figma.clientStorage.getAsync(EXPORT_SCALE_KEY));
    const exportQuality = normalizeExportQuality(await figma.clientStorage.getAsync(EXPORT_QUALITY_KEY));
    figma.ui.postMessage({
      type: 'export-settings-loaded',
      settings: { scale, exportQuality },
    });
  }

  if (type === 'save-export-settings') {
    const scale = normalizeExportScale(msg?.scale);
    const exportQuality = normalizeExportQuality(msg?.exportQuality);
    await figma.clientStorage.setAsync(EXPORT_SCALE_KEY, scale);
    await figma.clientStorage.setAsync(EXPORT_QUALITY_KEY, exportQuality);
  }

  if (type === 'get-import-settings') {
    const importQuality = normalizeImportQuality(await figma.clientStorage.getAsync(IMPORT_QUALITY_KEY));
    const importMode = normalizeImportMode(await figma.clientStorage.getAsync(IMPORT_MODE_KEY));
    let availableFonts: Array<{ family: string; styles: string[] }> = [];
    try {
      const fonts = await figma.listAvailableFontsAsync();
      const byFamily = new Map<string, Set<string>>();
      for (const font of fonts) {
        const family = font.fontName.family;
        const styles = byFamily.get(family) || new Set<string>();
        styles.add(font.fontName.style);
        byFamily.set(family, styles);
      }
      availableFonts = Array.from(byFamily, ([family, styles]) => ({ family, styles: Array.from(styles) }));
    } catch (error: unknown) {
      pluginWarn('Could not list fonts for PDF import', { error: error instanceof Error ? error.message : String(error) });
    }
    figma.ui.postMessage({
      type: 'import-settings-loaded',
      settings: {
        importQuality,
        importMode,
        availableFonts,
        fontOverrides: parseFontOverrides(await figma.clientStorage.getAsync(IMPORT_FONT_OVERRIDES_KEY)),
      },
    });
  }

  if (type === 'save-import-font-overrides') {
    await figma.clientStorage.setAsync(IMPORT_FONT_OVERRIDES_KEY, parseFontOverrides(msg?.overrides));
  }

  if (type === 'measure-import-fonts') {
    try {
      const results = await measureImportFontJobs(asArray(msg?.jobs));
      figma.ui.postMessage({ type: 'import-fonts-measured', results });
    } catch (error: unknown) {
      figma.ui.postMessage({
        type: 'import-fonts-measured',
        results: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (type === 'save-import-settings') {
    const importQuality = normalizeImportQuality(msg?.importQuality);
    const importMode = normalizeImportMode(msg?.importMode);
    await figma.clientStorage.setAsync(IMPORT_QUALITY_KEY, importQuality);
    await figma.clientStorage.setAsync(IMPORT_MODE_KEY, importMode);
  }

  if (type === 'import-pdf-pages') {
    const pages = parsePdfImportPagesPayload(msg?.pages);
    if (pages.length === 0) {
      figma.ui.postMessage({ type: 'import-pdf-error', error: 'No PDF pages were ready to import.' });
      figma.notify('No PDF pages were ready to import');
      return;
    }

    try {
      const rawFileName = asString(msg?.fileName) || 'Imported PDF';
      const fileName = makeSafeNodeName(rawFileName.replace(/\.pdf$/i, ''));
      const groupFrame = figma.createFrame();
      groupFrame.name = fileName;
      groupFrame.clipsContent = false;
      groupFrame.fills = [];

      const viewportCenter = figma.viewport.center;
      const gap = IMPORT_PAGE_GAP;
      const maxItemsPerRow = IMPORT_MAX_ITEMS_PER_ROW;
      let nextX = 0;
      let nextY = 0;
      let rowHeight = 0;
      let maxWidth = 0;
      const createdNodes: SceneNode[] = [];

      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        figma.ui.postMessage({
          type: 'import-pdf-place-progress',
          completed: index,
          total: pages.length,
          pageNumber: page.pageNumber,
        });

        const pageFrame = figma.createFrame();
        pageFrame.name = `${fileName} / Page ${page.pageNumber}`;
        pageFrame.resizeWithoutConstraints(page.width, page.height);
        pageFrame.x = nextX;
        pageFrame.y = nextY;
        pageFrame.clipsContent = false;
        pageFrame.fills = [];

        const image = figma.createImage(figma.base64Decode(page.imageBase64));
        const rect = figma.createRectangle();
        rect.name = 'Page image';
        rect.resize(page.width, page.height);
        rect.x = 0;
        rect.y = 0;
        rect.fills = [{
          type: 'IMAGE',
          scaleMode: 'FILL',
          imageHash: image.hash,
        }];
        pageFrame.appendChild(rect);
        groupFrame.appendChild(pageFrame);
        createdNodes.push(pageFrame);

        nextX += page.width + gap;
        rowHeight = Math.max(rowHeight, page.height);
        maxWidth = Math.max(maxWidth, nextX - gap);

        if ((index + 1) % maxItemsPerRow === 0 && index < pages.length - 1) {
          nextX = 0;
          nextY += rowHeight + gap;
          rowHeight = 0;
        }
      }

      groupFrame.resizeWithoutConstraints(maxWidth, Math.max(1, nextY + rowHeight));
      groupFrame.x = viewportCenter.x - groupFrame.width / 2;
      groupFrame.y = viewportCenter.y - groupFrame.height / 2;
      figma.currentPage.selection = [groupFrame];
      figma.viewport.scrollAndZoomIntoView([groupFrame]);

      figma.ui.postMessage({
        type: 'import-pdf-complete',
        pageCount: createdNodes.length,
        fileName,
      });
      figma.notify(`Imported ${createdNodes.length} PDF page${createdNodes.length === 1 ? '' : 's'} to canvas`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      figma.ui.postMessage({ type: 'import-pdf-error', error: message });
      figma.notify('PDF import failed');
      pluginError('PDF import failed', { error: message });
    }
  }

  if (type === 'import-pdf-log') {
    const message = asString(msg?.message) || 'import';
    console.log('[PDF Pilot]', message, msg?.payload ?? '');
  }

  if (type === 'import-pdf-editable-begin') {
    if (pendingEditableVerify) failPendingEditableVerify();
    if (editableImportSession) {
      finishEditableImportSession(true);
    }
    const rawFileName = asString(msg?.fileName) || 'Imported PDF';
    const fileName = makeSafeNodeName(rawFileName.replace(/\.pdf$/i, ''));
    const total = Math.max(1, asNumber(msg?.total) || 1);
    const groupFrame = figma.createFrame();
    groupFrame.name = fileName;
    groupFrame.clipsContent = false;
    groupFrame.fills = [];
    editableImportSession = {
      groupFrame,
      fileName,
      nextX: 0,
      nextY: 0,
      rowHeight: 0,
      maxWidth: 0,
      created: 0,
      total,
      layerCount: 0,
      rasterCount: 0,
      unsafeTextCount: 0,
      viewportCenter: figma.viewport.center,
      fontCache: new Map(),
    };
  }

  if (type === 'import-pdf-editable-page') {
    const session = editableImportSession;
    const page = parsePdfEditablePagePayload(msg?.page);
    if (!session) {
      figma.ui.postMessage({ type: 'import-pdf-page-placed', completed: 0, total: 0 });
      return;
    }
    if (!page) {
      figma.ui.postMessage({
        type: 'import-pdf-page-placed',
        completed: session.created,
        total: session.total,
      });
      return;
    }
    try {
      figma.ui.postMessage({
        type: 'import-pdf-place-progress',
        completed: session.created,
        total: session.total,
        pageNumber: page.pageNumber,
      });
      await placeEditableImportPage(session, page);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      pluginError('PDF editable import failed', { error: message, page: page.pageNumber });
      if (pendingEditableVerify && pendingEditableVerify.page.pageNumber === page.pageNumber) {
        failPendingEditableVerify();
      } else {
        figma.ui.postMessage({
          type: 'import-pdf-page-placed',
          completed: session.created,
          total: session.total,
          pageNumber: page.pageNumber,
        });
      }
    }
  }

  if (type === 'import-pdf-verify') {
    const pending = pendingEditableVerify;
    if (!pending) return;
    const action = asString(msg?.action) || (asBoolean(msg?.accept) === true ? 'commit' : 'reject');
    const acceptedIds = parseIdList(msg?.acceptedIds);
    const rejected = asArray(msg?.rejected).map((item) => {
      const obj = asObject(item);
      return {
        occurrenceId: asString(obj?.occurrenceId) || '',
        reason: asString(obj?.reason) || '',
        characters: asString(obj?.characters) || '',
      };
    }).filter((row) => row.occurrenceId || row.reason);
    if (action === 'adjust') {
      const texts = pageTextNodes(pending.pageFrame);
      for (const move of parseVerifyMoves(msg?.moves)) {
        const node = texts.find((text) => text.getPluginData('pdf-pilot-occurrence') === move.occurrenceId);
        if (!node) continue;
        node.x += move.dx;
        node.y += move.dy;
      }
      try {
        await postCandidateExport(pending.pageFrame, pending.page);
      } catch (error: unknown) {
        failPendingEditableVerify('candidate-export-failure · ' + (error instanceof Error ? error.message : String(error)));
      }
      return;
    }
    if (action === 'commit' && acceptedIds.length > 0) {
      for (const text of pageTextNodes(pending.pageFrame)) {
        const id = text.getPluginData('pdf-pilot-occurrence');
        if (!id || acceptedIds.indexOf(id) < 0) text.remove();
      }
      const backgroundImageBase64 = asString(msg?.backgroundImageBase64);
      if (backgroundImageBase64) {
        replacePageImageFill(pending.pageFrame, pending.page.width, pending.page.height, backgroundImageBase64);
      }
      if (pageTextNodes(pending.pageFrame).length === 0) {
        failPendingEditableVerify('verification-rejected · no accepted text runs');
        return;
      }
      pendingEditableVerify = null;
      console.log('[PDF Pilot]', `page ${pending.page.pageNumber} commit`, {
        acceptedIds,
        rejected,
      });
      commitEditablePage(pending.session, pending.pageFrame, pending.page, true);
      return;
    }
    const mean = asNumber(msg?.mean);
    const worstText = asNumber(msg?.worstText);
    const failedRun = asString(msg?.failedRun) || (rejected[0] ? rejected[0].reason + ' · "' + rejected[0].characters + '"' : '');
    failPendingEditableVerify([
      'verification-rejected',
      mean === null ? '' : 'mean=' + mean.toFixed(4),
      worstText === null ? '' : 'worstText=' + worstText.toFixed(4),
      failedRun,
    ].filter(Boolean).join(' · '));
  }

  if (type === 'import-pdf-editable-finish') {
    finishEditableImportSession(msg?.canceled === true);
  }

  if (type === 'cancel') {
    figma.closePlugin();
  }

  if (type === 'cancel-translation') {
    translationCancelRequested = true;
    pluginLog('Translation cancel requested');
  }

  if (type === 'get-settings') {
    const provider = await figma.clientStorage.getAsync('ai-provider');
    const model = await figma.clientStorage.getAsync('ai-model');
    const apiKeyGemini = await figma.clientStorage.getAsync('api-key-gemini');
    const apiKeyOpenai = await figma.clientStorage.getAsync('api-key-openai');
    const quotaProfile = await figma.clientStorage.getAsync('quota-profile');
    const targetLanguages = await figma.clientStorage.getAsync('target-languages');
    const debugMode = await figma.clientStorage.getAsync('debug-mode');
    const enableTranslation = await figma.clientStorage.getAsync('enable-translation');
    pluginDebugMode = debugMode === true;
    figma.ui.postMessage({
      type: 'settings-loaded',
      settings: { provider, model, apiKeyGemini, apiKeyOpenai, quotaProfile, targetLanguages, debugMode: pluginDebugMode, enableTranslation: enableTranslation === true },
    });
  }

  if (type === 'save-settings') {
    const settings = parseSettingsPayload(msg?.settings);
    const silent = asBoolean(msg?.silent) === true;
    const debugMode = settings.debugMode === true;
    pluginDebugMode = debugMode;
    await figma.clientStorage.setAsync('ai-provider', settings.provider || 'gemini');
    await figma.clientStorage.setAsync('ai-model', settings.model || 'gemini-2.5-flash-lite');
    await figma.clientStorage.setAsync('api-key-gemini', settings.apiKeyGemini || '');
    await figma.clientStorage.setAsync('api-key-openai', settings.apiKeyOpenai || '');
    await figma.clientStorage.setAsync('quota-profile', settings.quotaProfile || 'auto');
    await figma.clientStorage.setAsync('target-languages', Array.isArray(settings.targetLanguages) ? settings.targetLanguages : []);
    await figma.clientStorage.setAsync('debug-mode', debugMode);
    await figma.clientStorage.setAsync('enable-translation', settings.enableTranslation === true);
    figma.ui.postMessage({ type: 'settings-saved' });
    if (!silent) figma.notify('Settings saved ✅');
  }

  if (type === 'save-target-languages') {
    const targetLanguages = parseTargetLanguagesPayload(msg?.targetLanguages);
    await figma.clientStorage.setAsync('target-languages', targetLanguages);
  }

  if (type === 'get-dashboard-data') {
    const recentRuns = await loadRecentSpendRuns();
    const summaryLast10 = getSummaryForRuns(recentRuns);
    const summaryAllTime = await loadAllTimeSpendSummary();
    figma.ui.postMessage({
      type: 'dashboard-data',
      recent_runs: recentRuns,
      summary_last_10: summaryLast10,
      summary_all_time: summaryAllTime,
    });
  }

  if (type === 'record-run-spend') {
    const runRecord = normalizeSpendRunRecord(msg?.run);
    if (!runRecord) return;
    const existingRuns = await loadRecentSpendRuns();
    // Global idempotency: maintain a persistent set of all known run IDs
    // (capped at 200) so that even after a run falls out of the recent-10
    // window, reposting the same run_id will not be double-counted.
    const rawKnownIds = await figma.clientStorage.getAsync(SPEND_KNOWN_RUN_IDS_KEY);
    const knownRunIds: string[] = Array.isArray(rawKnownIds)
      ? rawKnownIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const knownSet = new Set(knownRunIds);
    const isKnownRun = knownSet.has(runRecord.run_id);
    const deduped = existingRuns.filter(run => run.run_id !== runRecord.run_id);
    const recentRuns = [runRecord, ...deduped].slice(0, SPEND_RECENT_RUN_LIMIT);
    await figma.clientStorage.setAsync(SPEND_RECENT_RUNS_KEY, recentRuns);
    const allTimeSummary = await loadAllTimeSpendSummary();
    let nextAllTimeSummary: SpendSummary;
    if (isKnownRun) {
      // Run already counted in all-time summary. Compute the delta between the
      // updated record and the previously stored one and add only the difference.
      const oldRun = existingRuns.find(r => r.run_id === runRecord.run_id);
      if (oldRun) {
        const deltaCostUsd = runRecord.total_cost_usd - oldRun.total_cost_usd;
        const deltaTokens = runRecord.total_tokens - oldRun.total_tokens;
        if (deltaCostUsd > 0 || deltaTokens > 0) {
          nextAllTimeSummary = {
            total_cost_usd: allTimeSummary.total_cost_usd + Math.max(0, deltaCostUsd),
            total_tokens: allTimeSummary.total_tokens + Math.max(0, deltaTokens),
            count: allTimeSummary.count,
          };
          await figma.clientStorage.setAsync(SPEND_ALL_TIME_SUMMARY_KEY, nextAllTimeSummary);
        } else {
          nextAllTimeSummary = allTimeSummary;
        }
      } else {
        // Edge case: known ID but not found in recent runs (rotated out).
        // Treat as new to avoid losing spend.
        nextAllTimeSummary = mergeSummaryWithRun(allTimeSummary, runRecord);
        await figma.clientStorage.setAsync(SPEND_ALL_TIME_SUMMARY_KEY, nextAllTimeSummary);
      }
    } else {
      nextAllTimeSummary = mergeSummaryWithRun(allTimeSummary, runRecord);
      knownSet.add(runRecord.run_id);
      const updatedIds = Array.from(knownSet).slice(-SPEND_KNOWN_RUN_IDS_LIMIT);
      await figma.clientStorage.setAsync(SPEND_KNOWN_RUN_IDS_KEY, updatedIds);
      await figma.clientStorage.setAsync(SPEND_ALL_TIME_SUMMARY_KEY, nextAllTimeSummary);
    }
    figma.ui.postMessage({
      type: 'dashboard-data',
      recent_runs: recentRuns,
      summary_last_10: getSummaryForRuns(recentRuns),
      summary_all_time: nextAllTimeSummary,
    });
  }

  if (type === 'extract-text') {
    const frameIdScope = Array.isArray(msg?.frameIds)
      ? (msg?.frameIds as unknown[]).filter(item => typeof item === 'string') as string[]
      : null;
    let frames: FrameLike[] = [];
    if (frameIdScope && frameIdScope.length > 0) {
      for (const frameId of frameIdScope) {
        const node = await figma.getNodeByIdAsync(frameId);
        if (node && (node.type === 'FRAME' || node.type === 'COMPONENT')) {
          frames.push(node as FrameLike);
        }
      }
    } else {
      frames = figma.currentPage.selection.filter(isAllowedSelectionNode);
    }

    if (frames.length === 0) {
      figma.notify('No frames selected');
      return;
    }
    const allNodes: (TextNodeInfo & { frameName: string; frameId: string })[] = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      const textNodes = extractTextNodes(frame);
      for (const tn of textNodes) {
        allNodes.push({ ...tn, frameName: frame.name, frameId: frame.id });
      }
      figma.ui.postMessage({
        type: 'extract-progress',
        completed: frameIndex + 1,
        total: frames.length,
        frameName: frame.name,
      });
    }

    figma.ui.postMessage({
      type: 'text-data',
      nodes: allNodes,
      frameCount: frames.length,
      frames: frames.map(frame => ({ id: frame.id, name: frame.name })),
    });
  }

  if (type === 'apply-translations') {
    translationCancelRequested = false;
    const errors: { mappingKey: string; error: string }[] = [];
    const overflows: OverflowInfo[] = [];
    let totalFramesCreated = 0;
    let _totalOverflowScannedNodes = 0;
    let _clonesWithOverflow = 0;
    try {
      const loadedFontKeys = new Set<string>();
      const getFontKey = (font: FontName) => `${font.family}::${font.style}`;
      const ensureFontLoaded = async (font: FontName) => {
        const key = getFontKey(font);
        if (loadedFontKeys.has(key)) return;
        await figma.loadFontAsync(font);
        loadedFontKeys.add(key);
      };
      const ensureTextNodeFontsLoaded = async (textNode: TextNode) => {
        const fontName = textNode.fontName;
        if (fontName === figma.mixed) {
          const segments = textNode.getStyledTextSegments(['fontName']);
          const seen = new Set<string>();
          for (const seg of segments) {
            const fn = seg.fontName as FontName;
            const key = getFontKey(fn);
            if (seen.has(key)) continue;
            seen.add(key);
            await ensureFontLoaded(fn);
          }
          return;
        }
        await ensureFontLoaded(fontName);
      };

      const translations = parseTranslationPayloads(msg?.translations);
      if (translations.length === 0) {
        errors.push({ mappingKey: '__global__', error: 'No valid translation payload received from UI' });
      }
      const layoutFrameIds = Array.isArray(msg?.layoutFrameIds)
        ? (msg.layoutFrameIds as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];

      // Use explicit language order from UI so retry passes position clones consistently.
      const languageOrder = Array.isArray(msg?.languageOrder)
        ? (msg.languageOrder as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const languageIndices = new Map<string, number>();
      for (let i = 0; i < languageOrder.length; i++) {
        languageIndices.set(languageOrder[i], i);
      }
      // Fallback: assign indices for any languages not in the explicit order.
      let langCounter = languageOrder.length;
      for (const t of translations) {
        // languageOrder contains codes (e.g. 'fr', 'ar'), so look up by languageCode.
        if (!languageIndices.has(t.languageCode)) {
          languageIndices.set(t.languageCode, langCounter++);
        }
      }

      const sourceFramesById = new Map<string, FrameLike>();
      for (const t of translations) {
        if (sourceFramesById.has(t.sourceFrameId)) continue;
        const sourceNode = await figma.getNodeByIdAsync(t.sourceFrameId);
        if (!sourceNode) continue;
        if (sourceNode.type !== 'FRAME' && sourceNode.type !== 'COMPONENT') continue;
        sourceFramesById.set(t.sourceFrameId, sourceNode as FrameLike);
      }

      const sourceFrames = Array.from(sourceFramesById.values());
      const layoutAnchorFrames: FrameLike[] = [];
      if (layoutFrameIds.length > 0) {
        for (const frameId of layoutFrameIds) {
          const node = await figma.getNodeByIdAsync(frameId);
          if (node && (node.type === 'FRAME' || node.type === 'COMPONENT')) layoutAnchorFrames.push(node as FrameLike);
        }
      }
      const framesForLayout = layoutAnchorFrames.length > 0 ? layoutAnchorFrames : sourceFrames;
      const sourceLeft = framesForLayout.length > 0
        ? Math.min(...framesForLayout.map(frame => getNodeAbsolutePosition(frame).x))
        : 0;
      const sourceTop = framesForLayout.length > 0
        ? Math.min(...framesForLayout.map(frame => getNodeAbsolutePosition(frame).y))
        : 0;
      const sourceRight = framesForLayout.length > 0
        ? Math.max(...framesForLayout.map(frame => getNodeAbsolutePosition(frame).x + frame.width))
        : 0;
      const sourceBottom = framesForLayout.length > 0
        ? Math.max(...framesForLayout.map(frame => getNodeAbsolutePosition(frame).y + frame.height))
        : 0;
      const sourceBlockWidth = Math.max(0, sourceRight - sourceLeft);
      const sourceBlockHeight = Math.max(0, sourceBottom - sourceTop);
      const translationBlockGap = 160;
      const rowGap = 120;
      const rowStride = sourceBlockHeight + rowGap;
      const translationStartY = getCanvasPlacementStartY(figma.currentPage, translationBlockGap);
      pluginLog('Clone layout anchors', {
        translationFrameCount: sourceFrames.length,
        layoutAnchorFrameCount: layoutAnchorFrames.length,
        sourceBlockWidth: Math.round(sourceBlockWidth),
        sourceBlockHeight: Math.round(sourceBlockHeight),
        rowStride: Math.round(rowStride),
        translationStartY: Math.round(translationStartY),
      });
      const totalTranslationUnits = Math.max(1, translations.length);
      let completedTranslationUnits = 0;

      const applyRtlAlignment = async (node: SceneNode): Promise<void> => {
        if (node.type === 'TEXT') {
          const textNode = node as TextNode;
          if (textNode.textAlignHorizontal === 'LEFT') {
            try {
              await ensureTextNodeFontsLoaded(textNode);
              textNode.textAlignHorizontal = 'RIGHT';
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              errors.push({ mappingKey: `__rtl__::${textNode.id}`, error: message });
              pluginWarn('RTL alignment skipped for text node', { nodeId: textNode.id, error: message });
            }
          }
        }
        if ('children' in node) {
          for (const child of (node as FrameNode).children) {
            await applyRtlAlignment(child);
          }
        }
      };

      for (const translation of translations) {
        if (translationCancelRequested) break;
        const sourceFrame = sourceFramesById.get(translation.sourceFrameId);
        if (!sourceFrame) continue;

        const clone = sourceFrame.clone();
        const langIdx = languageIndices.get(translation.languageCode) ?? languageIndices.get(translation.language) ?? 0;
        const sourcePos = getNodeAbsolutePosition(sourceFrame);
        const relativeX = sourcePos.x - sourceLeft;
        const relativeY = sourcePos.y - sourceTop;

        clone.name = getUniqueCloneName(sourceFrame.name, translation.language, figma.currentPage);
        // Always place translated output at the page level in a fresh block
        // below existing canvas content. This avoids re-inserting selected
        // child frames back into auto-layout parents and prevents reruns from
        // stacking directly on top of older translated versions.
        figma.currentPage.appendChild(clone);
        clone.x = sourceLeft + relativeX;
        clone.y = translationStartY + relativeY + rowStride * langIdx;
        // Tag the clone so future runs can still identify its source/language
        // without treating older runs as replaceable output.
        clone.setPluginData('pdf-pilot-clone-source-id', sourceFrame.id);
        clone.setPluginData('pdf-pilot-clone-language-code', translation.languageCode);
        clone.setPluginData('pdf-pilot-clone-language-name', translation.language);
        clone.setPluginData('pdf-pilot-clone-source-name', sourceFrame.name);
        totalFramesCreated++;
        for (const nodeTranslation of translation.nodes) {
          if (!nodeTranslation.mappingKey.includes('::')) {
            errors.push({ mappingKey: nodeTranslation.mappingKey, error: 'Invalid mappingKey format in payload' });
            continue;
          }

          const parts = nodeTranslation.mappingKey.split('::');
          if (parts.length < 2 || !parts[1]) {
            errors.push({ mappingKey: nodeTranslation.mappingKey, error: 'Missing node path in mappingKey' });
            continue;
          }

          const path = parts[1];
          const indices = path.split('/').map(part => Number(part));
          if (indices.some(idx => !Number.isInteger(idx) || idx < 0)) {
            errors.push({ mappingKey: nodeTranslation.mappingKey, error: 'Invalid node path indices in mappingKey' });
            continue;
          }

          let current: SceneNode = clone as SceneNode;
          let found = true;
          for (const idx of indices) {
            if ('children' in current) {
              if (idx < current.children.length) {
                current = current.children[idx];
              } else {
                found = false;
                break;
              }
            } else {
              found = false;
              break;
            }
          }

          if (!found || current.type !== 'TEXT') {
            errors.push({ mappingKey: nodeTranslation.mappingKey, error: 'Mapped node not found or not a text node in clone' });
            continue;
          }

          const textNode = current as TextNode;
          try {
            await ensureTextNodeFontsLoaded(textNode);
            textNode.characters = nodeTranslation.translatedText;
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            errors.push({ mappingKey: nodeTranslation.mappingKey, error: message });
            pluginWarn('Text apply failed for node', { mappingKey: nodeTranslation.mappingKey, error: message });
          }
        }

        // Apply RTL text alignment for Arabic clones BEFORE overflow detection.
        // Figma's text engine renders Arabic script RTL automatically, but
        // alignment stays LEFT unless corrected. Flip LEFT → RIGHT so the
        // text sits at the correct edge of each text box.
        // This must happen before overflow detection so the audit uses
        // post-alignment geometry.
        if (translation.languageCode.split('-')[0] === 'ar') {
          await applyRtlAlignment(clone as SceneNode);
        }

        // Overflow detection for this clone
        const appliedMappingKeys = new Set(
          translation.nodes
            .filter(n => n.mappingKey.includes('::'))
            .map(n => n.mappingKey)
        );

        const cloneFrameName = sourceFrame.name;
        let scannedInClone = 0;
        let foundInClone = 0;
        const detectOverflows = (node: SceneNode, rootClone: SceneNode): void => {
          if (!node.visible) return;
          if (node.type === 'TEXT') {
            const path = getNodePath(node, rootClone);
            const mappingKey = `${translation.sourceFrameId}::${path}`;
            if (appliedMappingKeys.has(mappingKey)) {
              scannedInClone++;
              const overflow = checkOverflow(
                node as TextNode,
                mappingKey,
                translation.language,
                translation.languageCode,
                cloneFrameName,
                clone.id
              );
              if (overflow) {
                overflows.push(overflow);
                foundInClone++;
              }
            }
          }
          if ('children' in node) {
            for (const child of (node as FrameNode).children) {
              detectOverflows(child, rootClone);
            }
          }
        };
        detectOverflows(clone as SceneNode, clone as SceneNode);
        _totalOverflowScannedNodes += scannedInClone;
        if (foundInClone > 0) _clonesWithOverflow++;

        completedTranslationUnits++;
        figma.ui.postMessage({
          type: 'translation-apply-progress',
          completed: completedTranslationUnits,
          total: totalTranslationUnits,
          language: translation.language,
          frameName: sourceFrame.name,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ mappingKey: '__global__', error: `Unexpected translation apply failure: ${message}` });
      pluginError('Apply translations crashed', { error: message });
    }

    figma.ui.postMessage({ type: 'translation-complete', created: totalFramesCreated, errors, overflows, canceled: translationCancelRequested });
    if (translationCancelRequested) {
      figma.notify('Translation canceled ⚠️');
    } else {
      figma.notify(errors.length > 0 ? 'Translation completed with issues ⚠️' : 'Translation complete! ✅');
    }
  }

  if (type === 'decrease-font') {
    const nodeId = asString(msg?.nodeId);
    if (!nodeId) return;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT') return;
    const textNode = node as TextNode;
    try {
      await decreaseTextNodeFontByOne(textNode);
      figma.ui.postMessage({ type: 'audit-action-done', action: 'decrease-font', nodeId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'audit-action-error', action: 'decrease-font', nodeId, error: message });
    }
  }

  if (type === 'expand-layer') {
    const nodeId = asString(msg?.nodeId);
    if (!nodeId) return;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT') return;
    const textNode = node as TextNode;
    try {
      await loadAllFontsForTextNode(textNode);
      expandTextNodeLayer(textNode);
      figma.ui.postMessage({ type: 'audit-action-done', action: 'expand-layer', nodeId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'audit-action-error', action: 'expand-layer', nodeId, error: message });
    }
  }

  if (type === 'auto-fix-overflow') {
    const nodeId = asString(msg?.nodeId);
    if (!nodeId) return;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT') return;
    const textNode = node as TextNode;
    try {
      await loadAllFontsForTextNode(textNode);
      await decreaseTextNodeFontByOne(textNode);
      expandTextNodeLayer(textNode);
      figma.ui.postMessage({ type: 'audit-action-done', action: 'auto-fix-overflow', nodeId });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'audit-action-error', action: 'auto-fix-overflow', nodeId, error: message });
    }
  }

  if (type === 'focus-node') {
    const nodeId = asString(msg?.nodeId);
    if (!nodeId) return;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return;
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    figma.currentPage.selection = [node as SceneNode];
  }

  if (type === 'patch-node-translations') {
    // Re-apply specific translated texts to existing clone frames and
    // re-detect overflows, without creating new clones. Used by the
    // overflow auto-retry pipeline (up to 2 attempts per run).
    const patchErrors: { mappingKey: string; error: string }[] = [];
    const patchOverflows: OverflowInfo[] = [];

    const rawPatches = asArray(msg?.patches);
    const patches: PatchNodePayload[] = [];
    for (const p of rawPatches) {
      const pObj = asObject(p);
      if (!pObj) continue;
      const cloneFrameId = asString(pObj.cloneFrameId);
      const mappingKey = asString(pObj.mappingKey);
      const translatedText = asString(pObj.translatedText);
      if (!cloneFrameId || !mappingKey || translatedText === null) continue;
      patches.push({ cloneFrameId, mappingKey, translatedText });
    }

    // Group patches by clone so we look up each clone only once.
    const patchesByClone = new Map<string, PatchNodePayload[]>();
    for (const patch of patches) {
      const list = patchesByClone.get(patch.cloneFrameId) ?? [];
      list.push(patch);
      patchesByClone.set(patch.cloneFrameId, list);
    }

    const loadedFontKeys = new Set<string>();
    const patchEnsureFontLoaded = async (font: FontName): Promise<void> => {
      const key = `${font.family}::${font.style}`;
      if (loadedFontKeys.has(key)) return;
      await figma.loadFontAsync(font);
      loadedFontKeys.add(key);
    };
    const patchEnsureTextNodeFontsLoaded = async (textNode: TextNode): Promise<void> => {
      const fontName = textNode.fontName;
      if (fontName === figma.mixed) {
        const segments = textNode.getStyledTextSegments(['fontName']);
        for (const seg of segments) await patchEnsureFontLoaded(seg.fontName as FontName);
        return;
      }
      await patchEnsureFontLoaded(fontName);
    };

    for (const [cloneFrameId, clonePatches] of patchesByClone) {
      const cloneNode = await figma.getNodeByIdAsync(cloneFrameId);
      if (!cloneNode || (cloneNode.type !== 'FRAME' && cloneNode.type !== 'COMPONENT')) {
        for (const p of clonePatches) {
          patchErrors.push({ mappingKey: p.mappingKey, error: 'Clone frame not found or wrong type' });
        }
        continue;
      }
      const cloneFrame = cloneNode as FrameLike;
      const languageName = cloneFrame.getPluginData('pdf-pilot-clone-language-name') || '';
      const languageCode = cloneFrame.getPluginData('pdf-pilot-clone-language-code') || '';
      const sourceName = cloneFrame.getPluginData('pdf-pilot-clone-source-name') || cloneFrame.name;

      for (const patch of clonePatches) {
        const parts = patch.mappingKey.split('::');
        if (parts.length < 2 || !parts[1]) {
          patchErrors.push({ mappingKey: patch.mappingKey, error: 'Invalid mappingKey format' });
          continue;
        }
        const indices = parts[1].split('/').map(Number);
        if (indices.some(idx => !Number.isInteger(idx) || idx < 0)) {
          patchErrors.push({ mappingKey: patch.mappingKey, error: 'Invalid path indices' });
          continue;
        }

        let current: SceneNode = cloneFrame as SceneNode;
        let found = true;
        for (const idx of indices) {
          if ('children' in current && idx < current.children.length) {
            current = current.children[idx];
          } else {
            found = false;
            break;
          }
        }

        if (!found || current.type !== 'TEXT') {
          patchErrors.push({ mappingKey: patch.mappingKey, error: 'Node not found or not TEXT in clone' });
          continue;
        }

        const textNode = current as TextNode;
        try {
          await patchEnsureTextNodeFontsLoaded(textNode);
          textNode.characters = patch.translatedText;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          patchErrors.push({ mappingKey: patch.mappingKey, error: message });
          continue;
        }

        const overflow = checkOverflow(textNode, patch.mappingKey, languageName, languageCode, sourceName, cloneFrameId);
        if (overflow) patchOverflows.push(overflow);
      }
    }

    figma.ui.postMessage({ type: 'patch-complete', errors: patchErrors, overflows: patchOverflows });
  }
};
