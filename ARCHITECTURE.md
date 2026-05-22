Flygent v0.2.0 — Architecture & Implementation
=================================================

> DOMAgent fork — refactored, security-hardened browser agent extension.
> Based on vaishnavucv/domagent v1.0.11. Works with Chrome (CDP) and Firefox (content script relay).

--------------------------------------------------------------------
Architecture Overview
--------------------------------------------------------------------

                        ┌───────────────────────┐
                        │     AI Agent           │  Claude Desktop
                        │  (any MCP client)       │  Cursor, Ollama
                        │                        │  OpenCode...
                        └───────────┬───────────┘
                                    │  stdio (MCP protocol)
                                    │  JSON-RPC: ListTools / CallTool
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                    domagent-mcp (Node.js)                          │
│                                                                    │
│  ┌──────────────┐      ┌──────────────────────────────────────┐  │
│  │  index.js     │      │  server.js (BridgeServer)             │  │
│  │               │      │                                      │  │
│  │ . 9 tools     │─────→│  . WebSocket server :18792           │  │
│  │ . stdio       │      │  . auth handshake (token)            │  │
│  │ . token       │      │  . rate limit: 10 concurrent         │  │
│  │               │      │  . CDP command relay                 │  │
│  └──────────────┘      └──────────────┬───────────────────────┘  │
│                                       │                           │
│                                       │ import                    │
│                              ┌────────┴────────┐                  │
│                              │  shared/         │                  │
│                              │  utils.js        │ escapeJS        │
│                              │  overlay-styles  │ OVERLAY_CSS     │
│                              └─────────────────┘                  │
└───────────────────────────────────────────────────────────────────┘
                                    │
                                    │  WebSocket ws://127.0.0.1:18792
                                    │  ┌─── auth handshake ───┐
                                    │  │ hello -> auth -> ok  │
                                    │  └──────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│              Browser Extension (MV3)                               │
│                                                                    │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐  │
│  │  Chrome                  │    │  Firefox                     │  │
│  │  background.js           │    │  background.js               │  │
│  │  (Service Worker)        │    │  (Persistent Background)     │  │
│  │                          │    │                              │  │
│  │  importScripts ──────────┼────┼── manifest scripts ─────────┤  │
│  │       |                  │    │       |                      │  │
│  │  shared/background-lib   │    │  shared/background-lib       │  │
│  │                          │    │                              │  │
│  │  chrome.debugger API ────┤    │  tabs.sendMessage ──────────→│  │
│  │       | (CDP)            │    │       |                      │  │
│  │  direct protocol access  │    │  content.js ──> shared/     │  │
│  │                          │    │              content-script-  │  │
│  │                          │    │              lib.js           │  │
│  └──────────────────────────┘    └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                Real Browser (your tabs)                            │
│                                                                    │
│   Blue dot = type      Orange dot = click                         │
│   Green dashed = input  Yellow dashed = button/link               │
│   Cyan solid = text     Red badge = element index                 │
└───────────────────────────────────────────────────────────────────┘


--------------------------------------------------------------------
File Structure
--------------------------------------------------------------------

domagent/
├── shared/                         # Extracted common code (was 3 copies)
│   ├── utils.js                    #   escapeJS via JSON.stringify
│   ├── overlay-styles.js           #   OVERLAY_CSS single source
│   ├── content-script-lib.js       #   DOM ops: click/type/scan
│   └── background-lib.js           #   Constants + isTabEligible
│
├── domagent-mcp/                   # Node.js MCP server
│   ├── index.js                    #   MCP entry point (stdio transport)
│   ├── server.js                   #   BridgeServer (WS + CDP relay)
│   └── package.json                #   deps: @modelcontextprotocol/sdk, ws
│
├── domagent-extension/
│   ├── chrome/                     # Chrome extension (MV3)
│   │   ├── background.js           #   Service Worker (CDP via debugger API)
│   │   ├── manifest.json           #   permissions: debugger, tabs, storage
│   │   ├── options.html / .js      #   Settings UI
│   │   └── icons/
│   └── firefox/                    # Firefox extension (MV3)
│       ├── background.js           #   Background script (content-script relay)
│       ├── content.js              #   Thin message listener (81 lines)
│       ├── manifest.json           #   loads shared/ via content_scripts
│       ├── options.html / .js
│       └── icons/
│
└── .github/workflows/              # CI/CD (upstream)


--------------------------------------------------------------------
Layer 1: AI Agent <-> MCP Server (stdio)
--------------------------------------------------------------------

The AI agent communicates with index.js via Model Context Protocol (MCP)
over stdio. MCP is a JSON-RPC protocol.

Protocol flow:

  Agent -> index.js:  { method: "tools/list" }
  index.js -> Agent:  { tools: [navigate, click, type_text, ...] }

  Agent -> index.js:  { method: "tools/call", params: { name: "click",
                        arguments: { selector: "#submit-btn" } } }
  index.js -> Agent:  { content: [{ type: "text",
                        text: "Clicked: #submit-btn" }] }

