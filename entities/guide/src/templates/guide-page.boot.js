/**
 * Guide page script, served at /scripts/guide-page.js on routes that render
 * the guide-detail template. The page reads fully without it; it adds:
 *   1. The opening: scattered material settles into one light on scroll
 *      (sets --progress and --settle on the opening; the CSS does the rest).
 *   2. The material map's curves from each source to the type it becomes,
 *      and the hover highlight that joins them.
 *   3. The stage rail lighting up as each stage is reached.
 *   4. Reveals as blocks enter the viewport.
 * With reduced motion the opening stays still and nothing reveals.
 */
(function () {
  var SVG = "http://www.w3.org/2000/svg";

  function init() {
    var page = document.querySelector("[data-guide-page]");
    if (!page) return;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    page.classList.add("is-enhanced");
    if (!reduced) page.classList.add("is-animated");

    var opening = page.querySelector("[data-guide-opening]");
    function renderOpening() {
      if (!opening || reduced) return;
      var span = opening.offsetHeight - window.innerHeight;
      var top = -opening.getBoundingClientRect().top;
      var raw = span > 0 ? Math.min(Math.max(top / span, 0), 1) : 0;
      var settle = 1 - Math.pow(1 - raw, 3);
      opening.style.setProperty("--progress", raw.toFixed(4));
      opening.style.setProperty("--settle", settle.toFixed(4));
    }

    var map = page.querySelector("[data-guide-map]");
    var svg = map ? map.querySelector("[data-guide-lines]") : null;
    var sources = map
      ? Array.prototype.slice.call(map.querySelectorAll("[data-guide-source]"))
      : [];
    var paths = [];
    function typeFor(source) {
      return map.querySelector(
        '[data-guide-type="' + source.getAttribute("data-guide-source") + '"]',
      );
    }
    // Offsets ignore transforms, so reveals and hovers never bend the curves.
    function drawLines() {
      if (!svg || window.getComputedStyle(svg).display === "none") return;
      svg.textContent = "";
      paths = sources.map(function (source) {
        var type = typeFor(source);
        var path = document.createElementNS(SVG, "path");
        if (!type) return path;
        var x1 = source.offsetLeft + source.offsetWidth;
        var y1 = source.offsetTop + source.offsetHeight / 2;
        var x2 = type.offsetLeft;
        var y2 = type.offsetTop + type.offsetHeight / 2;
        var mid = (x1 + x2) / 2;
        var curve = [mid, y1, mid, y2, x2, y2].join(" ");
        path.setAttribute("d", "M" + x1 + " " + y1 + " C" + curve);
        svg.appendChild(path);
        return path;
      });
    }
    sources.forEach(function (source, index) {
      function hot(on) {
        var type = typeFor(source);
        source.classList.toggle("is-hot", on);
        if (type) type.classList.toggle("is-hot", on);
        if (paths[index]) paths[index].classList.toggle("is-hot", on);
      }
      source.addEventListener("mouseenter", function () {
        hot(true);
      });
      source.addEventListener("mouseleave", function () {
        hot(false);
      });
    });

    var rail = page.querySelector("[data-guide-rail]");
    var railItems = rail
      ? Array.prototype.slice.call(rail.querySelectorAll("[data-guide-for]"))
      : [];
    var railFill = rail ? rail.querySelector("[data-guide-rail-fill]") : null;
    function renderRail() {
      if (!rail) return;
      var line = window.innerHeight * 0.45;
      var lit = railItems.filter(function (item) {
        var stage = document.getElementById(
          item.getAttribute("data-guide-for"),
        );
        return stage ? stage.getBoundingClientRect().top < line : false;
      });
      railItems.forEach(function (item) {
        item.classList.toggle("is-lit", lit.indexOf(item) >= 0);
      });
      var last = lit[lit.length - 1];
      if (railFill) {
        railFill.style.height = last ? last.offsetTop + 14 + "px" : "0px";
      }
    }

    var reveals = Array.prototype.slice.call(
      page.querySelectorAll(".guide-reveal"),
    );
    if (reduced || !("IntersectionObserver" in window)) {
      reveals.forEach(function (el) {
        el.classList.add("is-on");
      });
    } else {
      var observer = new IntersectionObserver(
        function (entries) {
          entries
            .filter(function (entry) {
              return entry.isIntersecting;
            })
            .forEach(function (entry) {
              entry.target.classList.add("is-on");
              observer.unobserve(entry.target);
            });
        },
        { rootMargin: "0px 0px -12% 0px" },
      );
      reveals.forEach(function (el) {
        observer.observe(el);
      });
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        renderOpening();
        renderRail();
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      drawLines();
      onScroll();
    });
    if (map && "ResizeObserver" in window) {
      new ResizeObserver(drawLines).observe(map);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(drawLines);
    }
    renderOpening();
    renderRail();
    drawLines();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
