figma.showUI(__html__, { width: 400, height: 520, themeColors: true });
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

interface ModelSpendBreakdown {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_inr: number;
}

interface SpendRunRecord {
  run_id: string;
  last_run_at: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_cost_inr: number;
  fx_rate_usd_inr: number | null;
  model_breakdown: ModelSpendBreakdown[];
}

interface SpendSummary {
  total_cost_usd: number;
  total_cost_inr: number;
  total_tokens: number;
  count: number;
}

const SPEND_RECENT_RUNS_KEY = 'spend-runs-v2';
const SPEND_ALL_TIME_SUMMARY_KEY = 'spend-all-time-summary-v1';
const SPEND_KNOWN_RUN_IDS_KEY = 'spend-known-run-ids-v1';
const SPEND_RECENT_RUN_LIMIT = 10;
const SPEND_KNOWN_RUN_IDS_LIMIT = 200;

function parseTargetLanguagesPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string') as string[];
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
  textNode.resize(textNode.width + 40, textNode.height);
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
    total_cost_inr: 0,
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
    cost_inr: numberOr(obj.cost_inr ?? obj.costInr, 0),
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
  const fxRate = asNumber(obj.fx_rate_usd_inr ?? obj.fxRateUsdInr);
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
    total_cost_inr: numberOr(obj.total_cost_inr ?? obj.totalCostInr, 0),
    fx_rate_usd_inr: fxRate === null ? null : fxRate,
    model_breakdown: normalizedBreakdown,
  };
}

function mergeSummaryWithRun(summary: SpendSummary, run: SpendRunRecord): SpendSummary {
  return {
    total_cost_usd: summary.total_cost_usd + run.total_cost_usd,
    total_cost_inr: summary.total_cost_inr + run.total_cost_inr,
    total_tokens: summary.total_tokens + run.total_tokens,
    count: summary.count + 1,
  };
}

function normalizeSpendSummary(value: unknown): SpendSummary {
  const obj = asObject(value);
  if (!obj) return emptySpendSummary();
  return {
    total_cost_usd: numberOr(obj.total_cost_usd ?? obj.totalCostUsd, 0),
    total_cost_inr: numberOr(obj.total_cost_inr ?? obj.totalCostInr, 0),
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
    .map(node => ({
      id: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height),
    }));
}

function getSelectionTextStats(frames: FrameLike[]): {
  textNodeCount: number;
  totalCharCount: number;
  truncatedNodeCount: number;
} {
  let textNodeCount = 0;
  let totalCharCount = 0;
  let truncatedNodeCount = 0;

  for (const frame of frames) {
    const textNodes = extractTextNodes(frame);
    textNodeCount += textNodes.length;
    for (const textNode of textNodes) {
      totalCharCount += textNode.charCount;
      if (textNode.truncated) truncatedNodeCount += 1;
    }
  }

  return { textNodeCount, totalCharCount, truncatedNodeCount };
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
  const selectedFrameNodes = figma.currentPage.selection.filter(isAllowedSelectionNode);
  const frames = getSelectedFrames();
  const selectionStats = getSelectionTextStats(selectedFrameNodes);
  figma.ui.postMessage({ type: 'selection-update', frames, selectionStats });
}

let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
    const frames = figma.currentPage.selection.filter(isAllowedSelectionNode);

    if (frames.length === 0) {
      figma.notify('No frames selected');
      return;
    }
    const images: string[] = [];
    const allLinks: LinkInfo[][] = [];

    for (const frame of frames) {
      const bytes = await (frame as FrameLike).exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: scale },
      });
      const base64 = 'data:image/png;base64,' + figma.base64Encode(bytes);
      images.push(base64);
      allLinks.push(extractLinks(frame));
    }

    figma.ui.postMessage({ type: 'export-data', images, links: allLinks });
  }

  if (type === 'export-done') {
    figma.notify('PDF exported successfully! ✅');
  }

  if (type === 'cancel') {
    figma.closePlugin();
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
        const deltaCostInr = runRecord.total_cost_inr - oldRun.total_cost_inr;
        const deltaTokens = runRecord.total_tokens - oldRun.total_tokens;
        if (deltaCostUsd > 0 || deltaCostInr > 0 || deltaTokens > 0) {
          nextAllTimeSummary = {
            total_cost_usd: allTimeSummary.total_cost_usd + Math.max(0, deltaCostUsd),
            total_cost_inr: allTimeSummary.total_cost_inr + Math.max(0, deltaCostInr),
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
    const selectedFrames = figma.currentPage.selection.filter(isAllowedSelectionNode);
    let frames: FrameLike[] = selectedFrames;
    if (frameIdScope && frameIdScope.length > 0) {
      const idSet = new Set(frameIdScope);
      frames = selectedFrames.filter(frame => idSet.has(frame.id));
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

    figma.ui.postMessage({ type: 'text-data', nodes: allNodes, frameCount: frames.length });
  }

  if (type === 'apply-translations') {
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
      const sourceTop = framesForLayout.length > 0 ? Math.min(...framesForLayout.map(frame => frame.y)) : 0;
      const sourceBottom = framesForLayout.length > 0 ? Math.max(...framesForLayout.map(frame => frame.y + frame.height)) : 0;
      const sourceRowHeight = Math.max(0, sourceBottom - sourceTop);
      const rowGap = 120;
      const rowStride = sourceRowHeight + rowGap;
      pluginLog('Clone layout anchors', {
        translationFrameCount: sourceFrames.length,
        layoutAnchorFrameCount: layoutAnchorFrames.length,
        sourceRowHeight: Math.round(sourceRowHeight),
        rowStride: Math.round(rowStride),
      });
      const totalTranslationUnits = Math.max(1, translations.length);
      let completedTranslationUnits = 0;

      for (const translation of translations) {
        const sourceFrame = sourceFramesById.get(translation.sourceFrameId);
        if (!sourceFrame) continue;

        // Remove any existing plugin-created clone for this frame+language
        // (e.g. from a previous failed run). Match by plugin metadata rather
        // than name to avoid accidentally deleting user frames that happen to
        // share the same naming pattern.
        const parent = sourceFrame.parent;
        if (parent && 'children' in parent) {
          for (const child of [...parent.children]) {
            if (
              child.id !== sourceFrame.id &&
              child.getPluginData('pdf-pilot-clone-source-id') === sourceFrame.id &&
              child.getPluginData('pdf-pilot-clone-language-code') === translation.languageCode
            ) {
              child.remove();
            }
          }
        }

        const clone = sourceFrame.clone();
        const langIdx = languageIndices.get(translation.languageCode) ?? languageIndices.get(translation.language) ?? 0;
        clone.x = sourceFrame.x;
        clone.y = sourceFrame.y + rowStride * (langIdx + 1);
        clone.name = `${sourceFrame.name} — ${translation.language}`;
        // Tag the clone so future runs can identify and replace it by metadata
        // instead of name, preventing accidental deletion of user frames.
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
          const applyRtlAlignment = (node: SceneNode): void => {
            if (node.type === 'TEXT') {
              const textNode = node as TextNode;
              if (textNode.textAlignHorizontal === 'LEFT') {
                textNode.textAlignHorizontal = 'RIGHT';
              }
            }
            if ('children' in node) {
              for (const child of (node as FrameNode).children) {
                applyRtlAlignment(child);
              }
            }
          };
          applyRtlAlignment(clone as SceneNode);
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

    figma.ui.postMessage({ type: 'translation-complete', created: totalFramesCreated, errors, overflows });
    figma.notify(errors.length > 0 ? 'Translation completed with issues ⚠️' : 'Translation complete! ✅');
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
