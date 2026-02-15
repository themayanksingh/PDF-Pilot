# PDF Pilot — Translation Feature Plan

## Overview

Extend the existing "PDF Pilot" Figma plugin with a **Translate** tab that:
- Duplicates selected English frames for each target language
- Translates all text nodes using an AI provider (Gemini first, modular for others)
- Detects overflow issues and flags them for user review
- Provides an audit summary at the end

---

## Target Languages

### Phase 1 (Initial Release)

| Language | Code | Notes |
|----------|------|-------|
| English  | en   | Source language |
| French   | fr   | ~15-25% longer than English |
| German   | de   | ~20-35% longer, compound words |
| Spanish  | es   | ~15-25% longer |
| Italian  | it   | ~15-20% longer |
| Turkish  | tr   | ~10-20% longer, agglutinative |

### Phase 2

| Language | Code | Notes |
|----------|------|-------|
| Arabic   | ar   | RTL support required (alignment + layout direction) |

---

## Understanding Figma Text Layers

### Text Node Properties

Every `TextNode` in Figma has:
- `characters` — the actual text string
- `fontSize` — font size (can be mixed per-character)
- `fontName` — font family + style (can be mixed)
- `textAutoResize` — how the text box behaves:
  - `"NONE"` — Fixed width & height (text can visually overflow/clip)
  - `"HEIGHT"` — Fixed width, height auto-grows
  - `"WIDTH_AND_HEIGHT"` — Both dimensions auto-grow to fit text
  - `"TRUNCATE"` — Fixed size, text truncated with ellipsis (out of scope in Phase 1)
- `width`, `height` — current dimensions of the text node

### How Text Lives in a Frame

```
Frame (parent)
├── Text Layer "Heading" (textAutoResize: "WIDTH_AND_HEIGHT")
├── Text Layer "Body" (textAutoResize: "HEIGHT", fixed width)
├── Text Layer "Button" (textAutoResize: "NONE", fixed box)
└── Group
    └── Text Layer "Caption"
```

The text layer sits inside a parent frame. The parent frame has fixed dimensions
(the "slide" or "page" size). Even if a text node auto-resizes, it can grow
beyond the parent frame's bounds — that's the overflow we care about.

### Overflow Detection Strategy

**After translating and applying text to a duplicated node:**

1. Get the text node's bounding box (`absoluteBoundingBox` or `width`/`height`)
2. Get the parent frame's bounding box
3. Check if the text node's bottom/right edge exceeds the parent frame's bounds
4. Also check if auto-layout parents have clipping enabled

**What counts as overflow:**
- Text node bottom > parent frame bottom (vertical overflow)
- Text node right > parent frame right (horizontal overflow)
- For `"NONE"` resize mode: Figma doesn't auto-grow, so text visually clips.
  We can detect this by temporarily setting `textAutoResize = "HEIGHT"`,
  measuring the new height, comparing to original, then restoring.

---

## Architecture

### File Structure (planned)

```
PDF Pilot/
├── code.ts              → Main plugin logic (sandbox)
├── ui.html              → Plugin UI (iframe, has network access)
├── docs/
│   └── PLAN.md          → This file
├── manifest.json        → Plugin config (update networkAccess)
├── package.json
└── tsconfig.json
```

All code stays in `code.ts` (sandbox) and `ui.html` (UI iframe).
This matches the current structure — no new files needed.

### Why UI Makes Network Calls

Figma plugin sandbox (`code.ts`) does NOT have network access.
The UI iframe (`ui.html`) does. So:
- `code.ts` → extracts text nodes, duplicates frames, applies translations
- `ui.html` → calls AI APIs, holds settings UI, manages API keys

### Communication Flow

```
User clicks "Translate"
        │
        ▼
   [ui.html] sends message { type: 'extract-text' }
        │
        ▼
   [code.ts] extracts all text nodes from selected frames
             sends { type: 'text-data', nodes: [{ mappingKey, text, ... }] } to UI
        │
        ▼
   [ui.html] calls selected AI provider per frame/language
             validates response shape
             sends { type: 'apply-translations', translations: [{ sourceFrameId, language, languageCode, nodes: [{ mappingKey, translatedText }] }] } to code
        │
        ▼
   [code.ts] duplicates frames (once per language)
             applies translated text to each duplicate
             returns apply/font errors (if any)
             sends { type: 'translation-complete', created, errors } to UI
        │
        ▼
   [ui.html] shows audit summary
             includes API issues + apply/font issues
```

### Stable Mapping Key

Use a deterministic key that survives duplication:
- `mappingKey = <sourceFrameId>::<nodePath>`
- `nodePath` = child-index path from source frame root to text node (example: `0/3/2`)

Why this works:
- Duplicated frames get new Figma node IDs, so raw `node.id` is not stable.
- The duplicated frame keeps the same structure, so `nodePath` resolves to the equivalent node in each duplicate.

---

## UI Design

### Tab Layout

