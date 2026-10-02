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
    var layer = document.querySelector(".net-layer");
    if (!layer) return;
    var marks = Array.prototype.slice.call(layer.querySelectorAll(".net-mark[data-brain]"));
    var threads = Array.prototype.slice.call(layer.querySelectorAll(".net-thread[data-brain]"));
    var replies = Array.prototype.slice.call(layer.querySelectorAll(".net-reply[data-brain]"));
    var names = Array.prototype.slice.call(layer.querySelectorAll(".net-name[data-brain]"));
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
      layer.classList.toggle("has-replies", Object.keys(lit).length > 0);
      layer.classList.toggle("is-rizom", rizom && sources.length > 0);
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
