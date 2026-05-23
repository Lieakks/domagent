---
name: domagent
description: AI agent skill for browser automation via DOMAgent. Teaches the agent how to use 9 browser control tools (navigate, click, type_text, screenshot, evaluate_script, etc.) to automate real browser tasks through Chrome DevTools Protocol. Works with any MCP-compatible client (Claude Desktop, Cursor, Hermes, OpenCode).
version: 0.2.0
author: DOMAgent
---

# DOMAgent — Browser Automation Skill

You have access to DOMAgent, a browser automation system that lets you control a real browser (Chrome or Firefox) through MCP tools. You are NOT using a headless browser — every action happens in the user's actual browser window with their real cookies and sessions intact.

## Architecture (what you need to know)

```
You (AI Agent) ──stdio/MCP──→ DOMAgent Server (node index.js)
                                    │
                                    │ WebSocket (local only, port 18792)
                                    ▼
                            Browser Extension (MV3)
                                    │
                          ┌─────────┴─────────┐
                          │ Chrome: CDP        │ Firefox: content script
                          │ (chrome.debugger)  │ (tabs.sendMessage)
                          └─────────┬─────────┘
                                    ▼
                            Real Browser Tab
```

The DOMAgent server runs as a subprocess (started by your MCP client). You don't need to start it manually. It communicates with the browser extension over a local WebSocket — nothing leaves the machine.

## Available Tools

You have 9 tools. Here's how to use each one effectively:

---

### `navigate(url)`
Open a URL. Reuses the same automation tab — does NOT create duplicate tabs.

**Parameters:**
- `url` (string, required): Full URL including protocol. e.g. `"https://github.com"`

**When to use:**
- Starting a new task: "Go to github.com"
- Navigating between pages during a workflow

**Important:** The FIRST call creates a new pinned tab. All subsequent calls reuse it. The user's other tabs are NEVER touched.

---

### `use_current_tab()`
Adopt whatever tab the user currently has focused. No new tab is created.

**Parameters:** none

**When to use:**
- User says "look at this page I have open"
- User says "use the current tab"
- You need to interact with a page the user is already viewing

---

### `click(selector)`
Click an element by CSS selector. Shows an orange pulsing dot at the click point.

**Parameters:**
- `selector` (string, required): CSS selector of the element to click.

**How it works:**
The tool generates and dispatches real DOM events (pointerdown → mousedown → pointerup → mouseup → click). This works with most modern web apps, including React/Vue SPAs.

**Tips:**
- Use simple selectors first: `"#id"`, `".class"`, `"button"`
- Use `get_interactive_elements()` to find selectors when you don't know them
- Prefer id-based selectors over nth-of-type when possible

**Visual indicator:** Orange highlight box + pulsing orange dot at center of element. Fades after ~1.7s.

---

### `type_text(selector, text)`
Type text into an input field. Shows a blue dot at the input.

**Parameters:**
- `selector` (string, required): CSS selector of the input field
- `text` (string, required): The text to type

**How it works:**
Sets the element's value via the prototype setter (so React/Vue controlled components detect the change), then dispatches `input` and `change` events.

**Visual indicator:** Green highlight box + pulsing blue dot.

---

### `get_text(selector)`
Read the visible text content of an element.

**Parameters:**
- `selector` (string, required): CSS selector of the element

**Returns:** The element's `innerText` or `null` if not found.

**Use for:** Reading prices, titles, status messages, any visible text on the page.

---

### `get_screenshot()`
Capture a PNG screenshot of the current page.

**Parameters:** none
**Returns:** base64-encoded PNG image (shown directly in your vision model)

**Use for:**
- Verifying page state after actions
- Understanding page layout before clicking
- Debugging: "was that button actually clicked?"

**Best practice:** Call `clear_overlays()` before screenshot if overlays are cluttering the view.

---

### `get_interactive_elements()`
Scan the page and return ALL visible interactive elements with selectors, text, and positions. Also draws colored overlay boxes.

**Parameters:** none

**Returns:** Array of up to 250 elements (100 interactive + 150 text), each with:
- `index`: number badge on overlay
- `tag`: HTML tag name
- `kind`: `"click"` | `"type"` | `"text"`
- `text`: first 100 chars of visible text
- `selector`: CSS selector path (e.g. `"html > body > div#main > button:nth-of-type(3)"`)
- `box`: `{x, y, w, h}` — bounding rectangle

