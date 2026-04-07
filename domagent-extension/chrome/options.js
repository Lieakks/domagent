/* ── DOMAgent: Options Page ────────────────────────────────────── */

const DEFAULTS = { host: '127.0.0.1', port: 18792, path: '/extension' };

const OVERLAY_DEFAULTS = {
  overlayClickEnabled: true,
  overlayClickOpacity: 75,
  overlayTypeEnabled: true,
  overlayTypeOpacity: 75,
  overlayTextEnabled: true,
  overlayTextOpacity: 50,
};

const STATUS_POLL_MS = 5000;
const HEARTBEAT_MS = 6000;

const $ = (id) => document.getElementById(id);

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
  // Tab navigation
  tabBtnSettings: $('tab-btn-settings'),
  tabBtnActivity: $('tab-btn-activity'),
  tabSettings: $('tab-settings'),
  tabActivity: $('tab-activity'),
  // Activity log
  activityBadge: $('activity-badge'),
  activityCount: $('activity-count'),
  activityLogInner: $('activity-log-inner'),
  activityEmpty: $('activity-empty'),
  activityClear: $('activity-clear'),
  activityFooterTs: $('activity-footer-ts'),
  // Activity bridge banner (mirrors Settings status banner)
  activityBridgeBanner: $('activity-bridge-banner'),
  activityStatusDot: $('activity-status-dot'),
  activityStatusTitle: $('activity-status-title'),
  activityStatusDetail: $('activity-status-detail'),
  activityRecheck: $('activity-btn-recheck'),
};

/* ── Relay URL preview ─────────────────────────────────────────── */
function updateRelayUrl() {
  const h = els.host.value || DEFAULTS.host;
  const p = els.port.value || DEFAULTS.port;
  const w = els.path.value || DEFAULTS.path;
  els.relayUrl.textContent = `ws://${h}:${p}${w}`;
}

/* ── Load saved settings ───────────────────────────────────────── */
function loadSettings() {
  chrome.storage.local.get({ ...DEFAULTS, ...OVERLAY_DEFAULTS }, (items) => {
    els.host.value = items.host;
    els.port.value = items.port;
    els.path.value = items.path;
    // Overlay settings
    els.clickEnabled.checked = items.overlayClickEnabled;
    els.clickOpacity.value = items.overlayClickOpacity;
    els.typeEnabled.checked = items.overlayTypeEnabled;
    els.typeOpacity.value = items.overlayTypeOpacity;
    els.textEnabled.checked = items.overlayTextEnabled;
    els.textOpacity.value = items.overlayTextOpacity;
    updateRelayUrl();
    updateAllPreviews();
    checkConnection();
    checkHeartbeat();
  });
}

/* ── Save settings ─────────────────────────────────────────────── */
function saveSettings() {
  const settings = {
    host: els.host.value.trim() || DEFAULTS.host,
    port: parseInt(els.port.value, 10) || DEFAULTS.port,
    path: els.path.value.trim() || DEFAULTS.path,
  };
  chrome.storage.local.set(settings, () => {
    els.saveStatus.classList.add('visible');
    setTimeout(() => els.saveStatus.classList.remove('visible'), 2000);
    updateRelayUrl();
    checkConnection();
  });
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
  };
  chrome.storage.local.set(overlaySettings);
}

/* ── Reset to defaults ─────────────────────────────────────────── */
function resetDefaults() {
  els.host.value = DEFAULTS.host;
  els.port.value = DEFAULTS.port;
  els.path.value = DEFAULTS.path;
  // Reset overlays too
  els.clickEnabled.checked = OVERLAY_DEFAULTS.overlayClickEnabled;
  els.clickOpacity.value = OVERLAY_DEFAULTS.overlayClickOpacity;
  els.typeEnabled.checked = OVERLAY_DEFAULTS.overlayTypeEnabled;
  els.typeOpacity.value = OVERLAY_DEFAULTS.overlayTypeOpacity;
  els.textEnabled.checked = OVERLAY_DEFAULTS.overlayTextEnabled;
  els.textOpacity.value = OVERLAY_DEFAULTS.overlayTextOpacity;
  updateAllPreviews();
  saveOverlaySettings();
  saveSettings();
}

