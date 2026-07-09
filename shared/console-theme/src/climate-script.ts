/**
 * Inline script applying the console-wide climate preference before first
 * paint. The "console.climate" key is shared by every operator surface, so a
 * toggle on one follows the operator to the others. Binds the toggle button
 * (#climateToggle) when the hosting surface renders one; no-ops otherwise.
 */
export const CONSOLE_CLIMATE_SCRIPT = `(function () {
  var root = document.documentElement;
  var btn = document.getElementById("climateToggle");
  var stored = null;
  try { stored = localStorage.getItem("console.climate"); } catch (e) { /* storage unavailable */ }
  if (stored === "paper" || stored === "instrument") {
    root.setAttribute("data-climate", stored);
  }
  function sync() {
    if (!btn) return;
    btn.textContent = root.getAttribute("data-climate") === "instrument" ? "Paper mode" : "Instrument mode";
  }
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-climate") === "instrument" ? "paper" : "instrument";
      root.setAttribute("data-climate", next);
      try { localStorage.setItem("console.climate", next); } catch (e) { /* storage unavailable */ }
      sync();
    });
  }
  sync();
})();`;
