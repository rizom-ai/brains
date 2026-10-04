import {
  ASK_AIMED_EVENT,
  ASK_BOX_ATTRIBUTE,
  ASK_CITED_EVENT,
  ASK_DRAWING_ATTRIBUTE,
  ASK_LENT_EVENT,
  ASK_SHEET_ATTRIBUTE,
  ASK_SOURCE_ATTRIBUTE,
} from "@brains/contracts";
import { ASK_ROOM_SCRIPT } from "./ask-room-script";

export const HOMEPAGE_ATLAS_SCRIPT_PATH = "/scripts/homepage-atlas.js";

/**
 * Progressive enhancement for the atlas homepage; the page works without it.
 *
 * - Touch screens have no hover, so the first tap on a mark opens its title
 *   card and the second follows the link. Tapping elsewhere or Escape closes.
 * - The legend's "Latest" opens the latest piece's card: while hovered or
 *   focused, and on a touch screen at the first tap, the second following it.
 *   Marks crowd on a phone and their hit targets overlap, so a tap in the map
 *   resolves to the nearest mark within a fingertip, not the one on top.
 * - With guest chat docked, a topic fills the chat draft instead of opening
 *   the contact form, and never sends. While the box is off (not enabled,
 *   or unavailable), the topic stays a link to the contact form.
 * - The contact form runs no script, so it cannot read the visitor's theme
 *   choice: the links to it carry the current theme, and follow a change.
 * - The atlas is an Ask room (the room script runs first; see
 *   @brains/contracts ask-box): the room lights the marks an answer cites,
 *   draws the leads to them, lends the map to a phone's conversation and
 *   brings a cited source into view from its mark's card. The atlas turns
 *   the map towards the cited marks, zooming only as far as keeps each in
 *   view, and lets go for an answer without sources.
 * - Territory names are placed by their rendered size, largest territory
 *   first: each takes the nearest spot to its server placement, within a reach
 *   in proportion to the map, that stays inside the map and clear of marks and
 *   earlier names, or is hidden rather than printed over another. A hidden
 *   name keeps its place empty, so a smaller territory's name never stands in
 *   for it; each mark's card names its territory. It reruns when fonts load
 *   and on resize.
 * - The terrain's drift pauses (data-still) while the map is off screen and
 *   while the tab is hidden; reduced motion keeps it still throughout.
 */
