# Final Study: DOMAgent vs Page Agent -- Comparison, Gaps & Improvement Plan

> **Date**: 2026-03-17
> **Scope**: Comparing Alibaba's `page-agent` with our `domagent-mcp` + `domagent-extension` (Chrome & Firefox)
> **Goal**: Identify what we have, what we're missing, and how to improve MCP-to-extension interaction

---

## 1. Architecture Comparison at a Glance

### Page Agent (Alibaba)

```
  User's webpage
    |
    v
  [page-agent.js injected as <script>]
    |
    +-- PageAgent (UI entry)
    +-- PageAgentCore (ReAct loop)
    +-- LLM Client (OpenAI-compatible)
    +-- PageController (DOM ops)
    v
  Directly manipulates DOM from within the page
```

- **Everything runs in-page** -- no extension, no external bridge
- **Text LLM only** -- no screenshots, no vision model needed
- **Single-page** -- cannot cross page boundaries without extension
- The LLM runs in a loop, calling tools itself, observing results

### DOMAgent (Ours)

```
  AI Host (Claude, etc. via MCP)
    |
    v  (stdio)
  [domagent-mcp] Node.js MCP Server
    |
    v  (WebSocket ws://127.0.0.1:18792)
  [Browser Extension] (background.js)
    |
    |-- Chrome: chrome.debugger API (CDP)
    |-- Firefox: content.js relay (no CDP)
    v
  Target tab DOM
```

- **External orchestration** -- the AI host (Cursor, Claude Desktop, etc.) drives the loop
- **Screenshot + text** -- supports both vision and text extraction
- **Multi-page** -- can navigate, create tabs, adopt tabs
- The AI host decides what to do; MCP tools are just primitives

---

## 2. What We Have (DOMAgent Inventory)

### 2.1 MCP Server (`domagent-mcp`)

| Tool | Description | Selector-based? |
|---|---|---|
| `navigate` | Open URL in automation tab | -- |
| `use_current_tab` | Adopt user's active tab | -- |
| `click` | Click element | CSS selector |
| `type_text` | Type into input field | CSS selector |
| `get_text` | Read element text | CSS selector |
| `evaluate_script` | Run arbitrary JS | -- |
| `get_screenshot` | Capture PNG (base64) | -- |
| `get_interactive_elements` | Scan page, draw overlays | -- |
| `clear_overlays` | Remove overlay boxes | -- |

**Communication**: WebSocket bridge (`BridgeServer`) between MCP server and extension.

### 2.2 Chrome Extension

| Feature | Implementation |
|---|---|
| Tab management | `chrome.debugger` API (CDP v1.3) |
| DOM actions | Injected JS via `Runtime.evaluate` |
| Screenshots | `Page.captureScreenshot` via CDP |
| Automation tab | Persistent, survives SW suspension via `chrome.storage.session` |
| Auto-attach | All eligible tabs auto-attached on creation/update |
| Toggle | Toolbar icon toggles per-tab debugging |
| Activity log | Broadcasts `da:activity` messages to side panel UI |
| Side panel | Settings + live activity log via `options.html` |
| Overlay settings | Configurable opacity per overlay type |

### 2.3 Firefox Extension

| Feature | Implementation |
|---|---|
| Tab management | Content script relay (no `chrome.debugger`) |
| DOM actions | Direct execution in `content.js` (same-world) |
| Screenshots | Delegated to `browser.tabs.captureVisibleTab()` in background |
| Sidebar | `browser.sidebarAction` for settings |
| Content script | Injected at `document_idle` in all frames |

### 2.4 Shared Features (Both Extensions)

- WebSocket connection to bridge server with ping/pong keepalive
- Automation tab persistence + recovery
- Visual overlays (yellow=click, green=type, cyan=text)
- Index badges on scanned elements
- Action highlight animations (pulse + click dot)
- Native value setter trick for React/Vue input compatibility
- Full mouse event sequence (pointerdown, mousedown, pointerup, mouseup, click)
- Configurable overlay opacity
- Tab eligibility filtering (http/https/file/about:blank only)

---

## 3. What Page Agent Has That We Don't

