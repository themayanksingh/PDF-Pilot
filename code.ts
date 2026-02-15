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
  if (!pluginDebugMode) return;
  console.error('[PDF Pilot Plugin]', ...args);
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
}

function parseTargetLanguagesPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string') as string[];
}

interface TranslationNodePayload {
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
  };
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

function isAllowedSelectionNode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
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

function getSelectionTextStats(frames: FrameNode[]): {
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

function checkOverflow(textNode: TextNode, mappingKey: string, language: string, frameName: string, cloneFrameId: string): OverflowInfo | null {
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

function extractLinks(frame: SceneNode): LinkInfo[] {
  const links: LinkInfo[] = [];
  const frameX = frame.absoluteTransform[0][2];
  const frameY = frame.absoluteTransform[1][2];

  function traverse(node: SceneNode) {
    if (!node.visible) return;

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      const len = textNode.characters.length;
      if (len === 0) return;

      let i = 0;
      while (i < len) {
        const link = textNode.getRangeHyperlink(i, i + 1) as { type: string; value: string } | null | symbol;
        if (link && typeof link === 'object' && link.type === 'URL' && link.value) {
          const url = link.value;
          while (i < len) {
            const nextLink = textNode.getRangeHyperlink(i, i + 1) as { type: string; value: string } | null | symbol;
            if (!nextLink || typeof nextLink !== 'object' || nextLink.type !== 'URL' || nextLink.value !== url) break;
            i++;
          }
          // Use the absolute bounding box of the text node as fallback
          const nodeX = node.absoluteTransform[0][2];
          const nodeY = node.absoluteTransform[1][2];
          links.push({
            url,
            x: nodeX - frameX,
            y: nodeY - frameY,
            width: node.width,
            height: node.height,
          });
        } else {
          i++;
        }
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

figma.on('selectionchange', sendSelection);

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
      const bytes = await (frame as FrameNode).exportAsync({
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
    pluginDebugMode = debugMode === true;
    figma.ui.postMessage({
      type: 'settings-loaded',
      settings: { provider, model, apiKeyGemini, apiKeyOpenai, quotaProfile, targetLanguages, debugMode: pluginDebugMode },
    });
  }

  if (type === 'save-settings') {
    const settings = parseSettingsPayload(msg?.settings);
    const debugMode = settings.debugMode === true;
    pluginDebugMode = debugMode;
    await figma.clientStorage.setAsync('ai-provider', settings.provider || 'gemini');
    await figma.clientStorage.setAsync('ai-model', settings.model || 'gemini-2.5-flash-lite');
    await figma.clientStorage.setAsync('api-key-gemini', settings.apiKeyGemini || '');
    await figma.clientStorage.setAsync('api-key-openai', settings.apiKeyOpenai || '');
    await figma.clientStorage.setAsync('quota-profile', settings.quotaProfile || 'auto');
    await figma.clientStorage.setAsync('target-languages', Array.isArray(settings.targetLanguages) ? settings.targetLanguages : []);
    await figma.clientStorage.setAsync('debug-mode', debugMode);
    figma.ui.postMessage({ type: 'settings-saved' });
    figma.notify('Settings saved ✅');
  }

  if (type === 'save-target-languages') {
    const targetLanguages = parseTargetLanguagesPayload(msg?.targetLanguages);
    await figma.clientStorage.setAsync('target-languages', targetLanguages);
  }

  if (type === 'extract-text') {
    const frameIdScope = Array.isArray(msg?.frameIds)
      ? (msg?.frameIds as unknown[]).filter(item => typeof item === 'string') as string[]
      : null;
    const selectedFrames = figma.currentPage.selection.filter(isAllowedSelectionNode);
    let frames: FrameNode[] = selectedFrames;
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
    let totalOverflowScannedNodes = 0;
    let clonesWithOverflow = 0;
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

      const sourceFramesById = new Map<string, FrameNode>();
      for (const t of translations) {
        if (sourceFramesById.has(t.sourceFrameId)) continue;
        const sourceNode = await figma.getNodeByIdAsync(t.sourceFrameId);
        if (!sourceNode) continue;
        if (sourceNode.type !== 'FRAME') continue;
        sourceFramesById.set(t.sourceFrameId, sourceNode);
      }

      const sourceFrames = Array.from(sourceFramesById.values());
      const layoutAnchorFrames: FrameNode[] = [];
      if (layoutFrameIds.length > 0) {
        for (const frameId of layoutFrameIds) {
          const node = await figma.getNodeByIdAsync(frameId);
          if (node && node.type === 'FRAME') layoutAnchorFrames.push(node);
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

        // Remove any existing clone for this frame+language (e.g. from a previous failed run).
        const expectedCloneName = `${sourceFrame.name} — ${translation.language}`;
        const parent = sourceFrame.parent;
        if (parent && 'children' in parent) {
          for (const child of [...parent.children]) {
            if (child.name === expectedCloneName && child.id !== sourceFrame.id) {
              child.remove();
            }
          }
        }

        const clone = sourceFrame.clone();
        const langIdx = languageIndices.get(translation.languageCode) ?? languageIndices.get(translation.language) ?? 0;
        clone.x = sourceFrame.x;
        clone.y = sourceFrame.y + rowStride * (langIdx + 1);
        clone.name = expectedCloneName;
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
        totalOverflowScannedNodes += scannedInClone;
        if (foundInClone > 0) clonesWithOverflow++;
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
};
