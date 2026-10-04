import {
  ASK_AIM_ATTRIBUTE,
  ASK_AIMED_EVENT,
  ASK_BOX_ATTRIBUTE,
  ASK_CITED_ATTRIBUTE,
  ASK_CITED_EVENT,
  ASK_DOCK_ATTRIBUTE,
  ASK_DRAWING_ATTRIBUTE,
  ASK_FLASH_ATTRIBUTE,
  ASK_LEADS_ATTRIBUTE,
  ASK_LENT_EVENT,
  ASK_MARK_ATTRIBUTE,
  ASK_RETURNED_EVENT,
  ASK_ROOM_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SLOT_ATTRIBUTE,
  ASK_SOURCE_ATTRIBUTE,
  ASK_SOURCES_EVENT,
} from "@brains/contracts";

/**
 * The Ask room's runtime, shared by every page that presents the box beside
 * a drawing (see the room attributes in @brains/contracts ask-box). It runs
 * on each root and does what the drawing's kind does not change:
 *
 * - An answer's sources (the box's source event, told to the box or to the
 *   document) are matched to the drawing's marks, which are cited while the
 *   answer stands; the root is told what was matched and what was not, and
 *   the page lights its drawing from that.
 * - On a wide screen a dotted lead runs from each listed source (or its
 *   list's summary, while closed) to its mark in the drawing, in the lead
 *   layer's own frame, only while both ends are in view; it follows the
 *   page and the conversation as they scroll, and the drawing for a moment
 *   after an answer, while it turns. Phones stack the drawing above the
 *   words, so they get no leads.
 * - While a phone's conversation sheet is open, the drawing is lent to its
 *   dock, a slot holding its place, and taken back on close.
 * - In the open sheet, a cited mark's aim (or the mark, when it has none)
 *   brings its listed source to the middle of the conversation and flashes
 *   it; the root is told, so a page can close what it had open.
 */
