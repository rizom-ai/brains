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

const READING_LINE = 0.45;

/**
 * Where the reading line falls: 45% down the viewport beside the drawing, or
 * just under the drawing's strip where the stylesheet stacks it above the
 * chapters (`--strip` on the figure), so a chapter that lands at the strip's
 * bottom is the one being read.
 */
export function readingLine(
  viewportHeight: number,
  stripBottom: number | null,
): number {
  return stripBottom === null ? viewportHeight * READING_LINE : stripBottom + 1;
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
        var t = max > 0 ? (chapter.getBoundingClientRect().top + scrollY - innerHeight * ${READING_LINE}) / max : 0;
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
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;
