/**
 * Inline script applying the console-wide climate preference before first
 * paint. The "console.climate" key is shared by every operator surface, so a
 * toggle on one follows the operator to the others. The stored climate is
 * applied immediately (the script may run from <head>), but the strip's
 * #climateToggle only exists once the body is parsed, so binding waits for
 * DOMContentLoaded when needed.
 */
export const CONSOLE_CLIMATE_SCRIPT = `(function () {
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("console.climate"); } catch (e) { /* storage unavailable */ }
  if (stored === "paper" || stored === "instrument") {
    root.setAttribute("data-climate", stored);
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
      root.setAttribute("data-climate", next);
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