export const ASK_ROOM_SCRIPT: string = `(function () {
  var ROOM = "${ASK_ROOM_ATTRIBUTE}", MARK = "${ASK_MARK_ATTRIBUTE}", CITED = "${ASK_CITED_ATTRIBUTE}";
  var SOURCE = "${ASK_SOURCE_ATTRIBUTE}", SHEET = "${ASK_SHEET_ATTRIBUTE}", FLASH = "${ASK_FLASH_ATTRIBUTE}";
  var SVG = "http://www.w3.org/2000/svg";
  var TURN = 1000; // a drawing's turn towards its sources, and a frame
  var GAP = 6; // between a listed source and its lead
  var GLYPH = 9; // a lead stops short of the mark it points at
  function media(query) {
    return typeof window.matchMedia === "function" ? window.matchMedia(query) : { matches: false };
  }
  var narrow = media("(max-width: 60rem)");
  var still = media("(prefers-reduced-motion: reduce)");
  function tell(target, name, detail) {
    target.dispatchEvent(new window.CustomEvent(name, { bubbles: true, detail: detail }));
  }
  function flag(element, name, ms) {
    element.removeAttribute(name);
    // A fresh attribute restarts its animation.
    void element.offsetWidth;
    element.setAttribute(name, "");
    window.setTimeout(function () { element.removeAttribute(name); }, ms);
  }
  // A point is in view when it is on screen and no scrolling box hides it.
  function shown(element, middle) {
    if (middle < 0 || middle > window.innerHeight) return false;
    var parent = element.parentElement;
    while (parent && parent !== document.body) {
      var overflow = window.getComputedStyle(parent).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        var area = parent.getBoundingClientRect();
        if (middle < area.top || middle > area.bottom) return false;
      }
      parent = parent.parentElement;
    }
    return true;
  }

  Array.prototype.forEach.call(document.querySelectorAll("[" + ROOM + "]"), function (root) {
    var host = root.querySelector("[${ASK_BOX_ATTRIBUTE}]");
    var drawing = root.querySelector("[${ASK_DRAWING_ATTRIBUTE}]");
    var layer = root.querySelector("[${ASK_LEADS_ATTRIBUTE}]");
    function marks() { return Array.prototype.slice.call(root.querySelectorAll("[" + MARK + "]")); }
    function keyed(all, key) { return all.filter(function (m) { return m.getAttribute(MARK) === key; }); }
    function label(mark) {
      var named = mark.hasAttribute("aria-label") ? mark : mark.querySelector("[aria-label]");
      return named ? String(named.getAttribute("aria-label")).toLowerCase() : "";
    }
    // The marks a source cites: by its id, by its brain's address, by its brain's name.
    function match(source) {
      var all = marks();
      var byId = keyed(all, source.id);
      if (byId.length) return { source: source, key: source.id, marks: byId };
      var brain = source.brain;
      if (!brain) return null;
      var address = "";
      if (brain.url) { try { address = new URL(brain.url).host; } catch (e) { address = ""; } }
      var byAddress = address ? keyed(all, address) : [];
      if (byAddress.length) return { source: source, key: address, marks: byAddress };
      var name = String(brain.name || "").toLowerCase();
      var byName = name ? all.filter(function (m) { return label(m) === name; }) : [];
      if (byName.length) return { source: source, key: byName[0].getAttribute(MARK), marks: byName };
      return null;
    }
    var cited = [];
    function cite(sources) {
      var unmatched = [];
      var lit = [];
      cited = [];
      sources.forEach(function (source) {
        var found = match(source);
        if (!found) { unmatched.push(source); return; }
        cited.push(found);
        found.marks.forEach(function (m) { if (lit.indexOf(m) < 0) lit.push(m); });
      });
      marks().forEach(function (m) {
        if (lit.indexOf(m) >= 0) m.setAttribute(CITED, ""); else m.removeAttribute(CITED);
      });
      tell(root, "${ASK_CITED_EVENT}", { sources: sources, cited: cited, marks: lit, unmatched: unmatched });
    }

    // The latest listing of a source in the box, and where its lead starts:
    // the listing, or its list's summary while the list is closed.
    function listed(id) {
      if (!host) return null;
      var rows = Array.prototype.filter.call(host.querySelectorAll("[" + SOURCE + "]"), function (row) {
        return row.getAttribute(SOURCE) === id;
      });
      return rows.length ? rows[rows.length - 1] : null;
    }
    function anchor(id) {
      var row = listed(id);
      if (!row) return null;
      var list = row.closest("details");
      var from = list && !list.open ? list.querySelector("summary") || list : row;
      var box = from.getBoundingClientRect();
      return box.height && shown(from, box.top + box.height / 2) ? box : null;
    }
    function target(entry) {
      var own = drawing ? entry.marks.filter(function (m) { return drawing.contains(m); }) : entry.marks;
      return own[0] || null;
    }
    function drawLeads() {
      if (!layer) return;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      if (narrow.matches || !host) return;
      var frame = layer.getBoundingClientRect();
      layer.setAttribute("viewBox", "0 0 " + frame.width + " " + frame.height);
      cited.forEach(function (entry) {
        var mark = target(entry);
        var from = mark ? anchor(entry.source.id) : null;
        if (!from) return;
        var to = mark.getBoundingClientRect();
        var y2 = to.top + to.height / 2;
        if (!shown(mark, y2)) return;
        var x1 = from.right + GAP - frame.left;
        var y1 = from.top + from.height / 2 - frame.top;
        var toward = to.left + to.width / 2 - frame.left;
        var x2 = toward > x1 ? toward - GLYPH : toward + GLYPH;
        y2 -= frame.top;
        var bend = Math.max(40, Math.abs(x2 - x1) / 2);
        var lead = document.createElementNS(SVG, "path");
        lead.setAttribute("data-lead", entry.source.id);
        lead.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + bend) + " " + y1 + " " + (x2 - bend) + " " + y2 + " " + x2 + " " + y2);
        layer.appendChild(lead);
      });
    }
    var pending = false;
    function scheduleLeads() {
      if (pending || !layer) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; drawLeads(); });
    }
    // While the drawing turns towards its sources, its marks move under the leads every frame.
    function followLeads(until) {
      drawLeads();
      if (layer && cited.length && Date.now() < until) window.requestAnimationFrame(function () { followLeads(until); });
    }
    if (layer) {
      window.addEventListener("resize", scheduleLeads);
      // Scrolling the page or the conversation moves the listed sources.
      document.addEventListener("scroll", scheduleLeads, true);
      // Opening or closing a source list moves where its leads start.
      document.addEventListener("toggle", scheduleLeads, true);
      if (narrow.addEventListener) narrow.addEventListener("change", scheduleLeads);
      if (host && typeof window.ResizeObserver === "function") new window.ResizeObserver(scheduleLeads).observe(host);
    }

    document.addEventListener("${ASK_SOURCES_EVENT}", function (event) {
      if (event.target !== document && !root.contains(event.target)) return;
      var detail = event.detail || {};
      cite(Array.isArray(detail.sources) ? detail.sources : []);
      followLeads(Date.now() + TURN);
    });

    function sheetOpen() { return !!host && host.hasAttribute(SHEET); }
    var slot = null;
    function lend() {
      var dock = host.querySelector("[${ASK_DOCK_ATTRIBUTE}]");
      if (!drawing || !dock || drawing.parentElement === dock) return;
      slot = document.createElement("div");
      slot.setAttribute("${ASK_SLOT_ATTRIBUTE}", "");
      slot.setAttribute("aria-hidden", "true");
      drawing.parentNode.insertBefore(slot, drawing);
      dock.appendChild(drawing);
      tell(root, "${ASK_LENT_EVENT}", { drawing: drawing, dock: dock });
    }
    function giveBack() {
      if (!slot) return;
      slot.parentNode.insertBefore(drawing, slot);
      slot.parentNode.removeChild(slot);
      slot = null;
      tell(root, "${ASK_RETURNED_EVENT}", { drawing: drawing });
    }
    if (host && drawing && typeof window.MutationObserver === "function") {
      // The box mounts, and so its dock appears, after the sheet has opened.
      new window.MutationObserver(function () { if (sheetOpen()) lend(); else giveBack(); })
        .observe(host, { attributes: true, attributeFilter: [SHEET], childList: true, subtree: true });
    }

    root.addEventListener("click", function (event) {
      var hit = event.target;
      if (!sheetOpen() || !hit || !hit.closest) return;
      var mark = hit.closest("[" + MARK + "]");
      if (!mark || !mark.hasAttribute(CITED) || (drawing && !drawing.contains(mark))) return;
      var aim = mark.querySelector("[${ASK_AIM_ATTRIBUTE}]");
      if (aim && !aim.contains(hit)) return;
      var entry = cited.filter(function (e) { return e.marks.indexOf(mark) >= 0; })[0];
      var area = host.querySelector(".brain-box-scroll");
      var row = entry ? listed(entry.source.id) : null;
      if (!row || !area) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var at = row.getBoundingClientRect(), box = area.getBoundingClientRect();
      // Its source in the middle of the conversation, flashing.
      var top = area.scrollTop + at.top - box.top - area.clientHeight / 2 + at.height / 2;
      if (area.scrollTo) area.scrollTo({ top: top, behavior: still.matches ? "auto" : "smooth" }); else area.scrollTop = top;
      flag(row, FLASH, 1500);
      tell(root, "${ASK_AIMED_EVENT}", { mark: mark, source: row });
    });
  });
})();
`;
