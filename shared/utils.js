/* ─── DOMAgent Shared Utilities ────────────────────────────────────
 *
 * Used by: server.js (Node.js ESM), content scripts (browser),
 *          background scripts (browser via importScripts)
 *
 * escapeJS(): Replaces the old manual escapeJS with JSON.stringify
 * for complete Unicode safety (handles \u2028, \u2029, and all edge cases).
 * Oracle security audit finding #2 — LOW, now fixed.
 * ─────────────────────────────────────────────────────────────────── */

/**
 * Safely encode a string for embedding into a JavaScript string literal.
 * Uses JSON.stringify which handles all special characters including
 * U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) that the old
 * manual escapeJS() missed.
 *
 * Returns a double-quoted JSON string suitable for direct interpolation
 * into JavaScript code as a string literal.
 *
 * @param {string} str
 * @returns {string} JSON-quoted string, e.g. '"hello world"'
 */
export function escapeJS(str) {
  return JSON.stringify(String(str));
}