### 3.1 ReAct Agent Loop (Reflection-Before-Action)

**Page Agent** has a built-in agent loop with the "MacroTool" pattern:

```json
{
  "evaluation_previous_goal": "Form was submitted successfully",
  "memory": "Filled name and email, submitted. Need to check confirmation.",
  "next_goal": "Look for success message on the page",
  "action": { "click_element_by_index": { "index": 5 } }
}
```

**DOMAgent** has no built-in loop. The AI host (Cursor, Claude) drives the loop externally. This is actually fine -- MCP tools are primitives, and the AI host handles reasoning.

> **Verdict**: NOT a gap. Our MCP-based design is intentionally different. The AI host IS the reasoning engine.

### 3.2 Simplified HTML / Text-Based DOM Representation

**Page Agent** converts the DOM into a compact text format the LLM reads:

```
[0]<a aria-label=Homepage />
[1]<input placeholder=Search type=text />
*[2]<button>Submit />
Some descriptive text here
[3]<select name=country>Country />
```

**DOMAgent** returns a JSON array from `get_interactive_elements`:

```json
[
  { "index": 0, "tag": "a", "kind": "click", "text": "Homepage", "selector": "a#home", ... },
  { "index": 1, "tag": "input", "kind": "type", "text": "", "selector": "input#search", ... }
]
```

| Aspect | Page Agent | DOMAgent |
|---|---|---|
| Format | Compact text (HTML-like) | JSON array |
| Includes text content | Yes (inline between elements) | Only for `kind: text` elements |
| Parent-child hierarchy | Yes (tab indentation) | No |
| New element markers | `*[N]` prefix | No |
| Scrollable indicators | `data-scrollable` attribute | No |
| Attributes included | 18+ (aria-label, role, value, etc.) | 5 (id, name, type, placeholder, role) |
| Element cap | Full page | 100 interactive + 150 text |

> **Verdict**: SIGNIFICANT GAP. Page Agent's DOM representation is richer and more useful for LLMs.

### 3.3 Scroll Support

**Page Agent** has dedicated scroll tools:
- `scroll` -- vertical, page-level or element-specific
- `scroll_horizontally` -- horizontal scrolling
- Smart parent-walk to find scrollable container
- Boundary detection ("Already at the bottom")

**DOMAgent** has NO scroll tools. The LLM must use `evaluate_script` with custom JS.

> **Verdict**: GAP. Should add native scroll tools.

### 3.4 Select Dropdown Support

**Page Agent** has `select_dropdown_option` tool for native `<select>` elements.

**DOMAgent** has no dedicated dropdown tool. Must use `evaluate_script` or `click`.

> **Verdict**: MINOR GAP. Can be worked around, but a dedicated tool would help.

### 3.5 Wait Tool

**Page Agent** has a `wait` tool that intelligently subtracts LLM response time.

**DOMAgent** has no wait tool. The AI host can delay between calls, but there's no way to tell the extension "wait 2 seconds and re-scan."

> **Verdict**: MINOR GAP. Useful for dynamic pages.

### 3.6 Contenteditable / Rich Text Support

**Page Agent** has explicit `contenteditable` support in `inputTextElement()`:
- Dispatches `beforeinput` / `input` events with correct `inputType`
- Handles clearing then inserting for React-based editors
- Works with LinkedIn, Quill, etc.

**DOMAgent** only uses the native value setter trick. Contenteditable elements get no special treatment.

> **Verdict**: GAP. Rich text editors are increasingly common.

### 3.7 Hover / Focus Events Before Click

**Page Agent** dispatches:
```
mouseenter -> mouseover -> mousedown -> focus() -> mouseup -> click
```

**DOMAgent** dispatches:
```
pointerdown -> mousedown -> pointerup -> mouseup -> click
```

Page Agent adds `mouseenter`, `mouseover`, and `focus()` which trigger hover states, tooltips, and dropdown menus.

> **Verdict**: GAP. Missing hover events can break hover-triggered UI patterns.

### 3.8 SimulatorMask (Block User During Automation)

**Page Agent** overlays a mask that blocks user interaction while the agent works, preventing interference.

