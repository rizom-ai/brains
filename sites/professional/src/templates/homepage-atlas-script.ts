import {
  ASK_BOX_ATTRIBUTE,
  ASK_SOURCE_ATTRIBUTE,
  ASK_SOURCES_EVENT,
} from "@brains/contracts";

export const HOMEPAGE_ATLAS_SCRIPT_PATH = "/scripts/homepage-atlas.js";

/**
 * Progressive enhancement for the atlas homepage; the page works without it.
 *
 * - Touch screens have no hover, so the first tap on a mark opens its title
 *   card and the second follows the link. Tapping elsewhere or Escape closes.
 *   Marks crowd on a phone and their hit targets overlap, so a tap in the map
 *   resolves to the nearest mark within a fingertip, not the one on top.
 * - With guest chat docked, a topic fills the chat draft instead of opening
 *   the contact form, and never sends. While the box is off (not enabled,
 *   or unavailable), the topic stays a link to the contact form.
 * - An answer's sources (the shared box's source event) light up on the map
 *   and the map turns towards them, zooming only as far as keeps each in
 *   view; an answer without sources lets go. On desktop a dotted lead runs
 *   from each source the answer lists (or its list's summary, while closed)
 *   to its mark, following the map as it turns and the conversation as it
 *   scrolls. Phones stack the map above the opening, so they get no leads.
 * - Territory names are placed by their rendered size, largest territory
 *   first: each takes the nearest spot to its server placement that stays
 *   inside the map and clear of marks and earlier names, or is hidden rather
 *   than printed over another. It reruns when fonts load and on resize.
 * - The terrain's drift pauses (data-still) while the map is off screen and
 *   while the tab is hidden; reduced motion keeps it still throughout.
 */
