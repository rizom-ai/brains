/**
 * The story pages' runtime: the reading line decides the current chapter,
 * which sets the drawing's stage and lights the reading thread. The pure
 * function is exported for tests and inlined into the shipped script, so
 * there is one source for the reading line.
 */

/** The index of the last chapter whose top has passed the reading line, clamped to the stages a drawing has. */
export function currentChapter(
  tops: readonly number[],
  line: number,
  stageCount: number = Number.POSITIVE_INFINITY,
): number {
  const passed = tops.reduce(
    (current, top, i) => (top <= line ? i : current),
    0,
  );
  return Math.min(passed, Math.max(0, stageCount - 1));
}

/**
 * Where the reading line falls: 45% down the viewport beside the drawing, or
 * just under the drawing's strip where the stylesheet stacks it above the
 * chapters (`--strip` on the figure), so a chapter that lands at the strip's
 * bottom is the one being read. Inlined into the shipped script, so it names
 * nothing from this module.
 */
export function readingLine(
  viewportHeight: number,
  stripBottom: number | null,
): number {
  const beside = 0.45;
  return stripBottom === null ? viewportHeight * beside : stripBottom + 1;
}

export const storyRuntimeScript: string = `(function () {
  ${currentChapter.toString()}
  ${readingLine.toString()}
  function init() {
    var story = document.querySelector(".story");
    if (!story) return;
    var chapters = Array.prototype.slice.call(story.querySelectorAll(".chapter"));
    if (!chapters.length) return;
    var figure = story.querySelector(".figure");
    var stageCount = figure ? Number(figure.dataset.stages || chapters.length) : chapters.length;
    var rail = document.querySelector(".rail");
    var railNodes = [];
    var railRoot, railSpark, railSvg;
    if (rail) {
      railSvg = rail.querySelector(".rail__svg");
      railRoot = rail.querySelector(".rail__root");
      railSpark = rail.querySelector(".rail__spark");
      var list = rail.querySelector(".rail__nodes");
      chapters.forEach(function (chapter, i) {
        if (!chapter.id) chapter.id = "chapter-" + (i + 1);
        var name = chapter.querySelector(".eyebrow") || chapter.querySelector("h2, h1");
        var text = chapter.dataset.title || (name ? name.textContent.trim() : "");
        var li = document.createElement("li");
        li.className = "rail__node";
        li.innerHTML = '<a href="#' + chapter.id + '"><span class="rail__dot"></span><span class="rail__name"></span></a>';
        li.querySelector(".rail__name").textContent = text || "Top";
        list.appendChild(li);
        railNodes.push(li);
      });
    }
    var railLength = railRoot ? railRoot.getTotalLength() : 0;
    function railPoint(t) {
      return railRoot.getPointAtLength(Math.min(1, Math.max(0, t)) * railLength);
    }
    function placeRail() {
      if (!rail) return;
      var box = railSvg.viewBox.baseVal, rect = railSvg.getBoundingClientRect();
      var max = document.documentElement.scrollHeight - innerHeight;
      chapters.forEach(function (chapter, i) {
        var t = max > 0 ? (chapter.getBoundingClientRect().top + scrollY - readingLine(innerHeight, null)) / max : 0;
        var p = railPoint(t);
        railNodes[i].style.left = (p.x / box.width) * rect.width + "px";
        railNodes[i].style.top = (p.y / box.height) * rect.height + "px";
      });
    }
    function stripBottom() {
      if (!figure || !getComputedStyle(figure).getPropertyValue("--strip").trim()) return null;
      return figure.getBoundingClientRect().bottom;
    }
    function read() {
      var line = readingLine(innerHeight, stripBottom());
      var tops = chapters.map(function (chapter) { return chapter.getBoundingClientRect().top; });
      var current = currentChapter(tops, line);
      var stage = currentChapter(tops, line, stageCount);
      if (figure) figure.dataset.stage = String(stage);
      chapters.forEach(function (chapter, i) { chapter.classList.toggle("is-current", i === current); });
      // A chapter that lights the network keeps the live drawing in view while it is read.
      story.classList.toggle("is-asked", !!(chapters[current] && chapters[current].hasAttribute("data-lights-network")));
      if (!rail) return;
      var max = document.documentElement.scrollHeight - innerHeight;
      var progress = max > 0 ? Math.min(1, scrollY / max) : 0;
      rail.style.setProperty("--read", progress.toFixed(4));
      var tip = railPoint(progress);
      railSpark.setAttribute("cx", tip.x);
      railSpark.setAttribute("cy", tip.y);
      railNodes.forEach(function (node, i) {
        node.classList.toggle("is-passed", i < current);
        node.classList.toggle("is-current", i === current);
      });
    }
    placeRail();
    read();
    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", function () { placeRail(); read(); });
    addEventListener("load", function () { placeRail(); read(); });
  }
  // The homepage's drawing listens to the Ask box: an answer's sources name
  // the brains whose published memory they came from (the box's ask:sources
  // event), and those brains light while the rest dim. A source without a
  // brain is this brain's own and lights the center. Pointing works both
  // ways: a listed source lights its brain, a brain flags its listed sources.
  function listen() {
    // The opening draws the network, and a chapter may draw it again beside
    // its own words: every drawing answers the same events.
    var layers = Array.prototype.slice.call(document.querySelectorAll(".net-layer"));
    if (!layers.length) return;
    function all(selector) {
      return layers.reduce(function (found, layer) { return found.concat(Array.prototype.slice.call(layer.querySelectorAll(selector))); }, []);
    }
    var marks = all(".net-mark[data-brain]");
    var threads = all(".net-thread[data-brain]");
    var replies = all(".net-reply[data-brain]");
    var names = all(".net-name[data-brain]");
    var sourceBrain = {};
    function brainOf(source) {
      var brain = source && source.brain;
      if (!brain) return "";
      var host = "";
      if (brain.url) { try { host = new URL(brain.url).host; } catch (e) { host = ""; } }
      var byHost = host && marks.filter(function (m) { return m.getAttribute("data-brain") === host; })[0];
      if (byHost) return host;
      var name = String(brain.name || "").toLowerCase();
      var byName = marks.filter(function (m) {
        var a = m.querySelector("[aria-label]");
        return (a ? a.getAttribute("aria-label") : "").toLowerCase() === name;
      })[0];
      return byName ? byName.getAttribute("data-brain") : "";
    }
    function light(id, on) {
      [marks, threads, replies, names].forEach(function (list) {
        list.forEach(function (el) { if (el.getAttribute("data-brain") === id) el.classList.toggle("is-lit", on); });
      });
    }
    function hot(id, on) {
      marks.concat(threads).forEach(function (el) { if (el.getAttribute("data-brain") === id) el.classList.toggle("is-hot", on); });
    }
    document.addEventListener("ask:sources", function (event) {
      var detail = event.detail || {};
      var sources = Array.isArray(detail.sources) ? detail.sources : [];
      var lit = {};
      var rizom = false;
      sourceBrain = {};
      sources.forEach(function (source) {
        var id = brainOf(source);
        if (id) { lit[id] = true; sourceBrain[source.id] = id; } else rizom = true;
      });
      marks.forEach(function (m) { light(m.getAttribute("data-brain"), !!lit[m.getAttribute("data-brain")]); });
      layers.forEach(function (layer) {
        layer.classList.toggle("has-replies", Object.keys(lit).length > 0);
        layer.classList.toggle("is-rizom", rizom && sources.length > 0);
      });
    });
    function listed(target) {
      var row = target && target.closest ? target.closest("[data-ask-source]") : null;
      return row ? row : null;
    }
    function point(event, on) {
      var row = listed(event.target);
      if (row) { var id = sourceBrain[row.getAttribute("data-ask-source")]; if (id) hot(id, on); return; }
      var mark = event.target && event.target.closest ? event.target.closest(".net-mark[data-brain]") : null;
      if (!mark) return;
      var brain = mark.getAttribute("data-brain");
      hot(brain, on);
      Object.keys(sourceBrain).forEach(function (key) {
        if (sourceBrain[key] !== brain) return;
        Array.prototype.forEach.call(document.querySelectorAll("[data-ask-source]"), function (row) {
          if (row.getAttribute("data-ask-source") !== key) return;
          if (on) row.setAttribute("data-ask-hot", ""); else row.removeAttribute("data-ask-hot");
        });
      });
    }
    // "Asked before": an open question's kept sources light the drawing the
    // way a fresh answer's do; with no question open, the drawing rests.
    function askedSources() {
      var open = document.querySelector("details[data-ask-answer][open]");
      if (!open) return [];
      try { var kept = JSON.parse(open.getAttribute("data-ask-answer") || "[]"); return Array.isArray(kept) ? kept : []; } catch (e) { return []; }
    }
    document.addEventListener("toggle", function (event) {
      var target = event.target;
      if (!target || !target.hasAttribute || !target.hasAttribute("data-ask-answer")) return;
      document.dispatchEvent(new CustomEvent("ask:sources", { detail: { sources: askedSources() } }));
    }, true);
    // The drawing belongs to the page while an answer is open. On desktop a
    // dotted lead runs from each listed source to its brain in the opening's
    // drawing; on a phone the drawing joins the open conversation as the
    // first item of its scroll, and a tap on a lit dot brings its source
    // into view. Only the opening's drawing is lent; a chapter's stays put.
    var home = layers[0];
    var homeMarks = marks.filter(function (m) { return home.contains(m); });
    var leadsLayer = document.querySelector("[data-net-leads]");
    var narrow = typeof matchMedia === "function" ? matchMedia("(max-width: 60rem)") : { matches: false };
    var askHost = document.querySelector("[data-ask-box]");
    var SVG = "http://www.w3.org/2000/svg", GAP = 6, GLYPH = 9;
    function listedRow(scope, key) {
      if (!scope) return null;
      var rows = Array.prototype.filter.call(scope.querySelectorAll("[data-ask-source]"), function (row) {
        return row.getAttribute("data-ask-source") === key;
      });
      return rows.length ? rows[rows.length - 1] : null;
    }
    function drawLeads() {
      if (!leadsLayer) return;
      while (leadsLayer.firstChild) leadsLayer.removeChild(leadsLayer.firstChild);
      if (narrow.matches || !askHost) return;
      // The layer's own box is the frame: coordinates are its, whatever positions it.
      var frame = leadsLayer.getBoundingClientRect();
      leadsLayer.setAttribute("viewBox", "0 0 " + frame.width + " " + frame.height);
      Object.keys(sourceBrain).forEach(function (key) {
        var mark = homeMarks.filter(function (m) { return m.getAttribute("data-brain") === sourceBrain[key]; })[0];
        var row = listedRow(askHost, key);
        if (!mark || !row) return;
        var from = row.getBoundingClientRect();
        if (!from.height) return;
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
        leadsLayer.appendChild(lead);
      });
    }
    var leadsPending = false;
    function scheduleLeads() {
      if (leadsPending || !leadsLayer) return;
      leadsPending = true;
      requestAnimationFrame(function () { leadsPending = false; drawLeads(); });
    }
    if (leadsLayer) {
      addEventListener("resize", scheduleLeads);
      // Scrolling the page or the conversation moves the listed sources.
      document.addEventListener("scroll", scheduleLeads, true);
      document.addEventListener("toggle", scheduleLeads, true);
      if (askHost && typeof ResizeObserver === "function") new ResizeObserver(scheduleLeads).observe(askHost);
    }
    document.addEventListener("ask:sources", function () { drawLeads(); });
    function sheetOpen() { return !!askHost && askHost.hasAttribute("data-ask-sheet"); }
    var slot = null;
    function lend() {
      var dock = askHost.querySelector("[data-ask-dock]");
      if (!home || !dock || home.parentElement === dock) return;
      slot = document.createElement("div");
      slot.className = "net-slot";
      slot.setAttribute("aria-hidden", "true");
      home.parentNode.insertBefore(slot, home);
      dock.appendChild(home);
    }
    function giveBack() {
      if (!slot) return;
      slot.parentNode.insertBefore(home, slot);
      slot.parentNode.removeChild(slot);
      slot = null;
    }
    if (askHost && home && typeof MutationObserver === "function") {
      // The box mounts, and so its dock appears, after the sheet has opened.
      new MutationObserver(function () { if (sheetOpen()) lend(); else giveBack(); })
        .observe(askHost, { attributes: true, attributeFilter: ["data-ask-sheet"], childList: true, subtree: true });
    }
    document.addEventListener("click", function (event) {
      if (!sheetOpen() || !home) return;
      var mark = event.target && event.target.closest ? event.target.closest(".net-mark[data-brain]") : null;
      if (!mark || !home.contains(mark)) return;
      var brain = mark.getAttribute("data-brain");
      var key = Object.keys(sourceBrain).filter(function (k) { return sourceBrain[k] === brain; })[0];
      var area = askHost.querySelector(".brain-box-scroll");
      var row = key ? listedRow(area, key) : null;
      if (!row || !area) return;
      event.preventDefault();
      var at = row.getBoundingClientRect(), box = area.getBoundingClientRect();
      var top = area.scrollTop + at.top - box.top - area.clientHeight / 2 + at.height / 2;
      if (area.scrollTo) area.scrollTo({ top: top, behavior: "smooth" }); else area.scrollTop = top;
      row.removeAttribute("data-ask-flash");
      void row.offsetWidth;
      row.setAttribute("data-ask-flash", "");
      setTimeout(function () { row.removeAttribute("data-ask-flash"); }, 1500);
    }, true);
    document.addEventListener("mouseover", function (e) { point(e, true); });
    document.addEventListener("mouseout", function (e) { point(e, false); });
    document.addEventListener("focusin", function (e) { point(e, true); });
    document.addEventListener("focusout", function (e) { point(e, false); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); listen(); });
  } else {
    init();
    listen();
  }
})();
`;
