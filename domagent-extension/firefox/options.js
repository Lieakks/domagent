/* ── DOMAgent — Options Page ────────────────────────────────────── */

const DEFAULTS = { host: '127.0.0.1', port: 18792, path: '/extension' }

const OVERLAY_DEFAULTS = {
  overlayClickEnabled: true,
  overlayClickOpacity: 75,
  overlayTypeEnabled: true,
  overlayTypeOpacity: 75,
  overlayTextEnabled: true,
  overlayTextOpacity: 50,
}

const STATUS_POLL_MS = 5000
const HEARTBEAT_MS = 6000

/* ── i18n ───────────────────────────────────────────────────────── */
const I18N_STR = {
  en: {
    'header.subtitle': 'AI-powered browser automation via Chrome DevTools Protocol',
    'status.checking': 'Checking connection\u2026',
    'status.checking_detail': 'Attempting to reach the bridge server',
    'status.connected': 'Bridge connected',
    'status.connected_detail': 'Server running at {host}:{port}',
    'status.disconnected': 'Bridge unreachable',
    'status.disconnected_detail': 'Cannot reach {host}:{port} \u2014 is the MCP server running?',
    'status.failed': 'Connection failed',
    'status.failed_detail': 'Server returned {status}',
    'status.recheck': 'Recheck',
    'heartbeat.not_checked': 'MCP heartbeat: not checked yet',
    'heartbeat.alive': 'MCP heartbeat: alive',
    'heartbeat.error': 'MCP heartbeat: error ({status})',
    'heartbeat.no_response': 'MCP heartbeat: no response',
    'connection.title': 'Connection Settings',
    'host.label': 'Host',
    'port.label': 'Port',
    'path.label': 'WS Path',
    'endpoint.label': 'Endpoint',
    'save.btn': 'Save Settings',
    'reset.btn': 'Reset Defaults',
    'saved': '\u2713 Saved',
    'overlay.title': 'Overlay Settings',
    'overlay.desc': 'Control which visual overlays appear when the AI scans the page. Adjust opacity to see a live preview.',
    'click.label': 'Click boxes',
    'click.desc': 'Yellow \u2014 buttons, links',
    'type.label': 'Type boxes',
    'type.desc': 'Green \u2014 inputs, textareas',
    'text.label': 'Text boxes',
    'text.desc': 'Cyan \u2014 paragraphs, headings',
    'quickstart.title': 'Quick Start',
    'step1': 'Start your MCP server:',
    'step2': 'The extension auto-connects. Check the status banner above \u2014 it should turn',
    'step2_green': 'green',
    'step3': 'Configure your AI agent (Claude, Ollama, etc.) to use the MCP server via',
    'step3_transport': 'stdio transport',
    'step4': 'To hide the debug banner, launch Chrome with:',
    'footer.text': 'DOMAgent \u2014 Built for AI automation',
    'footer.github': 'GitHub \u2197',
    'lang.label': 'Language',
  },
  zh: {
    'header.subtitle': '\u57fa\u4e8e Chrome DevTools Protocol \u7684 AI \u6d4f\u89c8\u5668\u81ea\u52a8\u5316',
    'status.checking': '\u6b63\u5728\u68c0\u67e5\u8fde\u63a5\u2026',
    'status.checking_detail': '\u6b63\u5728\u5c1d\u8bd5\u8fde\u63a5\u6865\u63a5\u670d\u52a1\u5668',
    'status.connected': '\u6865\u63a5\u5df2\u8fde\u63a5',
    'status.connected_detail': '\u670d\u52a1\u5668\u8fd0\u884c\u4e8e {host}:{port}',
    'status.disconnected': '\u6865\u63a5\u4e0d\u53ef\u8fbe',
    'status.disconnected_detail': '\u65e0\u6cd5\u8fde\u63a5 {host}:{port} \u2014 MCP \u670d\u52a1\u5668\u662f\u5426\u5df2\u542f\u52a8\uff1f',
    'status.failed': '\u8fde\u63a5\u5931\u8d25',
    'status.failed_detail': '\u670d\u52a1\u5668\u8fd4\u56de {status}',
    'status.recheck': '\u91cd\u65b0\u68c0\u67e5',
    'heartbeat.not_checked': 'MCP \u5fc3\u8df3\uff1a\u5c1a\u672a\u68c0\u67e5',
    'heartbeat.alive': 'MCP \u5fc3\u8df3\uff1a\u6b63\u5e38',
    'heartbeat.error': 'MCP \u5fc3\u8df3\uff1a\u9519\u8bef ({status})',
    'heartbeat.no_response': 'MCP \u5fc3\u8df3\uff1a\u65e0\u54cd\u5e94',
    'connection.title': '\u8fde\u63a5\u8bbe\u7f6e',
    'host.label': '\u4e3b\u673a',
    'port.label': '\u7aef\u53e3',
    'path.label': 'WS \u8def\u5f84',
    'endpoint.label': '\u7aef\u70b9',
    'save.btn': '\u4fdd\u5b58\u8bbe\u7f6e',
    'reset.btn': '\u6062\u590d\u9ed8\u8ba4',
    'saved': '\u2713 \u5df2\u4fdd\u5b58',
    'overlay.title': '\u8986\u76d6\u5c42\u8bbe\u7f6e',
    'overlay.desc': '\u63a7\u5236 AI \u626b\u63cf\u9875\u9762\u65f6\u663e\u793a\u7684\u89c6\u89c9\u8986\u76d6\u5c42\uff0c\u8c03\u6574\u900f\u660e\u5ea6\u53ef\u5b9e\u65f6\u9884\u89c8\u3002',
    'click.label': '\u70b9\u51fb\u6846',
    'click.desc': '\u9ec4\u8272 \u2014 \u6309\u94ae\u3001\u94fe\u63a5',
    'type.label': '\u8f93\u5165\u6846',
    'type.desc': '\u7eff\u8272 \u2014 \u8f93\u5165\u6846\u3001\u6587\u672c\u57df',
    'text.label': '\u6587\u672c\u6846',
    'text.desc': '\u9752\u8272 \u2014 \u6bb5\u843d\u3001\u6807\u9898',
    'quickstart.title': '\u5feb\u901f\u5f00\u59cb',
    'step1': '\u542f\u52a8 MCP \u670d\u52a1\u5668\uff1a',
    'step2': '\u6269\u5c55\u4f1a\u81ea\u52a8\u8fde\u63a5\u3002\u68c0\u67e5\u4e0a\u65b9\u7684\u72b6\u6001\u6a2a\u5e45 \u2014 \u5e94\u8be5\u53d8\u4e3a',
    'step2_green': '\u7eff\u8272',
    'step3': '\u914d\u7f6e\u4f60\u7684 AI agent\uff08Claude\u3001Ollama \u7b49\uff09\uff0c\u901a\u8fc7',
    'step3_transport': 'stdio \u4f20\u8f93',
    'step4': '\u8981\u9690\u85cf\u8c03\u8bd5\u6a2a\u5e45\uff0c\u542f\u52a8 Chrome \u65f6\u6dfb\u52a0\uff1a',
    'footer.text': 'DOMAgent \u2014 \u4e3a AI \u81ea\u52a8\u5316\u800c\u751f',
    'footer.github': 'GitHub \u2197',
    'lang.label': '\u8bed\u8a00',
  }
}