**Overlay legend:**
| Color | Kind | Meaning |
|-------|------|---------|
| 🟡 Yellow dashed + 🔴 red badge | click | Button, link, menu item |
| 🟢 Green dashed + 🔴 red badge | type | Input, textarea, contenteditable |
| 🔷 Cyan solid | text | Heading, paragraph, list item |

Overlays auto-fade after 4 seconds.

**Using the results:**
1. Call `get_interactive_elements()`
2. Look at the returned elements OR take a screenshot to see the numbered badges
3. Use the element's `index` or `selector` to interact with it
4. Example: "Click element #3" → use `click(results[3].selector)`

**Most common pattern:**
```
1. navigate("https://example.com")
2. get_interactive_elements()
3. find the search box → type_text("#search", "query")
4. find the submit button → click("button[type=submit]")
5. wait briefly → get_screenshot() to verify results
```

---

### `evaluate_script(script)`
Execute arbitrary JavaScript in the page context.

**Parameters:**
- `script` (string, required): JavaScript expression or code to execute

**Returns:** The script's return value (serialized)

**Use for:**
- Reading page state: `"document.title"`, `"window.location.href"`
- DOM queries: `"document.querySelectorAll('.price').length"`
- Scrolling: `"window.scrollTo(0, document.body.scrollHeight)"`
- Waiting: `"new Promise(r => setTimeout(r, 2000))"`

**Security note:** This tool runs with full page privileges. Only use it for legitimate automation tasks.

---

### `clear_overlays()`
Remove all overlay boxes from the page.

**Parameters:** none

**Use for:**
- Before taking a clean screenshot
- When overlays are cluttering the view
- After `get_interactive_elements()` if you're done inspecting

---

## Common Workflows

### Workflow 1: Search for something
```
navigate("https://www.google.com")
get_interactive_elements()
type_text("textarea[name='q']", "weather today")
click("input[type=submit]")
get_screenshot()
```

### Workflow 2: Fill a form
```
navigate("https://example.com/signup")
get_interactive_elements()
type_text("#name", "John Doe")
type_text("#email", "john@example.com")
type_text("#password", "securepassword123")
click("button[type=submit]")
get_screenshot()
```

### Workflow 3: Scrape data
```
navigate("https://example.com/products")
get_interactive_elements()
evaluate_script("Array.from(document.querySelectorAll('.price')).map(e => e.textContent)")
```

### Workflow 4: Multi-page navigation
```
navigate("https://example.com")
click("a.login-link")
get_interactive_elements()
type_text("#username", "user")
type_text("#password", "pass")
click("#login-btn")
# After login redirects...
get_screenshot()
click("a.dashboard")
```

## Best Practices

1. **Always scan before clicking**: Call `get_interactive_elements()` or `get_screenshot()` to understand the page before interacting.

2. **Use id selectors when possible**: `"#login-btn"` is more reliable than `"button:nth-of-type(5)"`.

3. **Screenshot after key actions**: After login, form submission, navigation — screenshot to verify.

4. **Clear overlays before screenshots**: `clear_overlays()` → `get_screenshot()` for clean captures.

5. **Wait for page loads**: Between `navigate()` and interacting, the tool waits for page load automatically. But for SPAs that load content dynamically via JS, use `evaluate_script("new Promise(r => setTimeout(r, 2000))")` to wait.

6. **Handle errors gracefully**: If `click()` returns "Element not found", call `get_interactive_elements()` to find the correct selector.

7. **One action at a time**: Each tool call is synchronous in the browser. Don't fire multiple actions rapidly without waiting for results.

8. **The automation tab is sacred**: The user's other tabs are never modified. Only the dedicated automation tab (or the tab adopted via `use_current_tab()`) is controlled.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Element not found" | Call `get_interactive_elements()` to get correct selectors |
| Click does nothing | Element might be hidden/disabled. Check with `get_interactive_elements()` |
| Form doesn't submit | Some sites need `evaluate_script("document.querySelector('form').submit()")` |
| SPA content not loaded | Wait: `evaluate_script("new Promise(r => setTimeout(r, 3000))")` |
| Overlay boxes won't go away | `clear_overlays()` |
| Page doesn't look right | `get_screenshot()` to verify, then re-navigate if needed |

## Firefox-Specific Notes

If the user is on Firefox, `evaluate_script` may fail on sites with strict Content Security Policy. You'll get a clear error message. In that case, use structured tools (click/type_text/get_text) instead — they don't require eval.
