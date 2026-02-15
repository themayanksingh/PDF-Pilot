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
  debugMode?: boolean;
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
  return {
    provider: asString(obj.provider) || undefined,
    model: asString(obj.model) || undefined,
    apiKeyGemini: asString(obj.apiKeyGemini) || undefined,
    apiKeyOpenai: asString(obj.apiKeyOpenai) || undefined,
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
  figma.ui.postMessage({ type: 'selection-update', frames: getSelectedFrames() });
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
    pluginLog('Export started', { frameCount: frames.length, scale });

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
    pluginLog('Export data sent to UI', { frameCount: frames.length, imageCount: images.length });
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
    const debugMode = await figma.clientStorage.getAsync('debug-mode');
    pluginDebugMode = debugMode === true;
    figma.ui.postMessage({
      type: 'settings-loaded',
      settings: { provider, model, apiKeyGemini, apiKeyOpenai, debugMode: pluginDebugMode },
    });
  }

  if (type === 'save-settings') {
    const settings = parseSettingsPayload(msg?.settings);
    const debugMode = settings.debugMode === true;
    pluginDebugMode = debugMode;
    await figma.clientStorage.setAsync('ai-provider', settings.provider || 'gemini');
    await figma.clientStorage.setAsync('ai-model', settings.model || 'gemini-3-flash-preview');
    await figma.clientStorage.setAsync('api-key-gemini', settings.apiKeyGemini || '');
    await figma.clientStorage.setAsync('api-key-openai', settings.apiKeyOpenai || '');
    await figma.clientStorage.setAsync('debug-mode', debugMode);
    figma.ui.postMessage({ type: 'settings-saved' });
    figma.notify('Settings saved ✅');
  }

  if (type === 'extract-text') {
    const frames = figma.currentPage.selection.filter(isAllowedSelectionNode);

    if (frames.length === 0) {
      figma.notify('No frames selected');
      return;
    }
    pluginLog('Extract text started', { frameCount: frames.length });

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
    pluginLog('Extract text completed', { frameCount: frames.length, textNodeCount: allNodes.length });
  }

  if (type === 'apply-translations') {
    const errors: { mappingKey: string; error: string }[] = [];
    let totalFramesCreated = 0;
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
      pluginLog('Apply translations started', { translationItems: translations.length });

      const languageIndices = new Map<string, number>();
      let langCounter = 0;
      for (const t of translations) {
        if (!languageIndices.has(t.language)) {
          languageIndices.set(t.language, langCounter++);
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
      const sourceTop = sourceFrames.length > 0 ? Math.min(...sourceFrames.map(frame => frame.y)) : 0;
      const sourceBottom = sourceFrames.length > 0 ? Math.max(...sourceFrames.map(frame => frame.y + frame.height)) : 0;
      const sourceRowHeight = Math.max(0, sourceBottom - sourceTop);
      const rowGap = 120;
      const rowStride = sourceRowHeight + rowGap;
      const totalTranslationUnits = Math.max(1, translations.length);
      let completedTranslationUnits = 0;

      for (const translation of translations) {
        const sourceFrame = sourceFramesById.get(translation.sourceFrameId);
        if (!sourceFrame) continue;

        const clone = sourceFrame.clone();
        const langIdx = languageIndices.get(translation.language)!;
        clone.x = sourceFrame.x;
        clone.y = sourceFrame.y + rowStride * (langIdx + 1);
        clone.name = `${sourceFrame.name} — ${translation.language}`;
        totalFramesCreated++;
        pluginLog('Applying translation item', {
          language: translation.language,
          sourceFrameId: translation.sourceFrameId,
          nodeCount: translation.nodes.length,
        });

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

    figma.ui.postMessage({ type: 'translation-complete', created: totalFramesCreated, errors });
    figma.notify(errors.length > 0 ? 'Translation completed with issues ⚠️' : 'Translation complete! ✅');
    pluginLog('Apply translations finished', { created: totalFramesCreated, errorCount: errors.length });
  }
};
