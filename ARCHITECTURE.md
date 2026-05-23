DOMAgent v0.2.0 — 架构设计与实现原理
========================================

> DOMAgent fork — 重构并加固安全的浏览器 agent 扩展。
> 基于 vaishnavucv/domagent v1.0.11。支持 Chrome（CDP）和 Firefox（content script relay）。

--------------------------------------------------------------------
架构总览
--------------------------------------------------------------------

                        ┌───────────────────────┐
                        │     AI Agent           │  Claude Desktop
                        │  (任意 MCP 客户端)       │  Cursor, Ollama
                        │                        │  OpenCode...
                        └───────────┬───────────┘
                                    │  stdio（MCP 协议）
                                    │  JSON-RPC: ListTools / CallTool
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                    domagent-mcp（Node.js）                          │
│                                                                    │
│  ┌──────────────┐      ┌──────────────────────────────────────┐  │
│  │  index.js     │      │  server.js（BridgeServer）            │  │
│  │               │      │                                      │  │
│  │ · 注册9个工具  │─────→│  · WebSocket 服务器 :18792           │  │
│  │ · stdio 传输   │      │  · 认证握手（token）                 │  │
│  │ · token 注入   │      │  · 并发上限 10（速率限制）           │  │
│  │               │      │  · CDP 命令中继                      │  │
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
                                    │  ┌─── 认证握手 ───┐
                                    │  │ hello → auth → ✓ │
                                    │  └──────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│              浏览器扩展（MV3）                                      │
│                                                                    │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐  │
│  │  Chrome                  │    │  Firefox                     │  │
│  │  background.js           │    │  background.js               │  │
│  │  （Service Worker）       │    │  （持久后台脚本）              │  │
│  │                          │    │                              │  │
│  │  importScripts ──────────┼────┼── manifest scripts ─────────┤  │
│  │       ↓                  │    │       ↓                      │  │
│  │  shared/background-lib   │    │  shared/background-lib       │  │
│  │                          │    │                              │  │
│  │  chrome.debugger API ────┤    │  tabs.sendMessage ──────────→│  │
│  │       ↓（CDP）            │    │       ↓                      │  │
│  │  直接操控浏览器协议层      │    │  content.js ──→ shared/     │  │
│  │                          │    │              content-script-  │  │
│  │                          │    │              lib.js           │  │
│  └──────────────────────────┘    └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                    真实浏览器（你的标签页）                           │
│                                                                    │
│   🔵 蓝色圆点 = 输入       🟠 橙色圆点 = 点击                      │
│   🟢 绿色虚线框 = 输入框    🟡 黄色虚线框 = 按钮/链接               │
│   🔷 青色实线框 = 文本      🔴 红色角标 = 元素编号                  │
└───────────────────────────────────────────────────────────────────┘


--------------------------------------------------------------------
文件结构
--------------------------------------------------------------------

domagent/
├── shared/                         # 提取的公共代码（之前有3份拷贝）
│   ├── utils.js                    #   escapeJS（JSON.stringify 实现）
│   ├── overlay-styles.js           #   OVERLAY_CSS 唯一定义
│   ├── content-script-lib.js       #   DOM 操作：click/type/scan
│   └── background-lib.js           #   常量 + isTabEligible
│
├── domagent-mcp/                   # Node.js MCP 服务器
│   ├── index.js                    #   MCP 入口（stdio 传输）
│   ├── server.js                   #   BridgeServer（WS + CDP 中继）
│   └── package.json                #   依赖：@modelcontextprotocol/sdk, ws
│
├── domagent-extension/
│   ├── chrome/                     # Chrome 扩展（MV3）
│   │   ├── background.js           #   Service Worker（CDP 通过 debugger API）
│   │   ├── manifest.json           #   权限：debugger, tabs, storage
│   │   ├── options.html / .js      #   设置界面
│   │   └── icons/
│   └── firefox/                    # Firefox 扩展（MV3）
│       ├── background.js           #   后台脚本（content-script 中继）
│       ├── content.js              #   精简的消息监听器（81行）
│       ├── manifest.json           #   通过 content_scripts 加载 shared/
│       ├── options.html / .js
│       └── icons/
│
└── .github/workflows/              # CI/CD（上游）


--------------------------------------------------------------------
第1层：AI Agent ↔ MCP Server（stdio）
--------------------------------------------------------------------

AI agent 通过 MCP 协议（Model Context Protocol）与 index.js 通信。
MCP 是基于 JSON-RPC 的协议，走 stdio 通道。

协议流程：

  Agent → index.js:  { method: "tools/list" }
  index.js → Agent:  { tools: [navigate, click, type_text, ...] }

  Agent → index.js:  { method: "tools/call", params: { name: "click",
                        arguments: { selector: "#submit-btn" } } }
  index.js → Agent:  { content: [{ type: "text",
                        text: "Clicked: #submit-btn" }] }

