/**
 * Docs home script, served at /scripts/docs-home.js and loaded on every page;
 * it does nothing where the home's brain is not drawn. The page reads fully
 * without it; it adds:
 *   1. The filaments from what you bring, through the brain, to where it
 *      shows up, drawn when the three columns sit side by side.
 *   2. Routes: pointing at, focusing or clicking a node lights its route in
 *      brass and shows its caption; clicking keeps it. The draft's route
 *      shows first.
 * With reduced motion the filaments appear at once.
 */
(function () {
  var SVG = "http://www.w3.org/2000/svg";

  // [from, to, kind]: "root" for intake and destinations, "" for the fine
  // filaments that bind files to the brain.
  var EDGES = [
    ["in-draft", "f-note", "root"],
    ["in-pdf", "f-paper", "root"],
    ["in-link", "f-link", "root"],
    ["in-photo", "f-image", "root"],
    ["f-note", "core", ""],
    ["f-paper", "core", ""],
    ["f-link", "core", ""],
    ["f-image", "core", ""],
    ["core", "f-post", ""],
    ["f-post", "out-site", "root"],
    ["core", "out-chat", "root"],
    ["core", "out-ai", "root"],
    ["core", "out-brains", "root"],
  ];

  var INTAKE = [
    "in-draft>f-note",
    "in-pdf>f-paper",
    "in-link>f-link",
    "in-photo>f-image",
    "f-note>core",
    "f-paper>core",
    "f-link>core",
    "f-image>core",
  ];

  var ROUTES = {
    draft: [
      "in-draft>f-note",
      "f-note>core",
      "core>out-chat",
      "core>f-post",
      "f-post>out-site",
    ],
    pdf: ["in-pdf>f-paper", "f-paper>core", "core>out-chat", "core>out-ai"],
    link: ["in-link>f-link", "f-link>core", "core>out-chat", "core>out-ai"],
    photo: [
      "in-photo>f-image",
      "f-image>core",
      "core>f-post",
      "f-post>out-site",
    ],
    chat: INTAKE.concat(["core>out-chat"]),
    ai: INTAKE.concat(["core>out-ai"]),
    brains: INTAKE.concat(["core>out-brains"]),
    site: [
      "in-draft>f-note",
      "f-note>core",
      "in-photo>f-image",
      "f-image>core",
      "core>f-post",
      "f-post>out-site",
    ],
  };

  function init() {
    var brain = document.getElementById("docs-home-brain");
    if (!brain) return;

    var svg = brain.querySelector("svg");
    var caption = brain.querySelector(".dh-caption");
    var storyLine = brain.querySelector(".dh-caption__story");
    var items = Array.prototype.slice.call(
      brain.querySelectorAll("[data-story]"),
    );
    var wide = window.matchMedia("(min-width: 1000px)");
    var still = window.matchMedia("(prefers-reduced-motion: reduce)");
    var captions = {};
    try {
      captions = JSON.parse(caption.getAttribute("data-captions") || "{}");
    } catch (_error) {
      // Without captions the routes still light; the first caption stays.
      captions = {};
    }

    var pinned = "draft";
    var shown = "draft";
    var grown = false;

    function centre(name, box) {
      var node = brain.querySelector('[data-node="' + name + '"]');
      var r = node.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    }

    function filament(a, b) {
      var from = a[0] <= b[0] ? a : b;
      var to = a[0] <= b[0] ? b : a;
      var bend = Math.max(Math.abs(to[0] - from[0]) * 0.45, 40);
      return (
        "M" +
        from[0] +
        "," +
        from[1] +
        " C" +
        (from[0] + bend) +
        "," +
        from[1] +
        " " +
        (to[0] - bend) +
        "," +
        to[1] +
        " " +
        to[0] +
        "," +
        to[1]
      );
    }

    function show(name) {
      shown = name;
      var route = ROUTES[name] || [];
      var nodes = { core: true };
      route.forEach(function (key) {
        key.split(">").forEach(function (node) {
          nodes[node] = true;
        });
      });

      Array.prototype.slice
        .call(svg.querySelectorAll("path"))
        .forEach(function (path) {
          var lit = route.indexOf(path.getAttribute("data-edge")) !== -1;
          path.classList.toggle("lit", lit);
          // Lit filaments on top of the rest.
          if (lit) svg.appendChild(path);
        });
      items.forEach(function (item) {
        var node = item.querySelector("[data-node]").getAttribute("data-node");
        item.classList.toggle("lit", nodes[node] === true);
        item.setAttribute(
          "aria-pressed",
          String(item.getAttribute("data-story") === pinned),
        );
      });
      if (captions[name]) storyLine.textContent = captions[name];
    }

    function grow() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (wide.matches) {
        var box = brain.getBoundingClientRect();
        EDGES.forEach(function (edge, index) {
          var path = document.createElementNS(SVG, "path");
          path.setAttribute(
            "d",
            filament(centre(edge[0], box), centre(edge[1], box)),
          );
          path.setAttribute("data-edge", edge[0] + ">" + edge[1]);
          if (edge[2]) path.classList.add(edge[2]);
          svg.appendChild(path);

          // The one moment of motion: filaments draw in on first load.
          if (!grown && !still.matches) {
            var length = path.getTotalLength();
            path.style.strokeDasharray = String(length);
            path.style.strokeDashoffset = String(length);
            path.getBoundingClientRect();
            path.style.transition =
              "stroke-dashoffset 1.1s cubic-bezier(0.3, 0.6, 0.2, 1) " +
              index * 70 +
              "ms";
            path.style.strokeDashoffset = "0";
            setTimeout(
              function () {
                path.style.transition = "";
                path.style.strokeDasharray = "";
                path.style.strokeDashoffset = "";
              },
              1200 + index * 70,
            );
          }
        });
      }
      grown = true;
      show(shown);
    }

    items.forEach(function (item) {
      var name = item.getAttribute("data-story");
      function pin() {
        pinned = name;
        show(name);
      }
      item.addEventListener("mouseenter", function () {
        show(name);
      });
      item.addEventListener("focus", function () {
        show(name);
      });
      item.addEventListener("mouseleave", function () {
        show(pinned);
      });
      item.addEventListener("blur", function () {
        show(pinned);
      });
      item.addEventListener("click", pin);
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pin();
        }
      });
    });

    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        if (grown) grow();
      }).observe(brain);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(grow);
    } else {
      grow();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
