/* DOMAgent Firefox Content Script
 *
 * Runs in every tab's isolated world. Receives command messages from
 * background.js via browser.tabs.sendMessage and executes them in the
 * page, returning results back to background.
 *
 * This replaces Chrome's chrome.debugger API for Firefox — all page
 * interactions (eval, screenshot, overlays) happen here directly.
 *
 * Shared functions loaded from ../../shared/content-script-lib.js
 * before this script (see manifest.json content_scripts order).
 */

/* browser compat shim */
const _api = typeof browser !== 'undefined' ? browser : chrome;

/* Message listener */
_api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { method, params } = message || {};

  (async () => {
    try {
      let result;

      switch (method) {
        case 'Runtime.evaluate': {
          const expr = params?.expression || '';
          const res = await Promise.resolve(domAgentEvaluate(expr));
          result = { result: { type: 'string', value: res?.value ?? '' } };
          break;
        }

        case 'Page.captureScreenshot':
          result = await domAgentCaptureScreenshot();
          break;

        case 'Browser.click': {
          const cfg = params?.overlayConfig || {};
          result = domAgentClickElement(params.selector, cfg.overlayClickEnabled !== false, (cfg.overlayClickOpacity || 75) / 100);
          break;
        }

        case 'Browser.type': {
          const cfg = params?.overlayConfig || {};
          result = domAgentTypeIntoElement(params.selector, params.text, cfg.overlayTypeEnabled !== false, (cfg.overlayTypeOpacity || 75) / 100);
          break;
        }

        case 'Browser.getText':
          result = domAgentGetText(params.selector);
          break;

        case 'Browser.getInteractiveElements': {
          const cfg = params?.overlayConfig || {};
          result = domAgentGetInteractiveElements({
            showClick: cfg.overlayClickEnabled !== false,
            showType: cfg.overlayTypeEnabled !== false,
            showText: cfg.overlayTextEnabled !== false,
            opClick: (cfg.overlayClickOpacity || 75) / 100,
            opType: (cfg.overlayTypeOpacity || 75) / 100,
            opText: (cfg.overlayTextOpacity || 50) / 100,
          });
          break;
        }

        case 'Browser.clearOverlays':
          result = domAgentClearOverlays();
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      sendResponse({ result });
    } catch (e) {
      sendResponse({ error: e instanceof Error ? e.message : String(e) });
    }
  })();

  return true;
});