index.js 只是一个薄转发层。每个 tool call 被分发到 BridgeServer（server.js）
的对应方法。共注册 9 个工具：

  工具                           BridgeServer 方法     使用的 CDP 命令
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
第2层：BridgeServer（server.js）— 各工具的实现原理
--------------------------------------------------------------------

navigate(url)
  发送 CDP 命令 "Browser.ensureTab" 带上目标 URL。扩展的 background.js
  创建（或复用）一个专用的自动化标签页。标签页 ID 通过 chrome.storage.session
  持久化，以应对 Service Worker 被系统杀死后重启的情况。

click(selector)
  生成一个 IIFE（立即执行函数表达式）JavaScript 字符串：
    1. 通过 document.querySelector(selector) 找到元素
    2. 绘制橙色脉冲高亮框 + 中心圆点
    3. 按顺序派发 MouseEvent：pointerdown → mousedown →
       pointerup → mouseup → click
    4. 覆盖层约 1.7 秒后自动淡出
  这段代码字符串通过 CDP Runtime.evaluate 在页面上下文中执行。
  之所以能工作，是因为大多数现代 Web 应用监听 DOM 事件而非底层系统输入。

type_text(selector, text)
  与 click 相同的 IIFE 模式，但：
    1. 绘制绿色高亮框 + 蓝色圆点
    2. 通过原型 setter 设置 el.value（确保 React/Vue 能检测到变化）
    3. 派发 'input' 和 'change' 事件
  使用原型链的 setter（Object.getOwnPropertyDescriptor）能确保
  框架管控的输入组件正确检测到值的变化。

get_interactive_elements()
  扫描页面 DOM，返回最多 100 个交互元素（按钮、链接、输入框）
  + 150 个文本元素（标题、段落）。每个元素包含：
    - index（覆盖层上显示的数字角标）
    - tag、kind（click/type/text）
    - text（截取前 100 字符）
    - CSS 选择器路径
    - bounding box {x, y, w, h}
  绘制彩色覆盖框，4 秒后自动消失。
  颜色编码：
    黄色虚线 = 可点击（按钮、链接）
    绿色虚线 = 可输入（input、textarea、contenteditable）
    青色实线 = 文本内容（p、h1-h6、span、li 等）

get_screenshot()
  使用 CDP Page.captureScreenshot。返回 base64 PNG。
  Firefox 上：委托给 background.js 的 tabs.captureVisibleTab()
  （content script 无法截取完整视口）。


--------------------------------------------------------------------
第3层：WebSocket 桥接 + 认证 + 速率限制
--------------------------------------------------------------------

MCP 服务器和浏览器扩展通过本地 WebSocket 通信：
ws://127.0.0.1:18792/extension。

认证握手（Oracle 审计第3项修复）：

  扩展                                    服务器
   │                                        │
   │──── WS 连接 ─────────────────────────→│
   │                                        │ 5秒超时开始计时
   │←─── {method:"hello", tokenRequired} ──│
   │                                        │
   │──── {method:"auth", token:"xxx"} ────→│
   │                                        │ 校验 token
   │←─── {result:"authenticated"} ─────────│
   │                                        │
   │←═══ forwardCDPCommand ══════════════→│  正常通信

- 未设 token → tokenRequired: false → 跳过认证（向后兼容）
- 设置了 token → 双方必须匹配，5 秒内未认证则断开
- token 来源：DOMAGENT_TOKEN 环境变量 或 --token CLI 参数
- 扩展从 chrome.storage.local.auth_token 读取 token

速率限制（Oracle 审计第7项修复）：

  BridgeServer.maxPending = 10

  当 pendingRequests.size >= 10 时，新的 sendCommand() 调用会抛出错误，
  错误信息会提示用户等待之前命令完成后再重试。

  等待中的请求在以下情况被清理：
    - 收到响应（按 id 匹配）
    - 单次请求 30 秒超时
    - WebSocket 断开（全部清空）


--------------------------------------------------------------------
第4层：浏览器扩展 — Chrome vs Firefox 的分岔
--------------------------------------------------------------------

Chrome 扩展（CDP 路径）
  使用 chrome.debugger API 直接向标签页进程发送原始 CDP 命令。
  无需注入 content script。

  流程：background.js → chrome.debugger.sendCommand({tabId}, method, params)
                       → CDP → 页面进程执行

  优势：
    - 完整的 CDP 访问（Runtime、Page、Network、DOM 域）
    - 不被页面 CSP 拦截
    - 不会产生 navigator.webdriver 标志
  注意事项：
    - Chrome 会显示调试横幅（可用 --silent-debugger-extension-api 标志关闭）

Firefox 扩展（Content Script 中继路径）
  Firefox 没有 chrome.debugger API，改为通过 content script 在
  页面的隔离世界中执行操作。

  流程：background.js → tabs.sendMessage(tabId, {method, params})
                       → content.js → shared/content-script-lib.js
                       → 页面 DOM

  优势：
    - 无调试横幅
    - 支持 Firefox 109+
  限制：
    - evaluate_script 使用 new Function()，严格 CSP 的页面会拦截
      （已捕获并以明确错误信息提示）
    - 截图需要 background.js 回退方案

