/* ─── DOMAgent Shared Overlay Styles ────────────────────────────────
 *
 * Used by: server.js (Node.js ESM), content-script-lib.js (browser)
 *
 * Single source of truth for all overlay CSS classes used by
 * click indicators, type indicators, scan boxes, and index badges.
 * Previously duplicated in 3 files (server.js + 2 content scripts).
 * ─────────────────────────────────────────────────────────────────── */

export const OVERLAY_CSS = `
.__da-scan-box {
  position: fixed !important;
  pointer-events: none !important;
  z-index: 2147483640 !important;
  border: 1.5px dashed !important;
  border-radius: 3px !important;
  box-sizing: border-box !important;
  transition: opacity 0.4s ease !important;
}
.__da-scan-box[data-kind="click"] {
  border-color: rgba(234, 179, 8, 0.75) !important;
  background: rgba(234, 179, 8, 0.04) !important;
}
.__da-scan-box[data-kind="type"] {
  border-color: rgba(34, 197, 94, 0.75) !important;
  background: rgba(34, 197, 94, 0.04) !important;
}
.__da-scan-box[data-kind="text"] {
  border: 1px solid rgba(0, 210, 255, 0.50) !important;
  background: rgba(0, 210, 255, 0.05) !important;
}
.__da-idx {
  position: absolute !important;
  top: -1px !important;
  left: -1px !important;
  background: rgba(255, 90, 54, 0.92) !important;
  color: #fff !important;
  font: bold 9px/1 system-ui, sans-serif !important;
  padding: 1px 4px 2px !important;
  border-radius: 0 0 4px 0 !important;
  pointer-events: none !important;
  letter-spacing: 0.3px !important;
}
.__da-action-hl {
  position: fixed !important;
  pointer-events: none !important;
  z-index: 2147483645 !important;
  border-radius: 4px !important;
  box-sizing: border-box !important;
  animation: __da-pulse 0.5s ease-in-out 3 !important;
}
.__da-action-hl[data-action="click"] {
  border: 2.5px solid rgba(234, 179, 8, 0.95) !important;
  background: rgba(234, 179, 8, 0.10) !important;
  box-shadow: 0 0 8px rgba(234, 179, 8, 0.35) !important;
}
.__da-action-hl[data-action="type"] {
  border: 2.5px solid rgba(34, 197, 94, 0.95) !important;
  background: rgba(34, 197, 94, 0.10) !important;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.35) !important;
}
@keyframes __da-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;