index.js is a thin forwarding layer. Each tool call is dispatched to a
corresponding method on BridgeServer (server.js). Nine tools are registered:

  Tool                          BridgeServer method     CDP command used
  ────────────────────────────  ─────────────────────  ─────────────────
  navigate(url)                 navigate()             Browser.ensureTab
  use_current_tab()             useCurrentTab()        Browser.useCurrentTab
  click(selector)               click()                Runtime.evaluate
  type_text(selector, text)     type()                 Runtime.evaluate
  get_text(selector)            getText()              Runtime.evaluate
  evaluate_script(script)       evaluate()             Runtime.evaluate
  get_screenshot()              getScreenshot()        Page.captureScreenshot
  get_interactive_elements()    getInteractiveElements()  Runtime.evaluate
  clear_overlays()              clearOverlays()        Runtime.evaluate


--------------------------------------------------------------------
Layer 2: BridgeServer (server.js) — How Each Tool Works
--------------------------------------------------------------------

navigate(url)
  Sends CDP command "Browser.ensureTab" with the URL. The extension's
  background.js creates (or reuses) a single dedicated automation tab.
  The tab ID is persisted via chrome.storage.session to survive
  Service Worker restarts.

click(selector)
  Generates an IIFE JavaScript string that:
    1. Finds the element via document.querySelector(selector)
    2. Draws an orange pulsing highlight box + center dot
    3. Dispatches MouseEvent sequence: pointerdown -> mousedown ->
       pointerup -> mouseup -> click
    4. Overlays auto-fade after ~1.7 seconds
  The code string is executed via CDP Runtime.evaluate in the page context.
  This approach works because most modern web apps listen for DOM events,
  not raw OS-level input.

type_text(selector, text)
  Same IIFE pattern as click, but:
    1. Draws a green highlight box + blue dot
    2. Sets el.value via the prototype setter (handles React/Vue bindings)
    3. Dispatches 'input' and 'change' events
  Using the prototype setter (Object.getOwnPropertyDescriptor) ensures
  framework-managed inputs detect the value change.

get_interactive_elements()
  Scans the page DOM and returns up to 100 interactive elements
  (buttons, links, inputs) + 150 text elements (headings, paragraphs).
  Each element includes:
    - index (number badge shown on overlay)
    - tag, kind (click/type/text)
    - text content (first 100 chars)
    - CSS selector path
    - bounding box {x, y, w, h}
  Draws colored overlay boxes that auto-fade after 4 seconds.
  Color coding:
    Yellow dashed = clickable (buttons, links)
    Green dashed  = typeable (inputs, textareas, contenteditable)
    Cyan solid    = text content (p, h1-h6, span, li, etc.)

get_screenshot()
  Uses CDP Page.captureScreenshot. Returns PNG as base64 string.
  On Firefox: delegates to background.js tabs.captureVisibleTab()
  (content scripts cannot capture the full viewport).


--------------------------------------------------------------------
Layer 3: WebSocket Bridge + Authentication + Rate Limiting
--------------------------------------------------------------------

The MCP server and browser extension communicate over a local WebSocket
at ws://127.0.0.1:18792/extension.