/* ── Live preview updates ──────────────────────────────────────── */

function updatePreview(kind) {
  if (kind === 'click' || kind === 'all') {
    const enabled = els.clickEnabled.checked;
    const opacity = parseInt(els.clickOpacity.value, 10) / 100;
    els.valClickOpacity.textContent = els.clickOpacity.value + '%';
    els.previewClick.style.borderColor = `rgba(234, 179, 8, ${opacity})`;
    els.previewClick.style.background = `rgba(234, 179, 8, ${opacity * 0.1})`;
    els.rowClick.classList.toggle('disabled', !enabled);
  }
  if (kind === 'type' || kind === 'all') {
    const enabled = els.typeEnabled.checked;
    const opacity = parseInt(els.typeOpacity.value, 10) / 100;
    els.valTypeOpacity.textContent = els.typeOpacity.value + '%';
    els.previewType.style.borderColor = `rgba(34, 197, 94, ${opacity})`;
    els.previewType.style.background = `rgba(34, 197, 94, ${opacity * 0.1})`;
    els.rowType.classList.toggle('disabled', !enabled);
  }
  if (kind === 'text' || kind === 'all') {
    const enabled = els.textEnabled.checked;
    const opacity = parseInt(els.textOpacity.value, 10) / 100;
    els.valTextOpacity.textContent = els.textOpacity.value + '%';
    els.previewText.style.borderColor = `rgba(0, 210, 255, ${opacity})`;
    els.previewText.style.background = `rgba(0, 210, 255, ${opacity * 0.07})`;
    els.rowText.classList.toggle('disabled', !enabled);
  }
}

function updateAllPreviews() {
  updatePreview('all');
}

/* ── Connection check ──────────────────────────────────────────── */
let pollTimer = null;

function setStatus(state, title, detail) {
  // Settings banner
  els.banner.setAttribute('data-state', state);
  els.title.textContent = title;
  els.detail.textContent = detail;
  // Activity tab bridge banner — identical state
  els.activityBridgeBanner.setAttribute('data-state', state);
  els.activityStatusTitle.textContent = title;
  els.activityStatusDetail.textContent = detail;
}