let currentLang = 'en'

function t(key, replacements) {
  const dict = I18N_STR[currentLang] || I18N_STR.en
  let text = dict[key]
  if (text === undefined) return key
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace('{' + k + '}', v)
    }
  }
  return text
}

function setLang(lang) {
  currentLang = lang
  chrome.storage.local.set({ _daLang: lang })
  applyLang()
}

function applyLang() {
  document.documentElement.lang = currentLang
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'))
  })
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'))
  })
}

const $ = (id) => document.getElementById(id)

const els = {
  host: $('host'),
  port: $('port'),
  path: $('path'),
  relayUrl: $('relay-url'),
  save: $('save'),
  reset: $('reset'),
  saveStatus: $('save-status'),
  banner: $('status-banner'),
  title: $('status-title'),
  detail: $('status-detail'),
  recheck: $('btn-recheck'),
  // Overlay controls
  clickEnabled: $('overlay-click-enabled'),
  clickOpacity: $('overlay-click-opacity'),
  valClickOpacity: $('val-click-opacity'),
  previewClick: $('preview-click'),
  rowClick: $('row-click'),
  typeEnabled: $('overlay-type-enabled'),
  typeOpacity: $('overlay-type-opacity'),
  valTypeOpacity: $('val-type-opacity'),
  previewType: $('preview-type'),
  rowType: $('row-type'),
  textEnabled: $('overlay-text-enabled'),
  textOpacity: $('overlay-text-opacity'),
  valTextOpacity: $('val-text-opacity'),
  previewText: $('preview-text'),
  rowText: $('row-text'),
  // Heartbeat
  heartbeatDot: $('heartbeat-dot'),
  heartbeatLabel: $('heartbeat-label'),
  heartbeatLatency: $('heartbeat-latency'),
  // Language
  langBtn: $('lang-btn'),
}