export const HOMEPAGE_ATLAS_SCRIPT: string = `(function () {
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
    function liveDraft() {
      var draft = root.querySelector("[${ASK_BOX_ATTRIBUTE}] textarea");
      return draft && !draft.disabled ? draft : null;
    }
    function fillDraft(draft, text) {
      // The prototype setter lets a mounted (React) box see the new value.
      var descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(draft), "value");
      if (descriptor && descriptor.set) descriptor.set.call(draft, text);
      else draft.value = text;
      draft.dispatchEvent(new Event("input", { bubbles: true }));
      draft.focus();
    }

    var field = root.querySelector("[data-atlas-field]");

    var NAME_STEP_X = 12;
    var NAME_STEP_Y = 6;
    var NAME_REACH = 5;
    var NAME_MARGIN = 3; // px kept clear around marks and placed names
    var NAME_GAP = 14; // px between names side by side, so two never read as one
    var span = Array.from({ length: 2 * NAME_REACH + 1 }, function (_, k) { return k - NAME_REACH; });
    var nameOffsets = span
      .flatMap(function (i) { return span.map(function (j) { return [i * NAME_STEP_X, j * NAME_STEP_Y]; }); })
      .sort(function (a, b) { return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]); });
    function moved(box, dx, dy) {
      return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
    }
    function grown(box, sideways) {
      var x = sideways || NAME_MARGIN;
      return { left: box.left - x, top: box.top - NAME_MARGIN, right: box.right + x, bottom: box.bottom + NAME_MARGIN };
    }
    function hits(a, b) {
      return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    }
    function placeNames() {
      // A zoomed map is measured scaled; its names keep their last placement.
      if (!field || field.hasAttribute("data-focused")) return;
      var labels = Array.prototype.slice.call(root.querySelectorAll("[data-atlas-zone]"));
      if (!labels.length) return;
      labels.forEach(function (label) {
        label.removeAttribute("hidden");
        label.style.removeProperty("--atlas-name-shift");
      });
      var area = field.getBoundingClientRect();
      var bases = labels.map(function (label) { return label.getBoundingClientRect(); });
      var taken = Array.prototype.map.call(
        root.querySelectorAll("[data-atlas-mark] .atlas__glyph"),
        function (glyph) { return grown(glyph.getBoundingClientRect()); }
      );
      labels.forEach(function (label, index) {
        var base = bases[index];
        // Start from the nearest position inside the map's edges.
        var inward = Math.max(area.left - base.left, Math.min(0, area.right - base.right));
        var spot = nameOffsets.find(function (offset) {
          var box = moved(base, inward + offset[0], offset[1]);
          return (
            box.left >= area.left && box.right <= area.right &&
            box.top >= area.top && box.bottom <= area.bottom &&
            !taken.some(function (other) { return hits(box, other); })
          );
        });
        if (!spot) {
          label.setAttribute("hidden", "");
          return;
        }
        var dx = inward + spot[0];
        if (dx || spot[1]) label.style.setProperty("--atlas-name-shift", dx + "px " + spot[1] + "px");
        taken.push(grown(moved(base, dx, spot[1]), NAME_GAP));
      });
    }
    var namesPending = 0;
    function scheduleNames() {
      if (namesPending) return;
      namesPending = window.requestAnimationFrame(function () { namesPending = 0; placeNames(); });
    }
    placeNames();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeNames);
    window.addEventListener("resize", scheduleNames);
    var ZOOM = 1.25;
    // Map percentages a cited mark keeps clear of; its card opens above it, under the header.
    var CLEAR = { top: 20, right: 10, bottom: 10, left: 10 };
    // The largest zoom around centre that keeps point between low and high.
    function reach(centre, point, low, high) {
      if (point > centre) return (high - centre) / (point - centre);
      if (point < centre) return (centre - low) / (centre - point);
      return ZOOM;
    }
    function turnTowards(cited) {
      if (!field) return;
      if (!cited.length) { field.removeAttribute("data-focused"); return; }
      var at = function (mark, side) { return parseFloat(mark.style[side]) || 50; };
      var x = cited.reduce(function (sum, mark) { return sum + at(mark, "left"); }, 0) / cited.length;
      var y = cited.reduce(function (sum, mark) { return sum + at(mark, "top"); }, 0) / cited.length;
      field.style.setProperty("--atlas-focus-x", x + "%");
      field.style.setProperty("--atlas-focus-y", y + "%");
      var zoom = cited.reduce(function (limit, mark) {
        return Math.min(
          limit,
          reach(x, at(mark, "left"), CLEAR.left, 100 - CLEAR.right),
          reach(y, at(mark, "top"), CLEAR.top, 100 - CLEAR.bottom)
        );
      }, ZOOM);
      // Sources too far apart to zoom still light up; the map just holds still.
      field.style.setProperty("--atlas-focus-scale", String(Math.max(1, Math.round(zoom * 100) / 100)));
      field.setAttribute("data-focused", "");
    }

    var leads = root.querySelector("[data-atlas-leads]");
    var phone = media("(max-width: 60rem)");
    var SVG = "http://www.w3.org/2000/svg";
    var TURN = 1000; // the map's turn towards its sources, and a frame
    var GAP = 6; // between a listed source and its lead
    var GLYPH = 9; // a lead stops short of the mark it points at
    var citedMarks = [];
    // Every scrolling box between an anchor and the atlas must show it.
    function shown(element, middle) {
      var parent = element.parentElement;
      if (!parent || parent === root) return true;
      var overflow = window.getComputedStyle(parent).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        var area = parent.getBoundingClientRect();
        if (middle < area.top || middle > area.bottom) return false;
      }
      return shown(parent, middle);
    }
    // The latest answer's listing of a source, or its list's summary while closed.
    function anchor(key) {
      var listed = Array.prototype.filter.call(
        root.querySelectorAll("[${ASK_BOX_ATTRIBUTE}] [${ASK_SOURCE_ATTRIBUTE}]"),
        function (item) { return item.getAttribute("${ASK_SOURCE_ATTRIBUTE}") === key; }
      ).pop();
      if (!listed) return null;
      var list = listed.closest("details");
      var from = list && !list.open ? list.querySelector("summary") || list : listed;
      var box = from.getBoundingClientRect();
      return box.height && shown(from, box.top + box.height / 2) ? box : null;
    }
    function drawLeads() {
      if (!leads) return;
      leads.replaceChildren();
      if (phone.matches) return;
      var frame = root.getBoundingClientRect();
      leads.setAttribute("viewBox", "0 0 " + frame.width + " " + frame.height);
      citedMarks.forEach(function (mark) {
        var key = mark.getAttribute("data-atlas-key");
        var from = anchor(key);
        if (!from) return;
        var to = mark.getBoundingClientRect();
        var x1 = from.right + GAP - frame.left;
        var y1 = from.top + from.height / 2 - frame.top;
        var toward = to.left + to.width / 2 - frame.left;
        var x2 = toward > x1 ? toward - GLYPH : toward + GLYPH;
        var y2 = to.top + to.height / 2 - frame.top;
        var bend = Math.max(40, Math.abs(x2 - x1) / 2);
        var lead = document.createElementNS(SVG, "path");
        lead.setAttribute("data-lead", key);
        lead.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + bend) + " " + y1 + " " + (x2 - bend) + " " + y2 + " " + x2 + " " + y2);
        leads.append(lead);
      });
    }
    var pending = 0;
    function scheduleLeads() {
      if (pending || !citedMarks.length) return;
      pending = window.requestAnimationFrame(function () { pending = 0; drawLeads(); });
    }
    // While the map turns, its marks move under the leads every frame.
    function followLeads(until) {
      drawLeads();
      if (citedMarks.length && Date.now() < until)
        window.requestAnimationFrame(function () { followLeads(until); });
    }
    if (leads) {
      window.addEventListener("resize", scheduleLeads);
      // Scrolling the box or the conversation column moves the listed sources.
      document.addEventListener("scroll", scheduleLeads, true);
      // Opening or closing a source list moves where its leads start.
      root.addEventListener("toggle", scheduleLeads, true);
      if (phone.addEventListener) phone.addEventListener("change", scheduleLeads);
      var host = root.querySelector("[${ASK_BOX_ATTRIBUTE}]");
      if (host && typeof ResizeObserver === "function") new ResizeObserver(scheduleLeads).observe(host);
    }

    root.addEventListener("${ASK_SOURCES_EVENT}", function (event) {
      var sources = (event.detail && event.detail.sources) || [];
      var ids = sources.map(function (source) { return source.id; });
      var cited = [];
      root.querySelectorAll("[data-atlas-mark]").forEach(function (mark) {
        if (ids.indexOf(mark.getAttribute("data-atlas-key")) >= 0) {
          mark.setAttribute("data-cited", "");
          cited.push(mark);
        } else mark.removeAttribute("data-cited");
      });
      turnTowards(cited);
      citedMarks = cited;
      followLeads(Date.now() + TURN);
    });

    root.addEventListener("click", function (event) {
      var target = event.target;
      var fill = target && target.closest ? target.closest("[data-atlas-fill]") : null;
      if (fill) {
        var draft = liveDraft();
        // Off: the link reaches the contact form as usual.
        if (!draft) return;
        event.preventDefault();
        fillDraft(draft, fill.getAttribute("data-atlas-fill"));
        return;
      }
      var inField = target && target.closest ? target.closest("[data-atlas-field]") : null;
      if (!inField) { close(); return; }
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
