import {
  cloudPlace,
  mulberry,
  nearestPairs,
  sceneAt,
  seedLights,
  stageFor,
} from "./model";

/**
 * The field, in the browser: a fixed canvas of lights behind the chapters.
 * The chapter under the middle of the screen (`data-hub-scene` on its
 * section) picks the scene; the scene sets where every light should be, and
 * the lights ease there, so one chapter flows into the next. The current
 * chapter is also named on the root as `data-hub-current`. Colors come from
 * the theme's tokens and are read again when the theme flips. Reduced
 * motion holds the drift still. Where the canvas cannot draw, the chapters
 * stand as text.
 *
 * A scene this script does not know yet draws as the opening.
 */
export const fieldScriptSource: string = `(function () {
  ${mulberry.toString()}
  ${seedLights.toString()}
  ${nearestPairs.toString()}
  ${stageFor.toString()}
  ${sceneAt.toString()}
  ${cloudPlace.toString()}
  var TAU = Math.PI * 2;

  function boot() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-hub-scene]"));
    if (!sections.length) return;
    var root = document.documentElement;
    var active = -1;
    var progress = 0;
    var smooth = 0;

    function read() {
      var boxes = sections.map(function (section) {
        return { top: section.offsetTop, height: section.offsetHeight };
      });
      var at = sceneAt(boxes, scrollY, innerHeight);
      if (at.index !== active) {
        active = at.index;
        smooth = at.t;
        root.setAttribute("data-hub-current", sections[active].getAttribute("data-hub-scene"));
      }
      progress = at.t;
    }
    window.addEventListener("scroll", read, { passive: true });
    read();

    var canvas = document.querySelector(".hub-field");
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;

    var still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var C = {};
    function palette() {
      var cs = getComputedStyle(root);
      function token(name, fallback) {
        var value = cs.getPropertyValue(name).trim();
        return value || fallback;
      }
      C = {
        ink: token("--color-text", "#faf8f3"),
        brass: token("--color-accent", "#d4af37"),
        brassSoft: token("--palette-brass-soft", "#e8cc6a"),
        ruby: token("--palette-ruby", "#d0453a"),
        moss: token("--palette-moss", "#9caf88"),
        dark: root.getAttribute("data-theme") !== "light",
      };
    }
    palette();
    if (window.MutationObserver) {
      new MutationObserver(palette).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    }

    var W = 0, H = 0;
    function resize() {
      var dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth;
      H = innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", function () { resize(); read(); });

    var lights = seedLights(112, 11).map(function (light) {
      return { light: light, x: 0, y: 0, r: 0, a: 0, col: "ink", tx: 0, ty: 0, tr: 0, ta: 0 };
    });
    var pairs = nearestPairs(lights.map(function (entry) { return entry.light; }), 2);

    function set(entry, x, y, r, a, col) {
      entry.tx = x; entry.ty = y; entry.tr = r; entry.ta = a; entry.col = col;
    }
    function baseColor(light) { return light.warm ? "brass" : "ink"; }

    function dot(x, y, r, a, col) {
      if (a < 0.01 || r < 0.05) return;
      var alpha = C.dark ? a : Math.min(1, a * 1.4);
      ctx.fillStyle = C[col] || C.ink;
      ctx.globalAlpha = alpha * (C.dark ? 0.16 : 0.1);
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    function thread(x1, y1, x2, y2, col, a, width, bend) {
      if (a < 0.01) return;
      ctx.strokeStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      if (bend) {
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, x2, y2);
      } else ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function caption(x, y, text, a, col, align) {
      if (a < 0.02 || !text) return;
      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.4px";
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.fillText(text.toUpperCase(), x, y);
      ctx.globalAlpha = 1;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }

    var scenes = {
      // The region: a field of lights, threaded to their neighbors.
      opening: {
        target: function (stage, t, now) {
          lights.forEach(function (entry) {
            var place = cloudPlace(entry.light, stage, now, 1, still);
            var light = entry.light;
            set(entry, place[0], place[1], light.size, light.warm ? 0.9 : 0.35 + 0.5 * (1 - light.rad), baseColor(light));
          });
        },
        draw: function (stage, t, now, fade, section) {
          pairs.forEach(function (pair) {
            var p = lights[pair[0]], q = lights[pair[1]];
            if (Math.hypot(p.x - q.x, p.y - q.y) < stage.R * 0.32) {
              thread(p.x, p.y, q.x, q.y, "brass", 0.13 * fade * Math.min(p.a, q.a), 0.8, 0.12);
            }
          });
          if (!stage.phone) caption(stage.cx, stage.y1 - 16, section.getAttribute("data-hub-caption"), 0.4 * fade, "ink");
        },
      },
    };

    var last = 0, first = true;
    function frame(now) {
      var dt = Math.min(64, last ? now - last : 16.7);
      last = now;
      smooth += (progress - smooth) * (1 - Math.pow(0.86, dt / 16.7));
      var section = sections[active];
      var scene = scenes[section.getAttribute("data-hub-scene")] || scenes.opening;
      var stage = stageFor(W, H, null);
      scene.target(stage, smooth, now);
      var ease = first ? 1 : 1 - Math.pow(0.92, dt / 16.7);
      first = false;
      lights.forEach(function (entry) {
        entry.x += (entry.tx - entry.x) * ease;
        entry.y += (entry.ty - entry.y) * ease;
        entry.r += (entry.tr - entry.r) * ease;
        entry.a += (entry.ta - entry.a) * ease;
      });
      var lastScene = active === sections.length - 1;
      var fade = lastScene ? Math.min(1, smooth / 0.06) : Math.min(1, smooth / 0.05, (1 - smooth) / 0.05);
      if (active === 0) fade = Math.min(1, (1 - smooth) / 0.05);
      ctx.clearRect(0, 0, W, H);
      scene.draw(stage, smooth, now, fade, section);
      lights.forEach(function (entry) { dot(entry.x, entry.y, entry.r, entry.a, entry.col); });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();`;

/** The field script as the page's head carries it. */
export const fieldScript: string = `<script>${fieldScriptSource}</script>`;