```
┌─────────────────────────────────────┐
│  [Export PDF]  [Translate]     ⚙️   │
├─────────────────────────────────────┤
│                                     │
│  (tab content here)                 │
│                                     │
└─────────────────────────────────────┘
```

The ⚙️ gear icon opens a settings modal for API key management.

### Export PDF Tab (existing functionality, unchanged)

Current UI lives here as-is.

### Translate Tab

```
┌─────────────────────────────────────┐
│  Selected: 10 frames               │
│                                     │
│  Source Language: [English ▼]       │
│                                     │
│  Target Languages:                  │
│  ☑ French    ☑ German    ☑ Spanish │
│  ☑ Italian   ☑ Turkish             │
│                                     │
│  Output: 50 frames (10 × 5 langs)  │
│                                     │
│  [Translate]              [Cancel]  │
│                                     │
│  ┌─ Progress ─────────────────────┐ │
│  │ Translating... 23/50 frames    │ │
│  │ ████████░░░░░░░░░░░ 38%       │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Settings Modal (⚙️)

```
┌─────────────────────────────────────┐
│  Settings                      ✕    │
├─────────────────────────────────────┤
│                                     │
│  AI Provider: [Gemini ▼]           │
│                                     │
│  API Key:                           │
│  [••••••••••••••••••••••] [👁]      │
│                                     │
│  Model: [gemini-2.5-flash-lite ▼] │
│                                     │
│  [Save]                   [Cancel]  │
└─────────────────────────────────────┘
```

### Audit/Review Panel (shown after translation completes)

```
┌─────────────────────────────────────┐
│  Translation Complete ✅            │
│  50 frames created                  │
│                                     │
│  ⚠️ 4 overflow issues found:       │
│                                     │
│  1. "Header Title" (French)         │
│     Text overflows by 24px width    │
│     [Decrease Font] [Expand Layer]  │
│     [Ignore]                        │
│                                     │
│  2. "CTA Button" (German)           │
│     Text overflows by 12px width    │
│     [Decrease Font] [Expand Layer]  │
│     [Ignore]                        │
│                                     │
│  [Accept All] [Re-translate Flagged]│
└─────────────────────────────────────┘
```

User options for each flagged item:
- **Decrease Font** — reduce font size by 1pt, re-check
- **Expand Layer** — increase text layer width to fit
- **Ignore** — leave as-is

---

## Modular AI Provider System

### Provider Interface (in ui.html JS)

```javascript
// Each provider implements this interface
const ProviderInterface = {
  name: 'string',           // "Gemini", "OpenAI", etc.
  models: ['array'],        // available models
  defaultModel: 'string',
  translate: async function(apiKey, model, texts, targetLang, constraints) {
    // texts: [{ mappingKey, text, charCount, containerWidth, containerHeight, fontSize }]
    // returns: [{ mappingKey, translatedText }]
  }
};
```

### Gemini Provider (Phase 1)

```javascript
const GeminiProvider = {
  name: 'Gemini',
  models: ['gemini-2.5-flash-lite'],
  defaultModel: 'gemini-2.5-flash-lite',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
  translate: async function(apiKey, model, texts, targetLang, constraints) {
    // Implementation
  }
};
```

Current OpenAI model options in UI:
- `gpt-5.2`
- `gpt-5-mini`

### Adding a New Provider (future)

To add OpenAI, Claude, etc., just create a new provider object with the same
interface and register it in the providers array. No other code changes needed.

### Storage

API keys and provider selection stored via `figma.clientStorage`:

```javascript
{
  "ai-provider": "gemini",
  "ai-model": "gemini-2.5-flash-lite",
  "api-key-gemini": "encrypted-or-plain-key",
  "api-key-openai": "encrypted-or-plain-key"
}
```

Ownership and message bridge:
- `code.ts` is the only layer that reads/writes `figma.clientStorage`.
- `ui.html` requests settings via postMessage (`get-settings`) and saves via (`save-settings`).
- `code.ts` responds with sanitized settings (`settings-loaded`) so UI never directly touches plugin storage APIs.

---

## Translation Prompt Strategy

### Constraint-Aware Prompt

```
You are a professional translator and localization expert.

Translate the following texts from English to {targetLanguage}.

CRITICAL RULES:
1. Preserve the original meaning accurately
2. Each text has a character budget — try to stay within it
3. If the natural translation is longer, rephrase concisely without losing meaning
4. Do NOT truncate, abbreviate unnaturally, or sacrifice clarity
5. Return JSON array with the exact same `mappingKey` values

Texts to translate:
[
  { "mappingKey": "12:34::0/3/2", "text": "Get Started Today", "charBudget": 20 },
  { "mappingKey": "12:34::1/0", "text": "Our platform helps teams collaborate...", "charBudget": 45 },
  ...
]