标签页管理
  两个浏览器都使用单一专用自动化标签页。首次 navigate() 时创建新标签页并
  固定。后续 navigate() 调用复用同一个标签页（导航到新 URL）。
  use_current_tab() 将用户当前焦点标签页接管为自动化目标。
  标签页 ID 通过 storage.session 持久化，以应对 Service Worker 重启
  （Chrome MV3 在约 30 秒空闲后会杀死 SW）。


--------------------------------------------------------------------
第5层：可视化覆盖层系统
--------------------------------------------------------------------

get_interactive_elements() 会绘制临时覆盖框：

  黄色虚线 + 红色编号角标  →  可点击元素（按钮、链接、菜单）
  绿色虚线 + 红色编号角标  →  可输入元素（input、textarea）
  青色实线（50% 透明）      →  文本内容（标题、段落）

click 和 type 操作会绘制额外的指示器：
  - 橙色脉冲圆点（点击）— 从中心扩散，650ms 后消失
  - 蓝色脉冲圆点（输入）— 从中心扩散，850ms 后消失
  - 高亮框脉冲 3 次，约 1.5-2 秒后消失

所有覆盖层元素使用 CSS 类前缀 __da-*，z-index 为 2147483640+
（安全的最大值）。pointer-events: none 确保覆盖层不会干扰用户操作。

覆盖层 CSS 在 shared/overlay-styles.js 中唯一定义 ——
重构前分散在 3 个独立文件中（约 200 行重复 CSS）。


--------------------------------------------------------------------
共享库设计
--------------------------------------------------------------------

shared/utils.js（25行）
  escapeJS(str) — 使用 JSON.stringify 实现完整的 Unicode 安全。
  正确处理了旧手动转义遗漏的 U+2028/U+2029 字符。
  返回带双引号的 JSON 字符串。调用方在模板字符串中直接使用
  ${escapeJS(s)}（而非 '${escapeJS(s)}'）。

shared/overlay-styles.js（66行）
  OVERLAY_CSS — 所有覆盖层 CSS 类和动画的完整定义。
  被 server.js 以 ESM 方式 import。content script lib 有自己内联的
  副本（DOMAGENT_OVERLAY_CSS），因为浏览器 content script 无法
  在不使用打包工具的情况下 import ESM 模块。

shared/content-script-lib.js（301行）
  仅浏览器端使用（plain JS，通过 Firefox manifest 的 content_scripts 加载）。
  函数列表：domAgentEnsureOverlayStyles、domAgentClearOverlays、
  domAgentEvaluate、domAgentClickElement、domAgentTypeIntoElement、
  domAgentGetText、domAgentGetInteractiveElements。
  所有函数以 domAgent 为前缀，避免全局命名空间冲突。

shared/background-lib.js（22行）
  共享常量（DEFAULT_HOST、DEFAULT_PORT、DEFAULT_PATH、
  AUTOMATION_TAB_KEY、BADGE）和 domAgentIsTabEligible()。
  Chrome 通过 importScripts() 加载，Firefox 通过 manifest 的
  background.scripts 数组加载。


--------------------------------------------------------------------
安全加固（Oracle 审计 — 全部 10 项已处理）
--------------------------------------------------------------------

  #1  evaluate_script 可执行任意 JS         BY DESIGN（工具特性）
  #2  escapeJS 不完整                       ✅ 已修复：JSON.stringify
  #3  WebSocket 无认证                      ✅ 已修复：预共享 token 握手
  #4  未使用的 activeTab 权限                ✅ 已修复：从 manifest 移除
  #5  CSP 配置                              INFO：当前配置可接受
  #6  数据泄露风险                           BY DESIGN（受信 agent 模型）
  #7  无速率限制                             ✅ 已修复：并发上限 10 + 清理
  #8  ws@8.18.0 漏洞                        ✅ 已修复：升级至 >=8.20.1
  #9  存储安全                              INFO：无敏感数据存储
  #10 Firefox eval 被 CSP 阻断              ✅ 已修复：捕获并以明确错误提示

详见 commit log：
  16ae100  init: DOMAgent fork — DOMAgent
  3f8e905  security: pre-shared token auth
  5552803  fix: rate limiting + Firefox CSP eval guard


--------------------------------------------------------------------
使用方法
--------------------------------------------------------------------

  # 启动 MCP 服务器（无认证）
  npx domagent

  # 启动 MCP 服务器（带认证）
  DOMAGENT_TOKEN=my-secret npx domagent
  node index.js --token my-secret

  # 加载扩展
  Chrome:  chrome://extensions → 开发者模式 → 加载已解压的扩展 →
           选择 domagent-extension/chrome/
  Firefox: about:debugging → 此 Firefox → 临时载入附加组件 →
           选择 domagent-extension/firefox/manifest.json

  # 配置 AI agent（以 Claude Desktop 为例）
  {
    "mcpServers": {
      "domagent": {
        "command": "node",
        "args": ["/path/to/domagent-mcp/index.js", "--token", "my-secret"]
      }
    }
  }