/* ── Relay URL preview ─────────────────────────────────────────── */
function updateRelayUrl() {
  const h = els.host.value || DEFAULTS.host
  const p = els.port.value || DEFAULTS.port
  const w = els.path.value || DEFAULTS.path
  els.relayUrl.textContent = `ws://${h}:${p}${w}`
}

/* ── Load saved settings ───────────────────────────────────────── */
function loadSettings() {
  chrome.storage.local.get({ ...DEFAULTS, ...OVERLAY_DEFAULTS }, (items) => {
    els.host.value = items.host
    els.port.value = items.port
    els.path.value = items.path
    // Overlay settings
    els.clickEnabled.checked = items.overlayClickEnabled
    els.clickOpacity.value = items.overlayClickOpacity
    els.typeEnabled.checked = items.overlayTypeEnabled
    els.typeOpacity.value = items.overlayTypeOpacity
    els.textEnabled.checked = items.overlayTextEnabled
    els.textOpacity.value = items.overlayTextOpacity

    // Language init
    const savedLang = items._daLang
    const browserLang = (navigator.language || '').toLowerCase()
    currentLang = savedLang || (browserLang.startsWith('zh') ? 'zh' : 'en')
    applyLang()

    updateRelayUrl()
    updateAllPreviews()
    checkConnection()
    checkHeartbeat()
  })
}

/* ── Save settings ─────────────────────────────────────────────── */
function saveSettings() {
  const settings = {
    host: els.host.value.trim() || DEFAULTS.host,
    port: parseInt(els.port.value, 10) || DEFAULTS.port,
    path: els.path.value.trim() || DEFAULTS.path,
  }
  chrome.storage.local.set(settings, () => {
    els.saveStatus.classList.add('visible')
    setTimeout(() => els.saveStatus.classList.remove('visible'), 2000)
    updateRelayUrl()
    checkConnection()
  })
}

/* ── Save overlay settings (auto-save on change) ───────────────── */
function saveOverlaySettings() {
  const overlaySettings = {
    overlayClickEnabled: els.clickEnabled.checked,
    overlayClickOpacity: parseInt(els.clickOpacity.value, 10),
    overlayTypeEnabled: els.typeEnabled.checked,
    overlayTypeOpacity: parseInt(els.typeOpacity.value, 10),
    overlayTextEnabled: els.textEnabled.checked,
    overlayTextOpacity: parseInt(els.textOpacity.value, 10),
  }
  chrome.storage.local.set(overlaySettings)
}

/* ── Reset to defaults ─────────────────────────────────────────── */
function resetDefaults() {
  els.host.value = DEFAULTS.host
  els.port.value = DEFAULTS.port
  els.path.value = DEFAULTS.path
  // Reset overlays too
  els.clickEnabled.checked = OVERLAY_DEFAULTS.overlayClickEnabled
  els.clickOpacity.value = OVERLAY_DEFAULTS.overlayClickOpacity
  els.typeEnabled.checked = OVERLAY_DEFAULTS.overlayTypeEnabled
  els.typeOpacity.value = OVERLAY_DEFAULTS.overlayTypeOpacity
  els.textEnabled.checked = OVERLAY_DEFAULTS.overlayTextEnabled
  els.textOpacity.value = OVERLAY_DEFAULTS.overlayTextOpacity
  updateAllPreviews()
  saveOverlaySettings()
  saveSettings()
}

/* ── Live preview updates ──────────────────────────────────────── */