**DOMAgent** has no concept of blocking user interaction.

> **Verdict**: OPTIONAL. Less critical for MCP-driven automation where the user is watching the AI host.

### 3.9 Page Info / Scroll Position Context

**Page Agent** includes rich page metadata with every step:
```
Page info: 1920x1080px viewport, 1920x5400px total, 2.3 pages above, 1.7 pages below
```

**DOMAgent** returns no page/scroll context. The LLM has no idea how much content is off-screen.

> **Verdict**: GAP. Critical for knowing when to scroll.

### 3.10 Framework Patches (React, Ant Design)

**Page Agent** has dedicated patches for React and Ant Design to handle edge cases in synthetic event dispatch.

**DOMAgent** has no framework-specific patches.

> **Verdict**: MINOR GAP. The native value setter handles most React cases.

---

## 4. What We Have That Page Agent Doesn't

### 4.1 Multi-Page / Multi-Tab Support

DOMAgent can navigate between pages, create new tabs, close tabs, and adopt tabs. Page Agent is limited to a single page (SPA) without its extension.

### 4.2 Screenshots

DOMAgent can capture full-page PNG screenshots for vision-capable LLMs. Page Agent is text-only.

### 4.3 MCP Protocol Compliance

DOMAgent is a proper MCP server that works with any MCP-compatible AI host. Page Agent requires its own integration code.

### 4.4 Cross-Browser Support

DOMAgent works on both Chrome (CDP) and Firefox (content script relay). Page Agent's extension is Chrome-only (WIP).

### 4.5 External AI / BYO-Host

DOMAgent works with any AI that supports MCP (Claude, Cursor, Windsurf, etc.). Page Agent bundles its own LLM client and loop.

### 4.6 Configurable Overlays

DOMAgent's overlay opacity and visibility are user-configurable per type (click/type/text) via the extension settings. Page Agent's overlays are hardcoded.

### 4.7 Activity Log

DOMAgent broadcasts detailed activity events to the side panel for user visibility. Page Agent has a built-in panel but it shows the agent's own reasoning, not the raw tool calls.

---

## 5. Communication Flow Deep Dive: How MCP Talks to Extension

### Current Flow

```
  MCP Host (Claude/Cursor)
    |  stdio (JSON-RPC)
    v
  domagent-mcp/index.js           <-- MCP Server (ListTools, CallTool)
    |  calls BridgeServer methods
    v
  domagent-mcp/server.js          <-- BridgeServer (WebSocket server)
    |  ws://127.0.0.1:18792/extension
    v
  Extension background.js          <-- WebSocket client
    |  Chrome: chrome.debugger.sendCommand(debuggee, method, params)
    |  Firefox: api.tabs.sendMessage(tabId, command)
    v
  Page DOM
```

### Message Format

```
MCP -> Bridge:
  { id: 1, method: "forwardCDPCommand", params: { method: "Runtime.evaluate", params: { expression: "..." }, sessionId: "cb-tab-1" } }

Bridge -> MCP:
  { id: 1, result: { result: { type: "string", value: "..." } } }
```

### Key Design Decisions

1. **All DOM ops are injected JS** -- Even `click`, `type`, and `getInteractiveElements` are constructed as JS strings in `server.js`, sent via `Runtime.evaluate` to the extension, which runs them via `chrome.debugger.sendCommand` (Chrome) or `content.js` (Firefox).

2. **No dedicated message types** -- Click, type, scan are all `Runtime.evaluate` with different JS payloads. The extension doesn't know what "tool" is being called.

3. **Single automation tab** -- Only one tab is active for MCP commands at a time.

4. **Session management** -- Uses synthetic session IDs (`cb-tab-N`) mapped to tab IDs.

---

## 6. Improvement Opportunities

### Priority 1 -- High Impact, Low Effort

#### 6.1 Add Scroll Tools

Add `scroll_down`, `scroll_up`, `scroll_to_element` tools to the MCP server.

```javascript
// In BridgeServer
async scrollVertically(direction, pixels = null) {
  const amount = pixels || (direction === 'down' ? window.innerHeight * 0.8 : -window.innerHeight * 0.8);
  return this.evaluate(`window.scrollBy(0, ${amount}); 'scrolled'`);
}
```

