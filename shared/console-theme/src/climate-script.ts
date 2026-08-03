/**
 * Inline script applying the console-wide climate preference before first
 * paint. The "console.climate" key is shared by every console surface, so a
 * toggle on one follows the user to the others. Each climate also selects
 * the matching semantic theme mode so paper resolves injected site tokens
 * from their light palette. The stored climate is applied immediately (the
 * script may run from <head>), but the strip's #climateToggle only exists
 * once the body is parsed, so binding waits for DOMContentLoaded when needed.
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
  function bind() {
    var btn = document.getElementById("climateToggle");
    if (!btn) return;
    function sync() {
      var instrument = root.getAttribute("data-climate") === "instrument";
      btn.textContent = instrument ? "\\u25D0" : "\\u25D1";
      var label = instrument ? "Switch to paper climate" : "Switch to instrument climate";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    }
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-climate") === "instrument" ? "paper" : "instrument";
      applyClimate(next);
      try { localStorage.setItem("console.climate", next); } catch (e) { /* storage unavailable */ }
      sync();
    });
    sync();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();`;
