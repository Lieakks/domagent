# Page Agent - Deep Study Guide

> **Source**: [alibaba/page-agent](https://github.com/alibaba/page-agent)
> **Tagline**: "The GUI Agent Living in Your Webpage. Control web interfaces with natural language."
> **License**: MIT | **Language**: TypeScript | **Published**: `page-agent` on npm

---

## 1. What is Page Agent?

Page Agent is an **in-page JavaScript GUI agent** by Alibaba that lets you control any web interface using natural language. Unlike Puppeteer, Playwright, or browser-use, it runs **entirely inside the browser tab** -- no Python, no headless browser, no browser extension required (though an optional extension exists for multi-page tasks).

### Key Differentiators

| Feature | Page Agent | Playwright / Puppeteer | browser-use |
|---|---|---|---|
| Runtime | In-page JavaScript | Node.js (server-side) | Python + headless browser |
| DOM approach | Text-based (simplified HTML) | Screenshot / selector | Screenshot (multi-modal) |
| LLM type needed | Any text LLM (no vision needed) | N/A | Multi-modal LLM |
| Integration | One `<script>` tag or `npm install` | Backend setup | Python environment |
| Page Scope | Single page (SPA) | Multi-page | Multi-page |

### Core Philosophy

1. **Text-based, not screenshot-based** -- DOM is extracted and "dehydrated" into simplified HTML text. No screenshots, no multi-modal LLMs needed.
2. **In-page** -- Everything runs in the browser context via JavaScript. The agent *is* the page.
3. **Bring your own LLM** -- Use any OpenAI-compatible API (Qwen, GPT, Claude, Gemini, etc.).
4. **ReAct Agent Loop** -- Follows a Reflect-then-Act pattern: observe, think (with reflection), act, loop.

---

## 2. Architecture Overview

### Monorepo Structure

```
packages/
  core/                # @page-agent/core  -- Core agent loop (headless, no UI)
  page-agent/          # page-agent        -- Main entry (Core + UI + Controller)
  page-controller/     # @page-agent/page-controller -- DOM ops + visual feedback
  llms/                # @page-agent/llms  -- LLM client (OpenAI-compatible)
  ui/                  # @page-agent/ui    -- Panel UI + i18n
  extension/           # Chrome extension (WXT + React) -- WIP
  website/             # Documentation site
```

### Layer Diagram

```
  User types: "Click the login button"
         |
         v
  +------------------+
  |    PageAgent      |   packages/page-agent
  |  (Entry point)    |   Extends PageAgentCore + adds Panel UI
  +--------+---------+
           |
  +--------+---------+
  |  PageAgentCore    |   packages/core
  |  (ReAct Loop)     |   Observe -> Think -> Act -> Loop
  +--+-----------+----+
     |           |
     v           v
  +------+    +-------+
  |  LLM |    | Page  |   packages/llms, packages/page-controller
  |Client|    |Control|
  +------+    |  ler  |
              +---+---+
                  |
                  v
            Live DOM
         (the actual webpage)
```

### Module Boundaries (import rules)

- **PageAgent** imports from `@page-agent/core`, `@page-agent/ui`
- **Core** imports from `@page-agent/llms`, `@page-agent/page-controller`
- **LLMs** has ZERO dependency on page-agent (pure LLM client)
- **Page Controller** has ZERO dependency on LLM (pure DOM operations)
- **UI** is decoupled from PageAgent via `PanelAgentAdapter` interface

---

## 3. The ReAct Agent Loop (Core Engine)

> File: `packages/core/src/PageAgentCore.ts`

This is the brain. Each task runs through this loop:

```
while (step < maxSteps) {
  1. OBSERVE  -- get browser state (DOM snapshot)
  2. THINK    -- call LLM with system prompt + user prompt + history
  3. ACT      -- execute the tool the LLM chose
  4. CHECK    -- if action = "done", return result
  5. LOOP     -- increment step, wait stepDelay, repeat
}
```

### Step-by-step Breakdown

#### 3.1 OBSERVE Phase

```typescript
// PageAgentCore.ts line ~242
this.#states.browserState = await this.pageController.getBrowserState()
await this.#handleObservations(step)
```

`getBrowserState()` returns a structured `BrowserState` object:

```typescript
interface BrowserState {
  url: string          // current page URL
  title: string        // document.title
  header: string       // page info + scroll position hint
  content: string      // simplified HTML of interactive elements
  footer: string       // scroll hint (pixels below/above)
}
```

The system also generates **observations** automatically:
- **URL change detection** -- "Page navigated to ..."
- **Wait time warning** -- "You have waited N seconds..."
- **Remaining steps warning** -- "Only 5 steps remaining..."

#### 3.2 THINK Phase (LLM Invocation)

The LLM receives:
1. **System prompt** -- defines capabilities, rules, output format
2. **User prompt** -- assembled from:
   - `<instructions>` (optional system/page-level instructions)
   - `<agent_state>` containing `<user_request>` and `<step_info>`
   - `<agent_history>` with all past steps and observations
   - `<browser_state>` with the current DOM snapshot

The LLM is forced to call a single **MacroTool** called `AgentOutput` every step. This MacroTool bundles:

```json
{
  "evaluation_previous_goal": "How well did the last action work?",
  "memory": "Key info to remember for future steps",
  "next_goal": "What to do next",
  "action": {
    "<tool_name>": { /* tool parameters */ }
  }
}
```

This enforces **reflection-before-action** -- the LLM must reason *before* picking an action.

#### 3.3 ACT Phase (Tool Execution)

The MacroTool executor:
1. Extracts the tool name and input from the LLM's action choice
2. Finds the corresponding tool in `this.tools`
3. Executes it with `tool.execute.bind(this)(toolInput)` (binds PageAgentCore as `this`)
4. Records the result in history

#### 3.4 CHECK Phase

If the action was `done`, the loop terminates and returns `ExecutionResult`:

```typescript
interface ExecutionResult {
  success: boolean          // task succeeded?
  data: string             // final text response
  history: HistoricalEvent[]  // full execution history
}
```

---

## 4. Supported Actions (Tools)

> File: `packages/core/src/tools/index.ts`

All tools are defined as `PageAgentTool` objects with Zod schemas for input validation:

### 4.1 Click (`click_element_by_index`)

**Input**: `{ index: number }`
**What it does** (in `actions.ts`):

```
1. Blur previously clicked element (mouseout event)
2. Scroll element into view if needed
3. Move animated pointer to element center
4. Wait 100ms
5. Dispatch full mouse event sequence:
   mouseenter -> mouseover -> mousedown -> focus() -> mouseup -> click
6. Wait 200ms for event processing
```

Why the full event sequence? Many UI frameworks (React, Vue, Angular) attach listeners to specific events. Dispatching just `.click()` would miss `mousedown`/`mouseup` handlers, focus events, and hover states.

The element is located via **index** from the `selectorMap` -- a Map that maps highlight indices to actual `HTMLElement` references extracted during the DOM scan.

---

### 4.2 Text Input (`input_text`)

**Input**: `{ index: number, text: string }`
**What it does** (in `actions.ts`):

```
1. First CLICK the element (full click sequence above)
2. Detect element type:
   a) HTMLInputElement --> use native value setter
   b) HTMLTextAreaElement --> use native textarea value setter
   c) contenteditable --> dispatch synthetic InputEvents
3. Dispatch 'input' event (for non-contenteditable)
4. Wait 100ms
5. Blur the element
```

**The Native Value Setter Trick:**

```typescript
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)!.set!
```

This bypasses React/Vue controlled component setters to directly set the underlying DOM value, then dispatches a synthetic `input` event so React's onChange fires correctly.

**Contenteditable Support:**

For rich text editors (LinkedIn, Quill, etc.), the agent dispatches:
1. `beforeinput` (inputType: 'deleteContent') to clear
2. Set `innerText = ''`
3. `input` event
4. `beforeinput` (inputType: 'insertText', data: text) to insert
5. Set `innerText = text`
6. `input` event
7. `change` event
8. `blur()` for validation

Known limitations: Monaco/CodeMirror and Draft.js editors are not supported through this method.

---

### 4.3 Select Dropdown (`select_dropdown_option`)

**Input**: `{ index: number, text: string }`
**What it does**:

```
1. Find the <select> element by index
2. Search through option.textContent for matching text
3. Set selectElement.value = matchedOption.value
4. Dispatch 'change' event with bubbles: true
5. Wait 100ms
```

Note: This only works for native `<select>` elements. Custom dropdown UIs (React Select, Ant Design, etc.) require click sequences instead.

---

### 4.4 Scroll Vertical (`scroll`)

**Input**: `{ down: boolean, num_pages?: number, pixels?: number, index?: number }`
**What it does**:

Two modes:

**Element-specific scroll** (when `index` is provided):
1. Find the element by index
2. Walk up the DOM tree looking for a scrollable parent (checks `overflowY` for `auto|scroll|overlay` and `scrollHeight > clientHeight`)
3. Scroll that container by `scrollAmount / 3` pixels
4. Report success/failure

**Page-level scroll** (default):
1. Find the best scrollable container (active element's parent chain, or any large `overflow: auto` element, or `document.scrollingElement`)
2. Use `window.scrollBy()` for page-level or `el.scrollBy()` for containers
3. Report scroll result with boundary warnings ("Already at the bottom")

---

### 4.5 Scroll Horizontal (`scroll_horizontally`)

**Input**: `{ right: boolean, pixels: number, index?: number }`

Same pattern as vertical scroll but operates on `scrollLeft` / `overflowX`. Useful for wide tables or horizontally scrollable content.

---

### 4.6 Execute JavaScript (`execute_javascript`)

**Input**: `{ script: string }`
**What it does**:

```typescript
const asyncFunction = eval(`(async () => { ${script} })`)
const result = await asyncFunction()
```

Wraps the script in an async IIFE and `eval()`s it in page context. Supports `await`. This tool is **disabled by default** and requires `experimentalScriptExecutionTool: true` to enable.

---

### 4.7 Wait (`wait`)

**Input**: `{ seconds: number }` (1-10 seconds)

Intelligently subtracts the LLM calling time from the actual wait:

```typescript
const actualWaitTime = Math.max(0, input.seconds - (Date.now() - lastTimeUpdate) / 1000)
```

The system tracks accumulated wait time and warns the LLM if it's been waiting too long.

---

### 4.8 Ask User (`ask_user`)

**Input**: `{ question: string }`

Calls `this.onAskUser(question)` callback. Disabled if no callback is set. Used for human-in-the-loop interactions where the agent needs clarification.

---

### 4.9 Done (`done`)

**Input**: `{ text: string, success: boolean }`

Signals task completion. The main loop handles this by:
1. Cleaning up DOM highlights
2. Hiding the simulator mask
3. Setting status to 'completed' or 'error'
4. Returning `ExecutionResult`

---

### 4.10 Planned but Not Yet Implemented

From the source comments:
- `send_keys` -- keyboard shortcuts
- `upload_file` -- file upload
- `go_back` -- browser history navigation
- `extract_structured_data` -- structured data extraction from tables

---

## 5. DOM Processing Pipeline

> File: `packages/page-controller/src/dom/`

This is derived from [browser-use](https://github.com/browser-use/browser-use) and is the most critical piece.

### Pipeline Steps

```
  Live DOM
    |
    v
  [1] DOM Extraction (dom_tree/index.js)
    |  Walk the full DOM tree
    |  Determine visibility, interactivity, top-layer status
    |  Assign highlight indices to interactive elements
    |  Keep HTMLElement references for later action
    |
    v
  FlatDomTree  (flat map of nodeId -> DomNode)
    |
    v
  [2] Dehydration (flatTreeToString)
    |  Convert tree to simplified text for LLM
    |  Include key attributes (aria-label, role, value, etc.)
    |  Show parent-child relationships via indentation
    |  Mark new elements with * prefix
    |
    v
  Simplified HTML  (text string for LLM)
    |
    v
  [3] Selector Map (getSelectorMap)
    |  Map<number, InteractiveElementDomNode>
    |  index -> HTMLElement reference for action execution
    |
    v
  [4] Element Text Map (getElementTextMap)
       Map<number, string>
       index -> element text description (for logging)
```

### FlatDomTree Structure

```typescript
interface FlatDomTree {
  rootId: string
  map: Record<string, DomNode>  // nodeId -> node
}

// Three node types:
type DomNode = TextDomNode | ElementDomNode | InteractiveElementDomNode

interface InteractiveElementDomNode {
  tagName: string
  attributes?: Record<string, string>
  isInteractive: true            // always true
  highlightIndex: number         // the [N] index the LLM sees
  ref: HTMLElement               // LIVE reference to the actual DOM element
  isNew?: boolean                // appeared since last scan
  isTopElement?: boolean         // visible in top layer (not covered)
  extra?: { scrollable, scrollData }
}
```

### Simplified HTML Output Format

The LLM receives text like this:

```
[0]<a aria-label=Homepage />
[1]<div >P />
[2]<div >page-agent
 UI Agent in your webpage />
[3]<a >Docs />
[4]<a aria-label=View source target=_blank>Source />
UI Agent in your webpage
User enters a request, AI understands the page and operates automatically.
[5]<a role=button>Get Started />
*[6]<a role=button>View Docs />
```

Key conventions:
- `[N]` = interactive element with index N (clickable/inputtable)
- `*[N]` = NEW element that appeared since last scan
- `\t` indentation = parent-child relationship
- Plain text without `[]` = non-interactive text content
- Attributes like `aria-label`, `role`, `value`, `placeholder` are included

### Included Attributes

The system includes these attributes by default:

```
title, type, checked, name, role, value, placeholder,
data-date-format, alt, aria-label, aria-expanded, data-state,
aria-checked, id, for, target, aria-haspopup, aria-controls,
aria-owns, contenteditable
```

Plus `data-scrollable` with scroll distance info for scrollable elements.

### New Element Detection

Elements are tracked via a `WeakMap<HTMLElement, string>`. On each DOM scan, elements not in the cache are marked as `isNew = true` and rendered with `*[N]` prefix. This helps the LLM notice what changed after an action.

---

## 6. LLM Integration Layer

> Files: `packages/llms/src/`

### OpenAI-Compatible Client

The LLM layer uses the OpenAI chat completions API format (`/chat/completions`). Compatible with any provider that supports this format:

```typescript
// Request shape
{
  model: "qwen3.5-plus",
  temperature: 0.1,  // default
  messages: [...],
  tools: [...],                      // single MacroTool: AgentOutput
  parallel_tool_calls: false,        // one tool per step
  tool_choice: { type: "function", function: { name: "AgentOutput" } }
}
```

### MacroTool Pattern

Instead of exposing each tool (click, input, scroll, etc.) as separate OpenAI tools, Page Agent bundles them ALL into a single tool called `AgentOutput`. The action schema is a Zod union:

```typescript
z.object({
  evaluation_previous_goal: z.string().optional(),
  memory: z.string().optional(),
  next_goal: z.string().optional(),
  action: z.union([
    z.object({ click_element_by_index: z.object({ index: z.int() }) }),
    z.object({ input_text: z.object({ index: z.int(), text: z.string() }) }),
    z.object({ scroll: z.object({ down: z.boolean(), ... }) }),
    z.object({ done: z.object({ text: z.string(), success: z.boolean() }) }),
    // ... all other tools
  ])
})
```

This forces the LLM to always output reflection fields before selecting a single action, and avoids the complexity of multi-tool-call handling.

### Error Handling & Retry

```
InvokeErrorType:
  NETWORK_ERROR   -- fetch failed (retryable)
  AUTH_ERROR       -- 401/403 (NOT retryable)
  RATE_LIMIT      -- 429 (retryable)
  SERVER_ERROR    -- 5xx (retryable)
  CONTEXT_LENGTH  -- response truncated (retryable)
  CONTENT_FILTER  -- safety filter triggered (NOT retryable)
  NO_TOOL_CALL    -- LLM didn't call a tool (retryable)
  INVALID_TOOL_ARGS -- bad JSON or schema failure (retryable)
  TOOL_EXECUTION_ERROR -- tool threw (retryable)
```

Default retry: 3 attempts with 100ms delay.

---

## 7. System Prompt Analysis

> File: `packages/core/src/prompts/system_prompt.md`

The system prompt is a carefully crafted ~150 line markdown document that defines:

### Sections

| Section | Purpose |
|---|---|
| `<intro>` | Lists the agent's 5 core skills |
| `<language_settings>` | Use user's language, default English |
| `<input>` | Describes the 3 inputs: history, state, browser |
| `<browser_state>` | Explains the `[N]<tag>text</tag>` format |
| `<browser_rules>` | 10+ strict rules for browser interaction |
| `<capability>` | Honest about limitations ("It is ok to fail") |
| `<task_completion_rules>` | When and how to call `done` |
| `<reasoning_rules>` | How to think and track progress |
| `<examples>` | Few-shot examples of good output |
| `<output>` | JSON output format specification |

### Notable Rules

- "Only interact with elements that have a numeric `[index]` assigned."
- "Do not repeat one action for more than 3 times unless conditions changed."
- "If a captcha appears, tell user you can not solve captcha."
- "It is ok to fail the task." -- Explicit permission to fail gracefully
- "Trying too hard can be harmful."
- "You can only handle single page app. Do not jump out of current page."
- "Do not click on link if it will open in a new page (e.g., `<a target='_blank'>`)"

---

## 8. Visual Feedback: SimulatorMask

> File: `packages/page-controller/src/mask/SimulatorMask.ts`

During agent execution, a **visual mask overlay** covers the page to:
1. **Block user interaction** -- prevents accidental clicks while agent is working
2. **Show animated pointer** -- a cursor that moves to elements before clicking
3. **Adapt to dark/light mode** -- auto-detects page theme

The mask temporarily lifts its `pointerEvents` during DOM extraction so it doesn't interfere with `elementFromPoint()` calls.

Events like `PageAgent::MovePointerTo` and `PageAgent::ClickPointer` control the animated pointer position and click feedback.

---

## 9. Framework Patches

> Files: `packages/page-controller/src/patches/`

### React Patch (`react.ts`)

React's synthetic event system can cause issues with programmatic DOM manipulation. The patch handles React-specific quirks to ensure input events propagate correctly through React's reconciliation.

### Ant Design Patch (`antd.ts`)

Special handling for Ant Design components that have custom event handling patterns.

---

## 10. Configuration & Extensibility

### Minimal Usage

```typescript
import { PageAgent } from 'page-agent'

const agent = new PageAgent({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'YOUR_API_KEY',
  language: 'en-US',
})

await agent.execute('Click the login button')
```

### Full Configuration Options

```typescript
interface PageAgentConfig {
  // LLM Config
  model: string
  baseURL: string
  apiKey: string
  temperature?: number       // default 0.1
  maxRetries?: number        // default 3
  customFetch?: typeof fetch

  // Agent Config
  language?: 'en-US' | 'zh-CN'
  maxSteps?: number          // default 40
  stepDelay?: number         // default 0.4s
  customSystemPrompt?: string

  // DOM Config
  viewportExpansion?: number // -1 = full page (default), 0 = viewport only
  includeAttributes?: string[]
  interactiveBlacklist?: Element[]
  interactiveWhitelist?: Element[]
  highlightOpacity?: number
  highlightLabelOpacity?: number

  // Visual
  enableMask?: boolean       // default true

  // Hooks
  onBeforeStep?: (agent, step) => void
  onAfterStep?: (agent, history) => void
  onBeforeTask?: (agent) => void
  onAfterTask?: (agent, result) => void
  onDispose?: (agent) => void

  // Content transformation
  transformPageContent?: (content: string) => string
  instructions?: {
    system?: string
    getPageInstructions?: (url: string) => string | null
  }

  // Experimental
  experimentalScriptExecutionTool?: boolean
  experimentalLlmsTxt?: boolean

  // Custom tools
  customTools?: Record<string, PageAgentTool | null>
}
```

### Custom Tools

You can add, override, or remove tools:

```typescript
import { tool } from 'page-agent'
import { z } from 'zod/v4'

const agent = new PageAgent({
  //...
  customTools: {
    // Add a new tool
    highlight_element: tool({
      description: 'Highlight an element for the user',
      inputSchema: z.object({ index: z.int() }),
      execute: async function(input) {
        // 'this' is PageAgentCore
        const el = getElementByIndex(this.pageController.selectorMap, input.index)
        el.style.outline = '3px solid red'
        return '✅ Element highlighted'
      },
    }),
    // Remove a built-in tool
    ask_user: null,
  }
})
```

---

## 11. Event System

PageAgentCore extends `EventTarget` and emits:

| Event | When | Data |
|---|---|---|
| `statuschange` | Status transitions | `agent.status`: idle / running / completed / error |
| `historychange` | New history event added | `agent.history` array updated |
| `activity` | Real-time UI feedback | `AgentActivity` (thinking / executing / executed / retrying / error) |
| `dispose` | Agent disposed | -- |

### History vs Activity

- **History** = persistent, included in LLM context, forms agent memory
- **Activity** = transient, NOT in LLM context, for UI feedback only

---

## 12. Chrome Extension (Optional)

> Package: `packages/extension/` (WIP)

The optional Chrome extension enables **multi-page agent tasks** -- the agent can operate across different browser tabs. This uses the extension's content script injection capabilities to run Page Agent in multiple pages.

---

## 13. Data Flow Summary

```
User: "Fill in the registration form with name John, email john@test.com"
  |
  v
agent.execute(task)
  |
  +-- Step 0 ------------------------------------------------+
  |   OBSERVE:                                                 |
  |     PageController.getBrowserState()                       |
  |       -> updateTree()                                      |
  |         -> dom_tree/index.js walks full DOM                |
  |         -> finds: [0]<input name=name />,                  |
  |                   [1]<input name=email />,                 |
  |                   [2]<button>Register</button>             |
  |         -> stores HTMLElement refs in selectorMap          |
  |       -> returns BrowserState { url, title, content, ... } |
  |                                                            |
  |   THINK:                                                   |
  |     Assemble system + user prompt                          |
  |     Call LLM with MacroTool schema                         |
  |     LLM returns:                                           |
  |       evaluation: "First step, no previous action."        |
  |       memory: "Need to fill name, email, then submit."     |
  |       next_goal: "Input name 'John' into name field."      |
  |       action: { input_text: { index: 0, text: "John" } }  |
  |                                                            |
  |   ACT:                                                     |
  |     PageController.inputText(0, "John")                    |
  |       -> clickElement(nameInput)                           |
  |       -> nativeInputValueSetter.call(nameInput, "John")    |
  |       -> dispatch input event                              |
  |     Result: "✅ Input text (John) into element..."          |
  +------------------------------------------------------------+
  |
  +-- Step 1 ------------------------------------------------+
  |   (same flow for email field: input_text index=1)          |
  +------------------------------------------------------------+
  |
  +-- Step 2 ------------------------------------------------+
  |   action: { click_element_by_index: { index: 2 } }        |
  |   -> clicks Register button                               |
  +------------------------------------------------------------+
  |
  +-- Step 3 ------------------------------------------------+
  |   action: { done: { text: "Form submitted.", success: true } }
  +------------------------------------------------------------+
  |
  v
ExecutionResult { success: true, data: "Form submitted." }
```

---

## 14. Key Takeaways for Our Extension

### What we can learn from Page Agent:

1. **Text-based DOM representation** -- Simplified HTML with indexed interactive elements is a powerful, token-efficient way to represent pages for LLMs without needing vision.

2. **MacroTool pattern** -- Bundling reflection + action into a single tool call enforces structured reasoning and avoids multi-tool-call complexity.

3. **Native value setters** -- Using prototype `.set` to bypass framework wrappers is essential for reliable input in React/Vue apps.

4. **Full mouse event sequence** -- dispatching `mouseenter -> mouseover -> mousedown -> focus -> mouseup -> click` ensures compatibility across frameworks.

5. **New element detection** -- Marking newly appeared elements with `*[N]` helps the LLM understand DOM changes after actions.

6. **Graceful failure** -- The prompt explicitly says "It is ok to fail" and "Trying too hard can be harmful" -- important for agent reliability.

7. **SimulatorMask** -- Blocking user interaction during automation prevents interference.

8. **Step budgeting** -- Warning the LLM about remaining steps prevents infinite loops.

### Limitations to be aware of:

- **Single page only** (without extension) -- cannot navigate between pages
- **No screenshot/vision** -- can't handle image-based interactions or captchas
- **Contenteditable partial support** -- Monaco, CodeMirror, Draft.js not supported
- **Native `<select>` only** -- custom dropdowns need click sequences
- **No file upload** -- planned but not implemented
- **No keyboard shortcuts** -- `send_keys` is planned but not implemented

---

## 15. File Reference Map

| Package | File | Purpose |
|---|---|---|
| `page-agent` | `src/PageAgent.ts` | Entry class, extends Core + adds UI Panel |
| `page-agent` | `src/demo.ts` | IIFE demo entry (auto-init with demo API) |
| `core` | `src/PageAgentCore.ts` | **Core ReAct loop engine** |
| `core` | `src/tools/index.ts` | **All tool definitions** (click, input, scroll, etc.) |
| `core` | `src/prompts/system_prompt.md` | **System prompt** for the LLM |
| `core` | `src/types.ts` | Agent config, events, types |
| `llms` | `src/index.ts` | LLM class with retry logic |
| `llms` | `src/OpenAIClient.ts` | OpenAI API client implementation |
| `llms` | `src/types.ts` | Message, Tool, InvokeResult types |
| `page-controller` | `src/PageController.ts` | **DOM state manager** |
| `page-controller` | `src/actions.ts` | **Low-level DOM interactions** |
| `page-controller` | `src/dom/index.ts` | DOM tree to simplified HTML |
| `page-controller` | `src/dom/dom_tree/index.js` | Core DOM extraction engine (from browser-use) |
| `page-controller` | `src/dom/getPageInfo.ts` | Viewport and scroll position info |
| `page-controller` | `src/mask/SimulatorMask.ts` | Visual overlay during automation |
| `page-controller` | `src/patches/react.ts` | React-specific DOM patches |