function updatePreview(kind) {
  if (kind === 'click' || kind === 'all') {
    const enabled = els.clickEnabled.checked
    const opacity = parseInt(els.clickOpacity.value, 10) / 100
    els.valClickOpacity.textContent = els.clickOpacity.value + '%'
    els.previewClick.style.borderColor = `rgba(234, 179, 8, ${opacity})`
    els.previewClick.style.background = `rgba(234, 179, 8, ${opacity * 0.1})`
    els.rowClick.classList.toggle('disabled', !enabled)
  }
  if (kind === 'type' || kind === 'all') {
    const enabled = els.typeEnabled.checked
    const opacity = parseInt(els.typeOpacity.value, 10) / 100
    els.valTypeOpacity.textContent = els.typeOpacity.value + '%'
    els.previewType.style.borderColor = `rgba(34, 197, 94, ${opacity})`
    els.previewType.style.background = `rgba(34, 197, 94, ${opacity * 0.1})`
    els.rowType.classList.toggle('disabled', !enabled)
  }
  if (kind === 'text' || kind === 'all') {
    const enabled = els.textEnabled.checked
    const opacity = parseInt(els.textOpacity.value, 10) / 100
    els.valTextOpacity.textContent = els.textOpacity.value + '%'
    els.previewText.style.borderColor = `rgba(0, 210, 255, ${opacity})`
    els.previewText.style.background = `rgba(0, 210, 255, ${opacity * 0.07})`
    els.rowText.classList.toggle('disabled', !enabled)
  }
}

function updateAllPreviews() {
  updatePreview('all')
}

/* ── Connection check ──────────────────────────────────────────── */
let pollTimer = null

function setStatus(state, title, detail) {
  els.banner.setAttribute('data-state', state)
  els.title.textContent = title
  els.detail.textContent = detail
}

async function checkConnection() {
  const h = els.host.value || DEFAULTS.host
  const p = els.port.value || DEFAULTS.port

  setStatus('checking', t('status.checking'), t('status.checking_detail'))

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`http://${h}:${p}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      setStatus('connected', t('status.connected'), t('status.connected_detail', { host: h, port: String(p) }))
    } else {
      setStatus('disconnected', t('status.failed'), t('status.failed_detail', { status: String(res.status) }))
    }
  } catch (err) {
    setStatus('disconnected', t('status.disconnected'), t('status.disconnected_detail', { host: h, port: String(p) }))
  }

  clearTimeout(pollTimer)
  pollTimer = setTimeout(checkConnection, STATUS_POLL_MS)
}

/* ── MCP Heartbeat probe ───────────────────────────────────────── */
let heartbeatTimer = null

function setHeartbeat(state, label, latency) {
  els.heartbeatDot.className = 'heartbeat-dot ' + state
  els.heartbeatLabel.textContent = label
  els.heartbeatLatency.textContent = latency || ''
}

async function checkHeartbeat() {
  const h = els.host.value || DEFAULTS.host
  const p = els.port.value || DEFAULTS.port

  try {
    const start = performance.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`http://${h}:${p}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const ms = Math.round(performance.now() - start)

    if (res.ok) {
      setHeartbeat('alive', t('heartbeat.alive'), `${ms}ms`)
    } else {
      setHeartbeat('dead', t('heartbeat.error', { status: String(res.status) }), '')
    }
  } catch {
    setHeartbeat('dead', t('heartbeat.no_response'), '')
  }

  clearTimeout(heartbeatTimer)
  heartbeatTimer = setTimeout(checkHeartbeat, HEARTBEAT_MS)
}

/* ── Event listeners ───────────────────────────────────────────── */
// Connection settings
els.host.addEventListener('input', updateRelayUrl)
els.port.addEventListener('input', updateRelayUrl)
els.path.addEventListener('input', updateRelayUrl)
els.save.addEventListener('click', saveSettings)
els.reset.addEventListener('click', resetDefaults)
els.recheck.addEventListener('click', () => {
  clearTimeout(pollTimer)
  clearTimeout(heartbeatTimer)
  checkConnection()
  checkHeartbeat()
})

// Language switcher
els.langBtn.addEventListener('click', () => setLang(currentLang === 'zh' ? 'en' : 'zh'))

// Overlay toggles — live preview + auto-save
els.clickEnabled.addEventListener('change', () => { updatePreview('click'); saveOverlaySettings() })
els.clickOpacity.addEventListener('input', () => { updatePreview('click'); saveOverlaySettings() })
els.typeEnabled.addEventListener('change', () => { updatePreview('type'); saveOverlaySettings() })
els.typeOpacity.addEventListener('input', () => { updatePreview('type'); saveOverlaySettings() })
els.textEnabled.addEventListener('change', () => { updatePreview('text'); saveOverlaySettings() })
els.textOpacity.addEventListener('input', () => { updatePreview('text'); saveOverlaySettings() })

/* ── Init ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadSettings)