Auth Handshake (Oracle finding #3 fix):

  Extension                              Server
     |                                      |
     |---- WS connect -------------------->|
     |                                      | 5s timeout starts
     |<--- {method:"hello", tokenRequired}  |
     |                                      |
     |---- {method:"auth", token:"xxx"} -->|
     |                                      | validate token
     |<--- {result:"authenticated"} --------|
     |                                      |
     |<== forwardCDPCommand ===============>|  normal ops

- No token set -> tokenRequired: false -> skip auth (backward compatible)
- Token set    -> both sides must match, or connection closed after 5s
- Token source: DOMAGENT_TOKEN env var or --token CLI arg
- Extension reads token from chrome.storage.local.auth_token

Rate Limiting (Oracle finding #7 fix):

  BridgeServer.maxPending = 10

  If pendingRequests.size >= 10, new sendCommand() calls throw:
    "Too many pending requests (10 max). Wait for previous commands
     to complete."

  Pending requests are cleaned up on:
    - Response received (by id)
    - 30-second timeout per request
    - WebSocket disconnect (all flushed)


--------------------------------------------------------------------
Layer 4: Browser Extensions — Chrome vs Firefox
--------------------------------------------------------------------

Chrome Extension (CDP path)
  Uses chrome.debugger API to send raw Chrome DevTools Protocol commands
  directly to the tab process. No content script injection needed.

  Flow: background.js -> chrome.debugger.sendCommand({tabId}, method, params)
                         -> CDP -> page process executes

  Advantages:
    - Full CDP access (Runtime, Page, Network, DOM domains)
    - Not blocked by page CSP
    - No navigator.webdriver flag
  Caveat:
    - Chrome shows "debugging" banner (can suppress with
      --silent-debugger-extension-api flag)

Firefox Extension (Content Script Relay path)
  Firefox has no chrome.debugger API. Instead, commands are sent to a
  content script that executes them in the page's isolated world.

  Flow: background.js -> tabs.sendMessage(tabId, {method, params})
                         -> content.js -> shared/content-script-lib.js
                         -> page DOM

  Advantages:
    - No debug banner
    - Works on Firefox 109+
  Limitations:
    - evaluate_script uses new Function() which can be blocked by
      strict CSP (caught with clear error message)
    - Screenshot requires background.js fallback

Tab Management
  Both browsers use a single dedicated automation tab. On first
  navigate(), a new tab is created and pinned. Subsequent navigate()
  calls reuse the same tab (navigate to new URL). use_current_tab()
  adopts the user's currently focused tab as the automation target.
  Tab ID is persisted via storage.session to survive Service Worker
  restarts (Chrome MV3 kills SW after ~30s idle).


--------------------------------------------------------------------
Layer 5: Visual Overlay System
--------------------------------------------------------------------

get_interactive_elements() draws temporary overlay boxes:

  Yellow dashed + red index badge  ->  Clickable (buttons, links, menus)
  Green dashed + red index badge   ->  Typeable (inputs, textareas)
  Cyan solid (50% opacity)         ->  Text content (headings, paragraphs)

Click and type actions draw additional indicators:
  - Orange pulsing dot (click) — expands from center, fades in 650ms
  - Blue pulsing dot (type) — expands from center, fades in 850ms
  - Highlight box pulses 3 times, fades in 1.5-2s

All overlay elements use CSS class prefix __da-* with z-index 2147483640+
(maximum safe z-index). Pointer-events: none ensures overlays don't
interfere with user interaction.

The overlay CSS is defined once in shared/overlay-styles.js — previously
it was duplicated in 3 separate files (~200 lines of duplicate CSS).


--------------------------------------------------------------------
Shared Library Design
--------------------------------------------------------------------

shared/utils.js (25 lines)
  escapeJS(str) — uses JSON.stringify for complete Unicode safety.
  Handles U+2028/U+2029 that the old manual escape missed.
  Returns a double-quoted JSON string. Callers use ${escapeJS(s)}
  (not '${escapeJS(s)}') in template literals.

shared/overlay-styles.js (66 lines)
  OVERLAY_CSS — complete CSS for all overlay classes and animations.
  Imported by server.js (ESM). The content script lib has its own
  inline copy (DOMAGENT_OVERLAY_CSS) since browser content scripts
  cannot import ESM modules without a bundler.

shared/content-script-lib.js (301 lines)
  Browser-only (plain JS, loaded via Firefox manifest content_scripts).
  Functions: domAgentEnsureOverlayStyles, domAgentClearOverlays,
  domAgentEvaluate, domAgentClickElement, domAgentTypeIntoElement,
  domAgentGetText, domAgentGetInteractiveElements.
  All prefixed with domAgent to avoid global namespace collisions.

shared/background-lib.js (22 lines)
  Shared constants (DEFAULT_HOST, DEFAULT_PORT, DEFAULT_PATH,
  AUTOMATION_TAB_KEY, BADGE) and domAgentIsTabEligible().
  Loaded by Chrome via importScripts(), by Firefox via manifest
  background.scripts array.


--------------------------------------------------------------------
Security Hardening (Oracle Audit — all 10 findings resolved)
--------------------------------------------------------------------

  #1  evaluate_script arbitrary JS          BY DESIGN (tool feature)
  #2  escapeJS incomplete                   FIXED: JSON.stringify
  #3  WebSocket unauthenticated             FIXED: pre-shared token handshake
  #4  unused activeTab permission           FIXED: removed from manifest
  #5  CSP configuration                     INFO: acceptable as-is
  #6  data exfiltration risk                BY DESIGN (trusted agent model)
  #7  no rate limiting                      FIXED: 10 concurrent cap + cleanup
  #8  ws@8.18.0 vulnerability               FIXED: upgraded to >=8.20.1
  #9  storage security                      INFO: no sensitive data stored
  #10 Firefox eval CSP blocks               FIXED: caught with clear error msg

See commit log for implementation details:
  16ae100  init: DOMAgent fork — Flygent
  3f8e905  security: pre-shared token auth
  5552803  fix: rate limiting + Firefox CSP eval guard


--------------------------------------------------------------------
Usage
--------------------------------------------------------------------

  # Start MCP server (no auth)
  npx domagent

  # Start MCP server (with auth)
  DOMAGENT_TOKEN=my-secret npx domagent
  node index.js --token my-secret

  # Load extension
  Chrome:  chrome://extensions -> Developer mode -> Load unpacked ->
           select domagent-extension/chrome/
  Firefox: about:debugging -> This Firefox -> Load Temporary Add-on ->
           select domagent-extension/firefox/manifest.json

  # Configure AI agent (Claude Desktop example)
  {
    "mcpServers": {
      "flygent": {
        "command": "node",
        "args": ["/path/to/domagent-mcp/index.js", "--token", "my-secret"]
      }
    }
  }