And register as MCP tools:
- `scroll_down` / `scroll_up` (page-level)
- `scroll_element` (element-specific with CSS selector)

#### 6.2 Enrich `get_interactive_elements` Output

Add to the scan results:
- **More attributes**: `aria-label`, `aria-expanded`, `value`, `checked`, `contenteditable`, `target`, `href`
- **Page info**: viewport size, scroll position, total page height, pages above/below
- **New element detection**: Track which elements are new since last scan
- **Parent-child hierarchy**: Indentation or `parentIndex` field
- **Scrollable containers**: Mark elements with `data-scrollable` info

#### 6.3 Add `mouseenter`/`mouseover`/`focus()` to Click Sequence

Update the click implementation to match Page Agent's full event chain:

```javascript
// Current (missing hover + focus):
el.dispatchEvent(new MouseEvent('pointerdown', evOpts));
el.dispatchEvent(new MouseEvent('mousedown', evOpts));
el.dispatchEvent(new MouseEvent('pointerup', evOpts));
el.dispatchEvent(new MouseEvent('mouseup', evOpts));
el.dispatchEvent(new MouseEvent('click', evOpts));

// Improved (add hover + focus):
el.dispatchEvent(new MouseEvent('mouseenter', { ...evOpts, bubbles: false }));
el.dispatchEvent(new MouseEvent('mouseover', evOpts));
el.dispatchEvent(new MouseEvent('pointerdown', evOpts));
el.dispatchEvent(new MouseEvent('mousedown', evOpts));
el.focus();
el.dispatchEvent(new MouseEvent('pointerup', evOpts));
el.dispatchEvent(new MouseEvent('mouseup', evOpts));
el.dispatchEvent(new MouseEvent('click', evOpts));
```

#### 6.4 Add `get_page_info` Tool

Expose a lightweight tool that returns scroll position and page dimensions:

```json
{
  "viewport": { "width": 1920, "height": 1080 },
  "page": { "width": 1920, "height": 5400 },
  "scroll": { "x": 0, "y": 2160 },
  "pagesAbove": 2.0,
  "pagesBelow": 1.0,
  "atTop": false,
  "atBottom": false
}
```

This costs almost nothing and dramatically helps the LLM understand the page.

---

### Priority 2 -- Medium Impact, Medium Effort

#### 6.5 Index-Based Element Addressing

Currently, the LLM must use CSS selectors to interact with elements. Page Agent uses **indices** (`[0]`, `[1]`, etc.) which are simpler and less error-prone.

**Proposal**: After `get_interactive_elements`, cache the element list server-side. Add new tools:

- `click_by_index(index)` -- click element N from the last scan
- `type_by_index(index, text)` -- type into element N

This requires the MCP server to remember the last scan's selectors:

```javascript
// In BridgeServer
this._lastScanSelectors = [];  // populated by getInteractiveElements

async clickByIndex(index) {
  const selector = this._lastScanSelectors[index];
  if (!selector) throw new Error(`No element at index ${index}`);
  return this.click(selector);
}
```

#### 6.6 Contenteditable Support in `type_text`

Add contenteditable detection and proper event dispatch:

