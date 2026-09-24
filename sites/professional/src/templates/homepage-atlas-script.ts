export const HOMEPAGE_ATLAS_SCRIPT_PATH = "/scripts/homepage-atlas.js";

/**
 * Progressive enhancement for the atlas homepage; the page works without it.
 *
 * - Touch screens have no hover, so the first tap on a mark opens its title
 *   card and the second follows the link. Tapping elsewhere or Escape closes.
 *   Marks crowd on a phone and their hit targets overlap, so a tap in the map
 *   resolves to the nearest mark within a fingertip, not the one on top.
 * - The terrain's drift pauses (data-still) while the map is off screen and
 *   while the tab is hidden; reduced motion keeps it still throughout.
 */
export const HOMEPAGE_ATLAS_SCRIPT = `(function () {
  var roots = document.querySelectorAll("[data-atlas]");
  if (!roots.length) return;

  function media(query) {
    return window.matchMedia
      ? window.matchMedia(query)
      : { matches: false, addEventListener: function () {} };
  }
  var touch = media("(hover: none)");
  var still = media("(prefers-reduced-motion: reduce)");

  roots.forEach(function (root) {
    var terrain = root.querySelector("[data-atlas-terrain]");
    var visible = true;
    function syncMotion() {
      if (visible && !still.matches && !document.hidden) root.removeAttribute("data-still");
      else root.setAttribute("data-still", "");
    }
    if (terrain && typeof IntersectionObserver === "function") {
      new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) { return entry.isIntersecting; });
        syncMotion();
      }).observe(terrain);
    }
    if (still.addEventListener) still.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    syncMotion();

    var REACH = 36;
    function nearest(x, y) {
      var best = null;
      var bestDistance = REACH;
      root.querySelectorAll("[data-atlas-mark]").forEach(function (mark) {
        if (!mark.querySelector("a")) return;
        var box = mark.getBoundingClientRect();
        var distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
        if (distance <= bestDistance) { best = mark; bestDistance = distance; }
      });
      return best;
    }

    var open = null;
    function close() {
      if (!open) return;
      open.removeAttribute("data-open");
      open = null;
    }
    root.addEventListener("click", function (event) {
      var target = event.target;
      var field = target && target.closest ? target.closest("[data-atlas-field]") : null;
      if (!field) { close(); return; }
      if (!touch.matches) return;
      var mark = nearest(event.clientX, event.clientY) || target.closest("[data-atlas-mark]");
      // The open card, or a second tap on the open mark itself, follows its link natively.
      var onOpenCard = open && open.contains(target) && target.closest("[data-atlas-tip]");
      if (onOpenCard || (open && mark === open && open.contains(target))) return;
      if (!mark) { close(); return; }
      event.preventDefault();
      if (mark === open) {
        window.location.assign(mark.querySelector("a").href);
        return;
      }
      close();
      open = mark;
      mark.setAttribute("data-open", "");
    });
    document.addEventListener("click", function (event) {
      if (!root.contains(event.target)) close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });
  });
})();`;
