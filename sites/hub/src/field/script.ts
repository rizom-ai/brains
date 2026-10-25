import {
  bendPoint,
  cloudPlace,
  cohortPhase,
  departure,
  ease,
  memoryLevel,
  mulberry,
  nearestPairs,
  onRecord,
  sceneAt,
  seedLights,
  segment,
  sparkY,
  stageFor,
} from "./model";

/**
 * The field, in the browser: a fixed canvas of lights behind the chapters.
 * The chapter under the middle of the screen (`data-hub-scene` on its
 * section) picks the scene; the scene sets where every light, the hub, the
 * center and the connector should be, and they ease there, so one chapter
 * flows into the next. The current chapter is named on the root as
 * `data-hub-current` and lit on the rail. Colors come from the theme's
 * tokens and are read again when the theme flips; reduced motion holds the
 * drift still.
 *
 * The rail, the docked cards on a phone, the readouts and the controls run
 * from scroll and clicks alone, so they work where the canvas cannot draw.
 * A scene this script does not know yet draws as the opening.
 */
export const fieldScriptSource: string = `(function () {
  ${mulberry.toString()}
  ${seedLights.toString()}
  ${nearestPairs.toString()}
  ${stageFor.toString()}
  ${sceneAt.toString()}
  ${cloudPlace.toString()}
  ${ease.toString()}
  ${segment.toString()}
  ${departure.toString()}
  ${cohortPhase.toString()}
  ${memoryLevel.toString()}
  ${onRecord.toString()}
  ${sparkY.toString()}
  ${bendPoint.toString()}
  var TAU = Math.PI * 2;
  var COUNT = 112;
  function pad(value) { return (value < 10 ? "0" : "") + value; }
  function fill(template, cohort) { return String(template || "").replace("{cohort}", pad(cohort)); }

  function boot() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-hub-scene]"));
    if (!sections.length) return;
    var root = document.documentElement;
    var still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var active = -1;
    var progress = 0;
    var smooth = 0;
    var connectorGone = false;
    var memoryOn = true;

    var lights = seedLights(COUNT, 11).map(function (light) {
      return { light: light, x: 0, y: 0, r: 0, a: 0, col: "ink", tx: 0, ty: 0, tr: 0, ta: 0, snap: false };
    });
    var shuffle = mulberry(29);
    var order = lights.map(function (_, i) { return [shuffle(), i]; })
      .sort(function (a, b) { return a[0] - b[0]; })
      .map(function (pair) { return pair[1]; });
    function member(cohort, j, size, offset) { return lights[order[offset + cohort * size + j]]; }

    var captions = sections.map(function (section) {
      try { return JSON.parse(section.getAttribute("data-hub-captions") || "{}"); } catch (error) { return {}; }
    });
    function find(selector) { return document.querySelector(selector); }
    function setText(el, value) { var text = String(value); if (el && el.textContent !== text) el.textContent = text; }
    function sceneName(index) { return sections[index] ? sections[index].getAttribute("data-hub-scene") : ""; }

    // The rail: one button per chapter, the current one lit.
    var rail = find(".hub-rail");
    var railButtons = sections.map(function (section) {
      if (!rail) return null;
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = section.getAttribute("data-hub-label") || "";
      button.addEventListener("click", function () {
        if (section.scrollIntoView) section.scrollIntoView({ behavior: still ? "auto" : "smooth" });
      });
      item.appendChild(button);
      rail.appendChild(item);
      return button;
    });

    // On a phone each chapter's card docks to the bottom of the screen and
    // the drawing ends above it.
    function placeCards() {
      Array.prototype.forEach.call(document.querySelectorAll(".hub-ch:not(.hub-ch--open) .hub-card"), function (card) {
        if (innerWidth < 860) {
          var top = Math.max(64, innerHeight - card.offsetHeight - 14);
          card.setAttribute("data-top", String(top));
          card.style.setProperty("--card-top", top + "px");
        } else {
          card.removeAttribute("data-top");
          card.style.removeProperty("--card-top");
        }
      });
    }
    function cardTop() {
      var card = sections[active] ? sections[active].querySelector(".hub-card[data-top]") : null;
      return card ? Number(card.getAttribute("data-top")) : null;
    }

    // The readouts follow the reader's place in the chapter and the controls.
    function readouts() {
      var scene = sceneName(active);
      if (scene === "pipeline") {
        var left = lights.filter(function (entry) { return departure(entry.light.rank, COUNT, progress) >= 1; }).length;
        setText(find("[data-hub-left]"), left);
      }
      if (scene === "programs") {
        var phase = cohortPhase(progress, 3);
        var cohortText = find("[data-hub-cohort-text]");
        setText(find("[data-hub-cohort]"), pad(phase.c + 1));
        if (cohortText) setText(cohortText, cohortText.getAttribute(connectorGone ? "data-without" : "data-with"));
      }
      if (scene === "memory") {
        var held = cohortPhase(progress, 4);
        var recordText = find("[data-hub-record-text]");
        setText(find("[data-hub-record]"), onRecord(held.c, memoryOn));
        if (recordText) setText(recordText, fill(recordText.getAttribute(memoryOn ? "data-with" : "data-without"), held.c + 1));
        var dot = find("[data-hub-spark-dot]");
        if (dot) {
          dot.setAttribute("cx", (8 + progress * 284).toFixed(1));
          dot.setAttribute("cy", sparkY(memoryLevel(progress, memoryOn)).toFixed(1));
        }
      }
    }

    function read() {
      var boxes = sections.map(function (section) {
        return { top: section.offsetTop, height: section.offsetHeight };
      });
      var at = sceneAt(boxes, scrollY, innerHeight);
      if (at.index !== active) {
        active = at.index;
        smooth = at.t;
        root.setAttribute("data-hub-current", sceneName(active));
        railButtons.forEach(function (button, i) {
          if (button) button.classList.toggle("is-current", i === active);
        });
      }
      progress = at.t;
      readouts();
    }

    var connector = find("[data-hub-connector]");
    if (connector) connector.addEventListener("click", function () {
      connectorGone = !connectorGone;
      setText(connector, connector.getAttribute(connectorGone ? "data-return" : "data-leave"));
      var body = find("[data-hub-connector-body]");
      if (body) setText(body, body.getAttribute(connectorGone ? "data-without" : "data-with"));
      readouts();
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-hub-memory]"), function (button) {
      button.addEventListener("click", function () {
        memoryOn = button.getAttribute("data-hub-memory") === "on";
        Array.prototype.forEach.call(document.querySelectorAll("[data-hub-memory]"), function (other) {
          other.setAttribute("aria-pressed", String(other === button));
        });
        var spark = find(".hub-spark");
        if (spark) spark.classList.toggle("is-off", !memoryOn);
        readouts();
      });
    });

    placeCards();
    read();
    window.addEventListener("scroll", read, { passive: true });

    var canvas = find(".hub-field");
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    window.addEventListener("resize", function () {
      placeCards();
      if (ctx) resize();
      read();
    });
    if (!ctx) return;

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

    var pairs = nearestPairs(lights.map(function (entry) { return entry.light; }), 2);
    // The bodies that carry over between chapters.
    var hub = { x: 0, y: 0, r: 0, a: 0, lit: 0 };
    var center = { x: 0, y: 0, r: 0, a: 0 };
    var conn = { a: 0 };
    var hubT, centerT, connT;

    function set(entry, x, y, r, a, col) {
      entry.tx = x; entry.ty = y; entry.tr = r; entry.ta = a; entry.col = col;
    }
    function baseColor(light) { return light.warm ? "brass" : "ink"; }
    function baseAlpha(light) { return light.warm ? 0.9 : 0.35 + 0.5 * (1 - light.rad); }
    function captionOf(key) { return (captions[active] || {})[key] || ""; }

    function dot(x, y, r, a, col) {
      if (a < 0.01 || r < 0.05) return;
      var alpha = C.dark ? a : Math.min(1, a * 1.4);
      ctx.fillStyle = C[col] || C.ink;
      ctx.globalAlpha = alpha * (C.dark ? 0.16 : 0.08);
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    function glow(x, y, r, a, col) {
      if (a < 0.01 || r < 0.5) return;
      ctx.fillStyle = C[col] || C.ink;
      // Rings of light that grow fainter outward, like the mockup's radial fade.
      [[1, 0.025], [0.7, 0.04], [0.45, 0.07], [0.28, 0.12], [0.16, 0.2]].forEach(function (step) {
        ctx.globalAlpha = Math.min(1, a * step[1] * (C.dark ? 1 : 0.7));
        ctx.beginPath(); ctx.arc(x, y, r * step[0], 0, TAU); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    function thread(x1, y1, x2, y2, col, a, width, bend, dash) {
      if (a < 0.01) return;
      ctx.strokeStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x1, y1);
      if (bend) {
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, x2, y2);
      } else ctx.lineTo(x2, y2);
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    function ring(x, y, r, col, a, width, wobble, seed) {
      if (a < 0.01 || r < 0.5) return;
      ctx.strokeStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.lineWidth = width;
      ctx.beginPath();
      Array.from({ length: 73 }, function (_, k) { return (k / 72) * TAU; }).forEach(function (t, k) {
        var rr = r * (1 + (wobble || 0) * Math.sin(3 * t + (seed || 0)) + (wobble || 0) * 0.6 * Math.sin(5 * t + (seed || 0) * 1.7));
        var px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function lantern(x, y, r, a, lit) {
      if (a < 0.01 || r < 0.5) return;
      if (lit > 0.01) {
        glow(x, y, r * 3, lit * a * 1.4, "brass");
        ctx.fillStyle = C.brass;
        ctx.globalAlpha = 0.9 * lit * a;
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ring(x, y, r, "brass", a, 1.4, 0, 0);
    }
    function caption(x, y, text, a, col, align) {
      if (a < 0.02 || !text) return;
      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.4px";
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.fillText(String(text).toUpperCase(), x, y);
      ctx.globalAlpha = 1;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    function region(stage, now, scale, alpha) {
      lights.forEach(function (entry) {
        var place = cloudPlace(entry.light, stage, now, scale, still);
        set(entry, place[0], place[1], entry.light.size * (scale > 1 ? 0.9 : 1), alpha === undefined ? baseAlpha(entry.light) : alpha, baseColor(entry.light));
      });
    }

    var scenes = {
      // The region: a field of lights, threaded to their neighbors.
      opening: {
        target: function (stage, t, now) { region(stage, now, 1); },
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

      // 01: the brightest lights drain into the center, half the region gone.
      pipeline: {
        target: function (stage, t, now) {
          centerT = {
            x: stage.x1 - stage.R * (stage.phone ? 0.3 : 0.12),
            y: stage.y0 + stage.R * (stage.phone ? 0.3 : 0.16),
            r: stage.R * (0.12 + 0.08 * segment(t, 0.05, 0.9)),
            a: segment(t, 0, 0.12),
          };
          var dim = 1 - 0.4 * segment(t, 0.2, 0.9);
          lights.forEach(function (entry) {
            var light = entry.light;
            var base = cloudPlace(light, stage, now, 1, still);
            var k = departure(light.rank, COUNT, t);
            var place = bendPoint(base[0], base[1], center.x, center.y, 0.22, ease(k));
            entry.k = k; entry.bx = base[0]; entry.by = base[1];
            entry.snap = k > 0;
            set(entry, place[0], place[1], light.size * (1 - 0.6 * k), baseAlpha(light) * (1 - k * k * k) * (k > 0 ? 1 : dim), baseColor(light));
          });
        },
        draw: function (stage, t, now, fade) {
          lights.forEach(function (entry) {
            if (entry.k > 0 && entry.k < 1) {
              thread(entry.bx, entry.by, center.x, center.y, baseColor(entry.light), 0.22 * fade * Math.sin(Math.PI * entry.k), 0.8, 0.22, [2, 4]);
            }
          });
          caption(center.x - center.r - 14, center.y + center.r + 14, captionOf("center"), 0.55 * fade * center.a, "ink", "end");
        },
      },

      // 02: cohorts gather around one connector and scatter; the connector can leave.
      programs: {
        target: function (stage, t, now) {
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.1, a: connectorGone ? 0.4 : 1, lit: 0 };
          connT = { a: connectorGone ? 0 : 1 };
          var phase = cohortPhase(t, 3);
          this.phase = phase;
          region(stage, now, 1.3, 0.24);
          Array.from({ length: 12 }, function (_, j) {
            var entry = member(phase.c, j, 12, 0);
            var out = cloudPlace(entry.light, stage, now, 1.3, still);
            var angle = (j / 12) * TAU + phase.c * 0.5;
            var rr = stage.R * (0.36 + 0.05 * Math.sin(j * 1.7));
            var k = connectorGone ? 0 : phase.arrive * (1 - phase.leave);
            var x = out[0] + (stage.cx + Math.cos(angle) * rr - out[0]) * k;
            var y = out[1] + (stage.cy + Math.sin(angle) * rr * 0.86 - out[1]) * k;
            set(entry, x, y, entry.light.size, connectorGone ? 0.24 : 0.24 + 0.71 * (1 - phase.leave), baseColor(entry.light));
          });
        },
        draw: function (stage, t, now, fade) {
          var phase = this.phase;
          var cx = hub.x + stage.R * 0.03, cy = hub.y - stage.R * 0.02;
          if (conn.a > 0.02) {
            Array.from({ length: 12 }, function (_, j) {
              var p = member(phase.c, j, 12, 0);
              var a = segment(phase.u, 0.28 + j * 0.022, 0.34 + j * 0.022) * (1 - phase.leave) * conn.a;
              thread(cx, cy, p.x, p.y, "brass", 0.5 * a * fade, 1, 0.08);
              if (j % 2 === 0) {
                var q = member(phase.c, (j + 3) % 12, 12, 0);
                var b = segment(phase.u, 0.46 + j * 0.015, 0.52 + j * 0.015) * (1 - phase.leave) * conn.a;
                thread(p.x, p.y, q.x, q.y, "ink", 0.22 * b * fade, 0.8, 0.3);
              }
            });
            dot(cx, cy, 3.4, conn.a * fade, "ink");
            caption(cx + 14, cy - 18, captionOf("connector"), 0.6 * conn.a * fade, "ink", "start");
          }
          caption(hub.x, hub.y + hub.r + 18, captionOf("hub"), 0.5 * fade * hub.a, "brass");
          caption(stage.cx, stage.y0 + 20, fill(captionOf(phase.u < 0.74 ? "inProgram" : "programEnds"), phase.c + 1), 0.5 * fade, "ink");
        },
      },

      // 03: the same cohorts, but the hub's Brain keeps what each leaves.
      memory: {
        target: function (stage, t, now) {
          var phase = cohortPhase(t, 4);
          this.phase = phase;
          var reach = phase.c + phase.u;
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * (0.08 + (memoryOn ? 0.012 * reach : 0)), a: 1, lit: memoryOn ? 0.35 + 0.65 * (reach / 4) : 0 };
          region(stage, now, 1.3, 0.22);
          Array.from({ length: 4 }, function (_, cohort) {
            Array.from({ length: 10 }, function (_, j) {
              var entry = member(cohort, j, 10, 40);
              var out = cloudPlace(entry.light, stage, now, 1.3, still);
              if (cohort < phase.c && memoryOn) set(entry, out[0], out[1], entry.light.size, 0.7, "brass");
              if (cohort !== phase.c) return;
              var angle = (j / 10) * TAU + phase.c * 0.6;
              var rr = stage.R * (0.34 + 0.05 * Math.sin(j * 2.1));
              var k = phase.arrive * (1 - phase.leave);
              var x = out[0] + (stage.cx + Math.cos(angle) * rr - out[0]) * k;
              var y = out[1] + (stage.cy + Math.sin(angle) * rr * 0.86 - out[1]) * k;
              var settled = memoryOn ? 0.7 : 0.22;
              set(entry, x, y, entry.light.size, settled + (0.95 - settled) * (1 - phase.leave), memoryOn && phase.leave > 0.5 ? "brass" : baseColor(entry.light));
            });
          });
        },
        draw: function (stage, t, now, fade) {
          var phase = this.phase;
          if (memoryOn) {
            // The hub's memory, drawn as contours that thicken with every cohort.
            var rings = 1 + Math.floor((phase.c + phase.u) * 2);
            Array.from({ length: rings }, function (_, k) {
              ring(hub.x, hub.y, stage.R * (0.16 + k * 0.05), "brass", (0.26 - k * 0.022) * fade, 0.9, 0.06 + k * 0.012, k * 1.3);
            });
            Array.from({ length: phase.c }, function (_, cohort) {
              Array.from({ length: 10 }, function (_, j) {
                var p = member(cohort, j, 10, 40);
                thread(hub.x, hub.y, p.x, p.y, "brass", 0.16 * fade, 0.7, 0.06);
              });
            });
          }
          Array.from({ length: 10 }, function (_, j) {
            var p = member(phase.c, j, 10, 40);
            var a = segment(phase.u, 0.28 + j * 0.025, 0.34 + j * 0.025) * (1 - phase.leave);
            thread(hub.x, hub.y, p.x, p.y, "brass", 0.5 * a * fade, 1, 0.08);
            if (memoryOn && phase.c > 0) {
              var q = member(phase.c - 1, j, 10, 40);
              thread(p.x, p.y, q.x, q.y, "brassSoft", 0.3 * a * phase.arrive * fade, 0.8, 0.2);
            }
          });
          caption(hub.x, hub.y + hub.r + 18, captionOf(memoryOn ? "brain" : "hub"), 0.55 * fade, "brass");
          caption(stage.cx, stage.y0 + 20, fill(captionOf("cohort"), phase.c + 1), 0.5 * fade, "ink");
        },
      },
    };

    var last = 0, first = true;
    function frame(now) {
      var dt = Math.min(64, last ? now - last : 16.7);
      last = now;
      smooth += (progress - smooth) * (1 - Math.pow(0.86, dt / 16.7));
      var section = sections[active];
      var scene = scenes[sceneName(active)] || scenes.opening;
      var stage = stageFor(W, H, cardTop());
      hubT = { x: stage.cx, y: stage.cy, r: 0, a: 0, lit: 0 };
      centerT = { x: center.x || stage.x1, y: center.y || stage.y0, r: center.r, a: 0 };
      connT = { a: 0 };
      lights.forEach(function (entry) { entry.snap = false; });
      scene.target(stage, smooth, now);
      var k = first ? 1 : 1 - Math.pow(0.92, dt / 16.7);
      lights.forEach(function (entry) {
        if (entry.snap) { entry.x = entry.tx; entry.y = entry.ty; }
        else { entry.x += (entry.tx - entry.x) * k; entry.y += (entry.ty - entry.y) * k; }
        entry.r += (entry.tr - entry.r) * k;
        entry.a += (entry.ta - entry.a) * k;
      });
      [[hub, hubT], [center, centerT], [conn, connT]].forEach(function (pair) {
        Object.keys(pair[1]).forEach(function (key) { pair[0][key] += (pair[1][key] - pair[0][key]) * k; });
      });
      first = false;
      var fade = active === 0 ? Math.min(1, (1 - smooth) / 0.05)
        : active === sections.length - 1 ? Math.min(1, smooth / 0.06)
        : Math.min(1, smooth / 0.05, (1 - smooth) / 0.05);
      ctx.clearRect(0, 0, W, H);
      if (center.a > 0.01) {
        glow(center.x, center.y, center.r * 3, center.a * 1.6, "ink");
        Array.from({ length: 4 }, function (_, j) {
          ring(center.x, center.y, center.r * (1 + j * 0.45), "ink", 0.22 * center.a * (1 - j * 0.2), 0.8, 0, 0);
        });
      }
      scene.draw(stage, smooth, now, fade, section);
      lights.forEach(function (entry) { dot(entry.x, entry.y, entry.r, entry.a, entry.col); });
      lantern(hub.x, hub.y, hub.r, hub.a, hub.lit);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();`;

/** The field script as the page's head carries it. */
export const fieldScript: string = `<script>${fieldScriptSource}</script>`;