```javascript
// In the type injection code:
if (el.getAttribute('contenteditable') === 'true') {
  el.focus();
  el.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true, inputType: 'deleteContent'
  }));
  el.innerText = '';
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }));
  el.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true, inputType: 'insertText', data: text
  }));
  el.innerText = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

#### 6.7 Add `select_option` Tool

For native `<select>` elements:

```javascript
async selectOption(selector, optionText) {
  return this.evaluate(`(function(){
    var el = document.querySelector('${escapeJS(selector)}');
    if (!el || el.tagName !== 'SELECT') throw new Error('Not a select element');
    var opt = Array.from(el.options).find(o => o.textContent.trim() === '${escapeJS(optionText)}');
    if (!opt) throw new Error('Option not found');
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'Selected: ' + opt.textContent;
  })()`);
}
```

#### 6.8 Add `wait` Tool

Simple but useful:

```javascript
// MCP tool definition
{
  name: "wait",
  description: "Wait for a specified number of seconds (1-10). Useful for dynamic content loading.",
  inputSchema: {
    type: "object",
    properties: {
      seconds: { type: "number", minimum: 1, maximum: 10, default: 2 }
    }
  }
}
```

---

### Priority 3 -- High Impact, High Effort

#### 6.9 Structured DOM Protocol (Replace JS Injection)

Currently, ALL DOM operations are giant JS strings injected via `Runtime.evaluate`. This has problems:
- Fragile string escaping
- Hard to maintain and test
- No type safety
- Duplicated logic between `server.js` and `content.js`

**Proposal**: Define a proper message protocol between MCP and extension:

```json
// Instead of injecting JS for every action:
// MCP -> Extension:
{ "method": "DOMAgent.click", "params": { "selector": "button#submit" } }
{ "method": "DOMAgent.type", "params": { "selector": "input#name", "text": "John" } }
{ "method": "DOMAgent.scan", "params": { "options": { "includeText": true } } }
{ "method": "DOMAgent.scroll", "params": { "direction": "down", "amount": 0.5 } }