export const HOMEPAGE_ATLAS_SCRIPT: string =
  ASK_ROOM_SCRIPT +
  `(function () {
  var roots = document.querySelectorAll("[data-atlas]");
  if (!roots.length) return;

  function media(query) {
    return window.matchMedia
      ? window.matchMedia(query)
      : { matches: false, addEventListener: function () {} };
  }
  var touch = media("(hover: none)");
  var still = media("(prefers-reduced-motion: reduce)");
  // Phones stack the map above the opening (the stylesheet's breakpoint).
  var narrow = media("(max-width: 60rem)");

  roots.forEach(function (root) {
    var doors = root.querySelectorAll("[data-atlas-door]");
    function carryTheme() {
      var theme = document.documentElement.getAttribute("data-theme");
      if (theme !== "light" && theme !== "dark") return;
      doors.forEach(function (link) {
        var url = new URL(link.getAttribute("href") || "", window.location.href);
        url.searchParams.set("theme", theme);
        link.setAttribute("href", url.href);
      });
    }
    carryTheme();
    if (typeof MutationObserver === "function")
      new MutationObserver(carryTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

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
    // A name moves at most this share of the map's width or height, so it stays by its territory at every size.
    var NAME_REACH = 0.12;
    var NAME_MARGIN = 3; // px kept clear around marks and placed names
    var NAME_GAP = 14; // px between names side by side, so two never read as one
    function steps(length, step) {
      var reach = Math.max(1, Math.round((NAME_REACH * length) / step));
      return Array.from({ length: 2 * reach + 1 }, function (_, k) { return (k - reach) * step; });
    }
    function nameOffsets(area) {
      var ys = steps(area.bottom - area.top, NAME_STEP_Y);
      return steps(area.right - area.left, NAME_STEP_X)
        .flatMap(function (dx) { return ys.map(function (dy) { return [dx, dy]; }); })
        .sort(function (a, b) { return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]); });
    }
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
      // On a phone the text starts where the map's content ends; names stay above it.
      var fill = field.parentElement
        ? parseFloat(window.getComputedStyle(field.parentElement).getPropertyValue("--atlas-fill"))
        : NaN;
      if (narrow.matches && fill > 0 && fill < 1)
        area = { left: area.left, top: area.top, right: area.right, bottom: area.top + fill * (area.bottom - area.top) };
      var offsets = nameOffsets(area);
      var bases = labels.map(function (label) { return label.getBoundingClientRect(); });
      var taken = Array.prototype.map.call(
        root.querySelectorAll("[data-atlas-mark] .atlas__glyph"),
        function (glyph) { return grown(glyph.getBoundingClientRect()); }
      );
      labels.forEach(function (label, index) {
        var base = bases[index];
        // Start from the nearest position inside the map's edges.
        var inward = Math.max(area.left - base.left, Math.min(0, area.right - base.right));
        var spot = offsets.find(function (offset) {
          var box = moved(base, inward + offset[0], offset[1]);
          return (
            box.left >= area.left && box.right <= area.right &&
            box.top >= area.top && box.bottom <= area.bottom &&
            !taken.some(function (other) { return hits(box, other); })
          );
        });
        if (!spot) {
          label.setAttribute("hidden", "");
          // Its place stays empty: a smaller territory's name there would read as this one's.
          taken.push(grown(moved(base, inward, 0), NAME_GAP));
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
    if (narrow.addEventListener) narrow.addEventListener("change", scheduleNames);
    var ZOOM = 1.25;
    // Map percentages a cited mark keeps clear of; its card opens above it, under the header.
    var CLEAR = { top: 20, right: 10, bottom: 10, left: 10 };
    // The largest zoom around centre that keeps point between low and high.
    function reach(centre, point, low, high) {
      if (point > centre) return (high - centre) / (point - centre);
      if (point < centre) return (centre - low) / (centre - point);
      return ZOOM;
    }
    // A map shown as a strip slides only while an answer moves it (the phone
    // sheet transitions its pan under this mark), so opening it never does.
    var panning = 0;
    function pan() {
      field.setAttribute("data-atlas-panning", "");
      window.clearTimeout(panning);
      panning = window.setTimeout(function () { field.removeAttribute("data-atlas-panning"); }, TURN);
    }
    function turnTowards(cited) {
      if (!field) return;
      pan();
      if (!cited.length) {
        field.removeAttribute("data-focused");
        field.style.removeProperty("--atlas-strip-y");
        return;
      }
      var at = function (mark, side) { return parseFloat(mark.style[side]) || 50; };
      var x = cited.reduce(function (sum, mark) { return sum + at(mark, "left"); }, 0) / cited.length;
      var y = cited.reduce(function (sum, mark) { return sum + at(mark, "top"); }, 0) / cited.length;
      field.style.setProperty("--atlas-focus-x", x + "%");
      field.style.setProperty("--atlas-focus-y", y + "%");
      // A map shown as a strip slides to where its sources sit.
      field.style.setProperty("--atlas-strip-y", String(y));
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

    var TURN = 1000; // the map's turn towards its sources

    // In a phone's open conversation the map sits under its header, as tall
    // as the page's at the top and shrinking to a strip as the answer scrolls
    // beneath it. Sources and pieces point at each other there: a tapped
    // source shows its piece, and a piece's card shows where it is cited.
    var askHost = root.querySelector("[${ASK_BOX_ATTRIBUTE}]");
    function conversation() {
      return askHost ? askHost.querySelector(".brain-box-scroll") : null;
    }
    function sheetOpen() {
      return !!askHost && askHost.hasAttribute("${ASK_SHEET_ATTRIBUTE}");
    }
    function follow(scroller) {
      root.style.setProperty("--atlas-sheet-scroll", (scroller ? scroller.scrollTop : 0) + "px");
    }
    // Scroll events do not bubble; the conversation's reach the map on the way down.
    root.addEventListener("scroll", function (event) {
      var scroller = event.target;
      if (scroller && scroller.classList && scroller.classList.contains("brain-box-scroll")) follow(scroller);
    }, true);
    function glide(scroller, top) {
      if (scroller.scrollTo) scroller.scrollTo({ top: top, behavior: still.matches ? "auto" : "smooth" });
      else scroller.scrollTop = top;
    }
    function mark(key) {
      return Array.prototype.filter.call(root.querySelectorAll("[data-atlas-mark]"), function (candidate) {
        return candidate.getAttribute("data-atlas-key") === key;
      })[0] || null;
    }
    function flag(element, name, ms) {
      element.removeAttribute(name);
      // A fresh attribute restarts its animation.
      void element.offsetWidth;
      element.setAttribute(name, "");
      window.setTimeout(function () { element.removeAttribute(name); }, ms);
    }
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest || !sheetOpen()) return;
      var scroller = conversation();
      // Scrolled up into a strip, the map is too small to aim at: a tap on it
      // brings the whole map back, as a tap on an app's top bar does.
      if (scroller && scroller.scrollTop > 4 && lent && lent.contains(target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        glide(scroller, 0);
        return;
      }
      var source = target.closest("[${ASK_SOURCE_ATTRIBUTE}]");
      var piece = source ? mark(source.getAttribute("${ASK_SOURCE_ATTRIBUTE}")) : null;
      if (piece && piece.querySelector("a")) {
        // Back to the full map, its piece pulsing with its card open.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (scroller) glide(scroller, 0);
        close();
        open = piece;
        piece.setAttribute("data-open", "");
        flag(piece, "data-atlas-pulse", 2400);
        return;
      }
    }, true);
    // While it is open, the map is lent    }, true);
    // The room lends the map to the open conversation's dock; the atlas then
    // follows how far the answer has scrolled, and closes an open card when
    // the room brings a cited source into view from it.
    var lent = root.querySelector("[${ASK_DRAWING_ATTRIBUTE}]");
    root.addEventListener("${ASK_LENT_EVENT}", function () { follow(conversation()); });
    root.addEventListener("${ASK_AIMED_EVENT}", function () { close(); });
    // Each source the box lists is named as the legend names its kind, from
    // its mark, and whenever the box renders the list.
    function nameSources() {
      if (!askHost) return;
      askHost.querySelectorAll("[${ASK_SOURCE_ATTRIBUTE}]").forEach(function (item) {
        var source = mark(item.getAttribute("${ASK_SOURCE_ATTRIBUTE}"));
        var type = source && source.getAttribute("data-atlas-type");
        if (type && item.getAttribute("data-atlas-type") !== type) item.setAttribute("data-atlas-type", type);
      });
    }
    if (askHost && typeof MutationObserver === "function")
      // The box renders its list after the sheet has opened.
      new MutationObserver(nameSources).observe(askHost, { childList: true, subtree: true });

    root.addEventListener("${ASK_CITED_EVENT}", function (event) {
      var marks = (event.detail && event.detail.marks) || [];
      turnTowards(marks.filter(function (mark) { return field && field.contains(mark); }));
      nameSources();
    });

    var latestKey = root.querySelector("[data-atlas-latest]");
    var latestMark = latestKey
      ? root.querySelector('[data-atlas-key="' + latestKey.getAttribute("data-atlas-latest") + '"]')
      : null;
    function openLatest() {
      if (!latestMark || open === latestMark) return;
      close();
      open = latestMark;
      latestMark.setAttribute("data-open", "");
    }
    // A touch browser emulates hover and focus before a tap's click; there the tap alone opens it.
    function previewLatest() {
      if (!touch.matches) openLatest();
    }
    function endPreview() {
      if (!touch.matches && open === latestMark) close();
    }
    if (latestKey && latestMark) {
      latestKey.addEventListener("mouseenter", previewLatest);
      latestKey.addEventListener("focus", previewLatest);
      latestKey.addEventListener("mouseleave", endPreview);
      latestKey.addEventListener("blur", endPreview);
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      // A first tap on "Latest" opens the latest piece's card; the next follows the link.
      if (latestMark && touch.matches && target && target.closest && target.closest("[data-atlas-latest]")) {
        if (open === latestMark) return;
        event.preventDefault();
        openLatest();
        return;
      }
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
