/**
 * Inline script applying the console-wide climate preference before first
 * paint. The "console.climate" key is shared by every console surface, so a
 * toggle on one follows the user to the others. Each climate also selects
 * the matching semantic theme mode so paper resolves injected site tokens
 * from their light palette. The stored climate is applied immediately (the
 * script may run from <head>), but the strip's #climateToggle only exists
 * once the body is parsed or the client mounts. Delegate clicks and sync
 * newly mounted controls so client-rendered shells and remounts work too.
 */
export const CONSOLE_CLIMATE_SCRIPT = `(function () {
  var root = document.documentElement;
  function applyClimate(climate) {
    root.setAttribute("data-climate", climate);
    root.setAttribute("data-theme", climate === "paper" ? "light" : "dark");
  }
  var stored = null;
  try { stored = localStorage.getItem("console.climate"); } catch (e) { /* storage unavailable */ }
  var climate = stored === "paper" || stored === "instrument"
    ? stored
    : root.getAttribute("data-climate");
  if (climate === "paper" || climate === "instrument") {
    applyClimate(climate);
  }
  function sync() {
    var btn = document.getElementById("climateToggle");
    if (!btn) return;
    var instrument = root.getAttribute("data-climate") === "instrument";
    btn.textContent = instrument ? "\\u25D0" : "\\u25D1";
    var label = instrument ? "Switch to paper climate" : "Switch to instrument climate";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }
  function bind() {
    document.addEventListener("click", function (event) {
      var target = event.target;
      var btn = target && target.closest ? target.closest("button#climateToggle") : null;
      if (!btn || btn.disabled) return;
      var next = root.getAttribute("data-climate") === "instrument" ? "paper" : "instrument";
      applyClimate(next);
      try { localStorage.setItem("console.climate", next); } catch (e) { /* storage unavailable */ }
      sync();
    });
    new window.MutationObserver(function (records) {
      var mounted = records.some(function (record) {
        return Array.from(record.addedNodes).some(function (node) {
          return node.nodeType === 1 && (node.id === "climateToggle" || node.querySelector("#climateToggle"));
        });
      });
      if (mounted) sync();
    }).observe(root, { childList: true, subtree: true });
    sync();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();`;