// Extension -> MCP:
{ "result": { "success": true, "message": "Clicked button#submit" } }
```

This would:
1. Move DOM logic from `server.js` into the extension (closer to the DOM).
2. Work identically on Chrome (CDP) and Firefox (content script).
3. Eliminate JS string injection entirely.
4. Make the protocol testable and documented.
5. Allow the extension to implement DOM ops natively (no eval).

#### 6.10 Simplified HTML Output Mode

Add an alternative output format to `get_interactive_elements` inspired by Page Agent:

```
Current Page: [Google Search](https://www.google.com)
Page info: 1920x1080px viewport, 4500px tall, 0 pages above, 2.3 pages below

[0]<input name=q placeholder=Search type=text />
[1]<button aria-label=Google Search>Google Search />
*[2]<a href=/about>About />
[3]<select name=language>English />

Advanced Search options
Privacy and Terms of Service
```

This text format uses fewer tokens than JSON and includes context like indentation, plain text, and page info. Could be offered as `get_interactive_elements_text` or a `format` parameter.

#### 6.11 Bidirectional Extension Communication

Currently, the extension is passive -- it only responds to MCP commands. Page Agent's extension can push events (page navigation, DOM mutations) to the agent.

**Proposal**: Let the extension push events to the MCP server:

```json
// Extension -> MCP (unsolicited events):
{ "event": "page_navigated", "url": "https://example.com/result", "title": "Results" }
{ "event": "dom_changed", "addedElements": 5, "removedElements": 2 }
{ "event": "dialog_appeared", "type": "alert", "message": "Are you sure?" }
```

The MCP server could expose these via MCP Resources or tool responses.

---

## 7. Chrome vs Firefox Extension: Gap Analysis

| Feature | Chrome | Firefox | Gap |
|---|---|---|---|
| Debugger API | `chrome.debugger` (CDP) | NOT AVAILABLE | Chrome can do CDP-level ops; Firefox can't |
| DOM execution | `Runtime.evaluate` via CDP | `content.js` direct (same-world) | Firefox is simpler but less powerful |
| Screenshot | `Page.captureScreenshot` (CDP) | `browser.tabs.captureVisibleTab()` | Both work, different APIs |
| Side panel | `chrome.sidePanel` | `browser.sidebarAction` | API differences handled |
| Activity broadcast | `chrome.runtime.sendMessage` | Not implemented | Firefox lacks activity log in sidebar |
| Tab lifecycle events | `chrome.debugger.onEvent/onDetach` | `api.tabs.onRemoved` | Firefox handles tab closure |
| Content script | Not used (CDP injects directly) | Required for all DOM ops | Different architectures |
| CSP bypass | CDP bypasses CSP | Content script subject to CSP | Firefox may fail on strict-CSP pages |
| Service worker persistence | `chrome.storage.session` | `browser.storage.session` | Both handle SW restart |

### Firefox-Specific Improvements Needed

1. **Activity broadcasting** -- Firefox background.js does NOT call `broadcastActivity()`. The sidebar has no live activity log.
2. **CSP handling** -- Content scripts run in "isolated world" but `new Function()` may be blocked by strict CSP. Need fallback.
3. **Screenshot quality** -- Firefox uses `captureVisibleTab()` which only captures the visible viewport. Chrome's CDP can capture full page.
4. **Page.captureScreenshot in content.js** returns `'__delegate_to_background__'` but background.js doesn't handle this delegation.

---

## 8. Implementation Roadmap

### Phase 1: Quick Wins (1-2 days each)

| # | Change | Files | Effort |
|---|---|---|---|
| 1 | Add `scroll` tool (up/down/element) | `index.js`, `server.js` | Low |
| 2 | Add `get_page_info` tool | `index.js`, `server.js` | Low |
| 3 | Add `wait` tool | `index.js` | Trivial |
| 4 | Fix click event sequence (add hover + focus) | `server.js`, `content.js` | Low |
| 5 | Add more attributes to `get_interactive_elements` | `server.js`, `content.js` | Low |

### Phase 2: Medium Effort (3-5 days each)

| # | Change | Files | Effort |
|---|---|---|---|
| 6 | Index-based element tools (`click_by_index`, `type_by_index`) | `index.js`, `server.js` | Medium |
| 7 | Contenteditable support in `type_text` | `server.js`, `content.js` | Medium |
| 8 | `select_option` tool | `index.js`, `server.js` | Medium |
| 9 | New element detection (`*[N]` markers) | `server.js`, `content.js` | Medium |
| 10 | Page info in scan response | `server.js`, `content.js` | Medium |
| 11 | Firefox activity broadcasting | `firefox/background.js` | Medium |

### Phase 3: Architecture Improvements (1-2 weeks)

| # | Change | Files | Effort |
|---|---|---|---|
| 12 | Structured DOM protocol (replace JS injection) | All | High |
| 13 | Text-format DOM output option | `server.js`, `content.js` | High |
| 14 | Bidirectional events (extension pushes to MCP) | All | High |
| 15 | Fix Firefox screenshot delegation | `firefox/background.js`, `firefox/content.js` | Medium |

---

## 9. Summary Matrix

```
                          Page Agent    DOMAgent     Status
                          ----------    --------     ------
In-page agent loop        YES           NO (ext)     Different by design
Text-based DOM            YES           JSON only    GAP -- add text format
Index-based addressing    YES           CSS only     GAP -- add index tools
Scroll tools              YES           NO           GAP -- add
Select dropdown tool      YES           NO           GAP -- add
Wait tool                 YES           NO           GAP -- add
Contenteditable           YES           NO           GAP -- add
Hover events in click     YES           NO           GAP -- fix
Page info / scroll ctx    YES           NO           GAP -- add
New element markers       YES           NO           GAP -- add
Multi-page / tabs         NO (ext WIP)  YES          WE LEAD
Screenshots               NO            YES          WE LEAD
MCP compliance            NO            YES          WE LEAD
Cross-browser             NO (ext WIP)  YES          WE LEAD
BYO AI host               Own LLM       Any MCP      WE LEAD
Overlay config            Hardcoded     Configurable WE LEAD
Activity log              Agent panel   Side panel   BOTH (different)
Framework patches         React, Antd   None         MINOR GAP
Simulation mask           YES           NO           OPTIONAL
```

---

## 10. Key Takeaway

Our DOMAgent MCP architecture is fundamentally sound and has real advantages over Page Agent (multi-page, screenshots, BYO-AI, cross-browser). The biggest gaps are in the **DOM representation quality** and **DOM interaction toolkit**:

1. **Enrich the DOM scan** -- Include more attributes, page info, hierarchy, and new element markers.
2. **Add missing interaction tools** -- scroll, select, wait, contenteditable.
3. **Fix click event sequence** -- Add hover and focus events.
4. **Consider index-based addressing** -- Simpler than CSS selectors for LLMs.
5. **Move DOM logic into the extension** -- Replace JS string injection with a structured protocol.

These improvements would give us the best of both worlds: Page Agent's DOM intelligence with our superior multi-page, multi-host, cross-browser architecture.