Respond with ONLY a JSON array:
[
  { "mappingKey": "12:34::0/3/2", "translation": "..." },
  { "mappingKey": "12:34::1/0", "translation": "..." }
]
```

### Batching

- If a frame has 20 or fewer text nodes, send one API call per frame per language.
- If a frame has more than 20 text nodes, batch into groups of 20 for that frame/language.
- Total calls formula: `sum(ceil(textNodeCountPerFrame / 20)) × targetLanguageCount`.
- Example baseline: 10 frames (all <=20 nodes) × 5 languages = 50 API calls.

---

## Overflow Detection (detailed)

### After applying translation to a duplicated text node:

```typescript
function getBounds(node: SceneNode) {
  const abs = node.absoluteBoundingBox;
  if (!abs) return null;
  return {
    left: abs.x,
    top: abs.y,
    right: abs.x + abs.width,
    bottom: abs.y + abs.height,
  };
}

function findOverflowContainer(textNode: TextNode): SceneNode | null {
  // Prefer nearest clipping ancestor, otherwise nearest frame/component/instance ancestor.
  let current: BaseNode | null = textNode.parent;
  while (current && current.type !== 'PAGE') {
    if ('clipsContent' in current && current.clipsContent) return current as SceneNode;
    if (current.type === 'FRAME' || current.type === 'COMPONENT' || current.type === 'INSTANCE') {
      return current as SceneNode;
    }
    current = current.parent;
  }
  return null;
}

function checkOverflow(textNode: TextNode): OverflowInfo | null {
  const container = findOverflowContainer(textNode);
  if (!container) return null;

  const containerBounds = getBounds(container);
  const nodeBounds = getBounds(textNode);
  if (!containerBounds || !nodeBounds) return null;

  const overflowX = nodeBounds.right - containerBounds.right;
  const overflowY = nodeBounds.bottom - containerBounds.bottom;

  if (overflowX > 0 || overflowY > 0) {
    return {
      nodeId: textNode.id,
      nodeName: textNode.name,
      overflowX: Math.max(0, overflowX),
      overflowY: Math.max(0, overflowY),
    };
  }
  return null;
}
```

### For fixed-size text boxes (`textAutoResize: "NONE"`):

The text node dimensions don't change when text overflows — Figma just clips it.
To detect this:
1. Store original `textAutoResize` and `height`
2. Temporarily set `textAutoResize = "HEIGHT"` (let it grow)
3. Compare new height to original height
4. Restore original `textAutoResize` and dimensions
5. If new height > original height → flagged as overflow

---

## Implementation Phases

### Phase 1: Foundation (Build First)
- [x] Add tabbed UI (Export PDF | Translate) to ui.html
- [x] Add settings gear icon + modal for API key management
- [x] Implement Gemini provider
- [x] Basic text extraction from frames (traverse all TextNodes)
- [x] Simple translation (no constraint-awareness yet)
- [x] Add stable mapping key (`sourceFrameId::nodePath`) from extraction through apply
- [x] Skip `textAutoResize: "TRUNCATE"` nodes in Phase 1 and list them in audit as unsupported
- [x] Load required fonts before applying translated text (including mixed text styles/ranges)
- [x] Handle font-load failures and include them in audit summary
- [x] Frame duplication per language
- [x] Apply translated text back to duplicated frames
- [x] Basic progress indicator

### Phase 2: Overflow Detection & Review
- [x] Implement overflow detection logic
- [x] Audit summary panel in UI
- [x] User actions: Decrease Font / Expand Layer / Ignore
- [x] Focus-on-click to navigate to overflowing node
- [x] Add Arabic as target language
- [ ] Re-translate flagged items with tighter constraints (deferred to Phase 3)
- [ ] Add RTL support (text alignment + layout direction checks) (deferred — Arabic translates but no auto-RTL flip)

### Phase 3: Constraint-Aware Translation
- [ ] Send character budgets and spatial constraints in prompt
- [ ] Auto-retry with tighter budget on overflow (max 2 retries, no user input)
- [ ] Only flag items that still overflow after retries

### Phase 4: Polish & Future
- [ ] Add more AI providers (OpenAI, Claude)
- [ ] Remember last-used language selections
- [ ] Export translated frames directly to PDF

---

## Manifest Changes Required

```json
{
  "networkAccess": {
    "allowedDomains": [
      "https://generativelanguage.googleapis.com",
      "https://api.openai.com"
    ]
  }
}
```

---

## Risks & Considerations

1. **API Rate Limits**: Gemini free tier has limits. Baseline is 50 calls for a
   10-frame × 5-language job (when each frame has <=20 text nodes), but batching
   can increase this. Consider caching translations.

2. **Mixed Fonts**: A text node can have mixed fontName/fontSize per character.
   Need to handle `figma.mixed` values carefully.

3. **Text Styles**: After replacing text, font styles (bold, italic, colors,
   links) may be lost. Need to preserve style ranges.

4. **Cost**: Each translation call costs API credits. Show estimated cost
   before starting.

5. **Font Availability**: Translated text may need fonts that support the
   target language's characters (e.g., Arabic script). Figma will show
   missing font warnings if the current font doesn't support the characters.