async function checkConnection() {
  const h = els.host.value || DEFAULTS.host;
  const p = els.port.value || DEFAULTS.port;

  setStatus('checking', 'Checking connection...', `Reaching ${h}:${p}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://${h}:${p}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      setStatus('connected', 'Bridge connected', `Server running at ${h}:${p}`);
    } else {
      setStatus('disconnected', 'Connection failed', `Server returned ${res.status}`);
    }
  } catch (err) {
    setStatus('disconnected', 'Bridge unreachable', `Cannot reach ${h}:${p}: is the MCP server running?`);
  }

  clearTimeout(pollTimer);
  pollTimer = setTimeout(checkConnection, STATUS_POLL_MS);
}

/* ── MCP Heartbeat probe ───────────────────────────────────────── */
let heartbeatTimer = null;

function setHeartbeat(state, label, latency) {
  els.heartbeatDot.className = 'heartbeat-dot ' + state;
  els.heartbeatLabel.textContent = label;
  els.heartbeatLatency.textContent = latency || '';
}

async function checkHeartbeat() {
  const h = els.host.value || DEFAULTS.host;
  const p = els.port.value || DEFAULTS.port;

  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://${h}:${p}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const ms = Math.round(performance.now() - start);

    if (res.ok) {
      setHeartbeat('alive', 'MCP heartbeat: alive', `${ms}ms`);
    } else {
      setHeartbeat('dead', `MCP heartbeat: error (${res.status})`, '');
    }
  } catch {
    setHeartbeat('dead', 'MCP heartbeat: no response', '');
  }

  clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(checkHeartbeat, HEARTBEAT_MS);
}

/* ── Event listeners ───────────────────────────────────────────── */
// Connection settings
els.host.addEventListener('input', updateRelayUrl);
els.port.addEventListener('input', updateRelayUrl);
els.path.addEventListener('input', updateRelayUrl);
els.save.addEventListener('click', saveSettings);
els.reset.addEventListener('click', resetDefaults);
els.recheck.addEventListener('click', () => {
  clearTimeout(pollTimer);
  clearTimeout(heartbeatTimer);
  checkConnection();
  checkHeartbeat();
});
els.activityRecheck.addEventListener('click', () => {
  clearTimeout(pollTimer);
  clearTimeout(heartbeatTimer);
  checkConnection();
  checkHeartbeat();
});

// Overlay toggles — live preview + auto-save
els.clickEnabled.addEventListener('change', () => { updatePreview('click'); saveOverlaySettings(); });
els.clickOpacity.addEventListener('input', () => { updatePreview('click'); saveOverlaySettings(); });
els.typeEnabled.addEventListener('change', () => { updatePreview('type'); saveOverlaySettings(); });
els.typeOpacity.addEventListener('input', () => { updatePreview('type'); saveOverlaySettings(); });
els.textEnabled.addEventListener('change', () => { updatePreview('text'); saveOverlaySettings(); });
els.textOpacity.addEventListener('input', () => { updatePreview('text'); saveOverlaySettings(); });

/* ── Tab navigation ─────────────────────────────────────────────── */
let unreadActivityCount = 0;

function switchTab(name) {
  const isActivity = name === 'activity';
  els.tabBtnSettings.classList.toggle('active', !isActivity);
  els.tabBtnSettings.setAttribute('aria-selected', String(!isActivity));
  els.tabBtnActivity.classList.toggle('active', isActivity);
  els.tabBtnActivity.setAttribute('aria-selected', String(isActivity));
  els.tabSettings.classList.toggle('active', !isActivity);
  els.tabActivity.classList.toggle('active', isActivity);

  if (isActivity) {
    // Clear the unread badge when the user opens the tab
    unreadActivityCount = 0;
    els.activityBadge.textContent = '';
    els.activityBadge.classList.remove('visible');
    // Scroll to bottom
    requestAnimationFrame(() => {
      els.activityLogInner.scrollTop = els.activityLogInner.scrollHeight;
    });
  }
}

els.tabBtnSettings.addEventListener('click', () => switchTab('settings'));
els.tabBtnActivity.addEventListener('click', () => switchTab('activity'));

/* ── Activity log — per-tab memory ──────────────────────────────── */
const MAX_PER_TAB = 200;    // max entries per tab bucket
const SYSTEM_KEY = 'system';
const ALL_KEY = 'all';

/**
 * Per-tab log storage.
 * keys: 'system' | 'all' | String(tabId)
 * values: { entries: [], title: string, url: string }
 */
const tabLogs = new Map([
  [ALL_KEY, { entries: [], title: 'All', url: '' }],
  [SYSTEM_KEY, { entries: [], title: 'System', url: '' }],
]);

let activeSubTab = ALL_KEY;   // currently shown sub-tab key



/** Map kind → emoji icon */
const KIND_ICON = {
  nav: '🌐',
  click: '🖱️',
  type: '⌨️',
  screenshot: '📸',
  scan: '🔍',
  relay_connect: '🔌',
  relay_disconnect: '🔌',
  tab_attach: '🔗',
  tab_detach: '🔗',
  adopt: '📌',
  cdp: '🧩',
  info: 'ℹ️',
  error: '❌',
};

function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function renderEntry(entry) {
  const row = document.createElement('div');
  row.className = 'log-entry';
  row.setAttribute('data-kind', entry.kind);

  const icon = document.createElement('span');
  icon.className = 'log-icon';
  icon.textContent = KIND_ICON[entry.kind] || '○';

  const body = document.createElement('div');
  body.className = 'log-body';

  const label = document.createElement('div');
  label.className = 'log-label';
  label.textContent = entry.label;
  body.appendChild(label);

  const tsEl = document.createElement('span');
  tsEl.className = 'log-ts';
  tsEl.textContent = fmtTime(entry.ts);

  row.appendChild(icon);
  row.appendChild(body);
  row.appendChild(tsEl);
  return row;
}

/* ── Sub-tab pill management ─────────────────────────────────────── */

/** Returns the subtab pill element for a given key, or null. */
function getSubtabEl(key) {
  return document.querySelector(`.subtab-btn[data-tabkey="${CSS.escape(key)}"]`);
}

/** Create and register a new sub-tab pill for a browser tab. */
function addSubtabPill(key, title) {
  if (getSubtabEl(key)) return; // already exists

  const btn = document.createElement('button');
  btn.className = 'subtab-btn';
  btn.setAttribute('data-tabkey', key);
  btn.setAttribute('id', `subtab-${key}`);

  // Label
  const lbl = document.createElement('span');
  lbl.textContent = `🔗 ${title}`;
  btn.appendChild(lbl);

  // Close (×) button — clears that tab's log immediately
  const closeBtn = document.createElement('span');
  closeBtn.className = 'subtab-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Clear & remove this tab\'s log';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTabLog(key);
  });
  btn.appendChild(closeBtn);

  btn.addEventListener('click', () => switchSubtab(key));
  document.getElementById('activity-subtabs').appendChild(btn);
}

/** Switch to a sub-tab and re-render the log inner panel. */
function switchSubtab(key) {
  activeSubTab = key;

  // Update pill active state
  document.querySelectorAll('.subtab-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tabkey') === key);
  });

  // Re-render the log inner
  rebuildLogInner();
}

/** Rebuild the visible log panel from the current activeSubTab's entries. */
function rebuildLogInner() {
  // Remove all existing log-entry nodes
  els.activityLogInner.querySelectorAll('.log-entry').forEach((n) => n.remove());

  let entries;
  if (activeSubTab === ALL_KEY) {
    const all = tabLogs.get(ALL_KEY);
    entries = all ? all.entries : [];
  } else {
    const bucket = tabLogs.get(activeSubTab);
    entries = bucket ? bucket.entries : [];
  }

  if (entries.length === 0) {
    if (els.activityEmpty) els.activityEmpty.style.display = '';
  } else {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';
    const frag = document.createDocumentFragment();
    entries.forEach((e) => frag.appendChild(renderEntry(e)));
    els.activityLogInner.appendChild(frag);
    requestAnimationFrame(() => {
      els.activityLogInner.scrollTop = els.activityLogInner.scrollHeight;
    });
  }


  updateHeaderCounts();
}

/** Remove a tab's log bucket, its pill, and if it was active switch to All. */
function removeTabLog(key) {
  if (key === ALL_KEY || key === SYSTEM_KEY) {
    // Just clear entries for these reserved keys
    const bucket = tabLogs.get(key);
    if (bucket) bucket.entries = [];
    if (activeSubTab === key) rebuildLogInner();
    return;
  }

  tabLogs.delete(key);

  // Remove pill
  const pill = getSubtabEl(key);
  if (pill) pill.remove();

  // If we were viewing this tab, fall back to All
  if (activeSubTab === key) {
    switchSubtab(ALL_KEY);
  }
}

/** Push one entry into the right buckets and maybe render it. */
function appendActivity(entry) {
  const key = entry.tabId != null ? String(entry.tabId) : SYSTEM_KEY;

  // Determine if entry is system-level (no tabId)
  const isSystem = (key === SYSTEM_KEY);

  // If this is a new real tab (not system), create the pill dynamically
  if (!isSystem && !tabLogs.has(key)) {
    const defaultTitle = `Tab ${key}`;
    tabLogs.set(key, { entries: [], title: defaultTitle, url: entry.url || '' });
    addSubtabPill(key, defaultTitle);

    // Async lookup actual title and URL
    if (chrome && chrome.tabs) {
      chrome.tabs.get(parseInt(key), t => {
        if (!chrome.runtime.lastError && t) {
          const tObj = tabLogs.get(key);
          if (tObj) {
            tObj.title = t.title ? t.title.substring(0, 24) : defaultTitle;
            tObj.url = t.url || '';
            const btn = getSubtabEl(key);
            if (btn) btn.querySelector('span').textContent = `\u{1F517} ${tObj.title}`;
          }
        }
      });
    }
  }

  // Buckets to store in: always ALL, plus the specific bucket
  const bucketsToStore = [ALL_KEY, isSystem ? SYSTEM_KEY : key];

  for (const bk of bucketsToStore) {
    let bucket = tabLogs.get(bk);
    if (!bucket) {
      bucket = { entries: [], title: bk === SYSTEM_KEY ? 'System' : 'All Events', url: entry.url || '' };
      tabLogs.set(bk, bucket);
    }
    bucket.entries.push(entry);
    if (bucket.entries.length > MAX_PER_TAB) {
      bucket.entries.shift();
    }
  }

  // Only render if this entry belongs to the currently visible sub-tab
  const isVisible = (
    activeSubTab === ALL_KEY ||
    activeSubTab === key ||
    (isSystem && activeSubTab === SYSTEM_KEY)
  );

  if (isVisible) {
    if (els.activityEmpty) els.activityEmpty.style.display = 'none';
    const node = renderEntry(entry);
    els.activityLogInner.appendChild(node);

    // Always auto-scroll to the newest entry
    requestAnimationFrame(() => {
      els.activityLogInner.scrollTop = els.activityLogInner.scrollHeight;
    });
  }


  updateHeaderCounts();

  // Badge counter only when the Activity panel tab itself is not visible
  if (!els.tabActivity.classList.contains('active')) {
    unreadActivityCount++;
    els.activityBadge.textContent = unreadActivityCount > 99 ? '99+' : String(unreadActivityCount);
    els.activityBadge.classList.add('visible');
  }
}

function updateHeaderCounts() {
  let count;
  if (activeSubTab === ALL_KEY) {
    count = (tabLogs.get(ALL_KEY)?.entries || []).length;
  } else {
    count = (tabLogs.get(activeSubTab)?.entries || []).length;
  }
  els.activityCount.textContent = `${count} event${count !== 1 ? 's' : ''}`;

  // Footer timestamp: last entry in All
  const allEntries = tabLogs.get(ALL_KEY)?.entries || [];
  const last = allEntries[allEntries.length - 1];
  els.activityFooterTs.textContent = last ? `Last: ${fmtTime(last.ts)}` : '';
}



/* ── Runtime message listener (from background.js) ───────────────── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'da:activity') return;

  const entry = {
    kind: msg.kind || 'cdp',
    label: msg.label || '(unknown)',
    ts: msg.ts || Date.now(),
    tabId: msg.tabId != null ? msg.tabId : null,
    url: msg.url || '',
  };

  appendActivity(entry);

  // When the relay connects/disconnects, immediately re-run the connection
  // check so both banners (Settings + Activity) update without waiting for
  // the next 5-second poll cycle.
  if (msg.kind === 'relay_connect' || msg.kind === 'relay_disconnect') {
    clearTimeout(pollTimer);
    clearTimeout(heartbeatTimer);
    checkConnection();
    checkHeartbeat();
  }
});

/* ── Clear button — clears current sub-tab's log ─────────────────── */
els.activityClear.addEventListener('click', () => {
  if (activeSubTab === ALL_KEY) {
    // Clear ALL buckets
    tabLogs.forEach((bucket) => { bucket.entries = []; });
    // Remove dynamic pills (keep All + System)
    document.querySelectorAll('.subtab-btn[data-tabkey]').forEach((btn) => {
      const k = btn.getAttribute('data-tabkey');
      if (k !== ALL_KEY && k !== SYSTEM_KEY) btn.remove();
    });
    // Remove stale keys from map
    for (const k of [...tabLogs.keys()]) {
      if (k !== ALL_KEY && k !== SYSTEM_KEY) tabLogs.delete(k);
    }
  } else {
    removeTabLog(activeSubTab);
  }

  rebuildLogInner();
  unreadActivityCount = 0;
  els.activityBadge.textContent = '';
  els.activityBadge.classList.remove('visible');
});

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadSettings);
