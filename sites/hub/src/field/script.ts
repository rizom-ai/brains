import {
  bendPoint,
  certified,
  cloudPlace,
  cohortPhase,
  decisionsBy,
  departure,
  ease,
  guestsPresent,
  holderInFocus,
  hubField,
  hubsLit,
  intakeLegs,
  labHome,
  labPhase,
  labWeek,
  linkNearest,
  memoryLevel,
  mulberry,
  nearestPairs,
  onRecord,
  passage,
  plantAt,
  sceneAt,
  seedLights,
  segment,
  sparkY,
  splitFlow,
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
  ${linkNearest.toString()}
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
  ${labWeek.toString()}
  ${labHome.toString()}
  ${labPhase.toString()}
  ${decisionsBy.toString()}
  ${guestsPresent.toString()}
  ${holderInFocus.toString()}
  ${splitFlow.toString()}
  ${certified.toString()}
  ${hubField.toString()}
  ${hubsLit.toString()}
  ${plantAt.toString()}
  ${passage.toString()}
  ${intakeLegs.toString()}
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
    // A holder the mouse is over previews it; a click pins it until clicked again.
    var hoveredHolder = null;
    var pinnedHolder = null;
    function chosenHolder() { return hoveredHolder || pinnedHolder; }
    var planted = [];
    var sites = hubField(5);

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
      Array.prototype.forEach.call(document.querySelectorAll(".hub-ch:not(.hub-ch--open) .hub-card:not(.hub-card--wide)"), function (card) {
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
      if (scene === "labs") labReadout();
      if (scene === "fit") fitReadout();
      if (scene === "network") setText(find("[data-hub-hubs]"), hubsLit(progress, sites.length) + planted.length);
    }

    function labReadout() {
      var current = labPhase(labWeek(progress), labHome(progress));
      Array.prototype.forEach.call(document.querySelectorAll("[data-hub-phase]"), function (item) {
        var index = Number(item.getAttribute("data-hub-phase"));
        item.classList.toggle("is-on", index === current);
        item.classList.toggle("is-done", index < current);
      });
    }

    function fitReadout() {
      var focus = holderInFocus(progress, chosenHolder());
      Array.prototype.forEach.call(document.querySelectorAll("[data-hub-holder]"), function (button) {
        button.classList.toggle("is-on", button.getAttribute("data-hub-holder") === focus);
      });
      var list = find(".hub-holders");
      if (list) list.classList.toggle("is-all", !focus);
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

    Array.prototype.forEach.call(document.querySelectorAll("[data-hub-holder]"), function (button) {
      var id = button.getAttribute("data-hub-holder");
      button.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "mouse") { hoveredHolder = id; readouts(); }
      });
      button.addEventListener("pointerleave", function (event) {
        if (event.pointerType === "mouse") { hoveredHolder = null; readouts(); }
      });
      button.addEventListener("click", function () {
        pinnedHolder = pinnedHolder === id ? null : id;
        if (!pinnedHolder) hoveredHolder = null;
        readouts();
      });
    });

    // Tapping the network's stage plants another hub there.
    var networkSection = find('[data-hub-scene="network"]');
    if (networkSection) networkSection.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest(".hub-card")) return;
      var spot = plantAt(event.clientX, event.clientY, stageFor(innerWidth, innerHeight, cardTop()));
      if (!spot || planted.length >= 24) return;
      planted.push({ u: spot[0], v: spot[1], born: Date.now() });
      readouts();
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
    // A ring squashed like the field itself, for rings that pass through placed lights.
    function oval(x, y, r, col, a, width, wobble, seed) {
      if (a < 0.01) return;
      ctx.strokeStyle = C[col] || C.ink;
      ctx.globalAlpha = a;
      ctx.lineWidth = width;
      ctx.beginPath();
      Array.from({ length: 97 }, function (_, k) { return (k / 96) * TAU; }).forEach(function (t, k) {
        var rr = r * (1 + wobble * Math.sin(3 * t + seed) + wobble * 0.6 * Math.sin(5 * t + seed * 1.7));
        var px = x + Math.cos(t) * rr * 1.1, py = y + Math.sin(t) * rr * 0.86;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.stroke();
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
    function pulse(x1, y1, x2, y2, bend, col, a, now, period, offset, size) {
      var k = still ? 0.5 : ((now / period) + offset) % 1;
      var place = bendPoint(x1, y1, x2, y2, bend, k);
      dot(place[0], place[1], size || 2.2, a * Math.sin(Math.PI * k), col);
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
    // A point on the field's oval (wider than tall) around the stage's center.
    function around(stage, angle, radius) {
      return [stage.cx + Math.cos(angle) * radius * 1.1, stage.cy + Math.sin(angle) * radius * 0.86];
    }
    function region(stage, now, scale, alpha) {
      lights.forEach(function (entry) {
        var place = cloudPlace(entry.light, stage, now, scale, still);
        set(entry, place[0], place[1], entry.light.size * (scale > 1 ? 0.9 : 1), alpha === undefined ? baseAlpha(entry.light) : alpha, baseColor(entry.light));
      });
    }


    var scenes = {
      // Programs come and go: cohorts flow in, circle the hub and flow out
      // on a loop, while the hub stays where it is.
      opening: {
        target: function (stage, t, now) {
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.085, a: 1, lit: 0.5 };
          region(stage, now, 1.55, 0.18);
          var clock = still ? 0.35 : now / 18000;
          Array.from({ length: 64 }, function (_, k) {
            var entry = member(0, k, 64, 0), light = entry.light;
            var loop = (clock + (k % 4) / 4 + (light.ph / TAU) * 0.05) % 1;
            var leg = passage(loop);
            var into = light.ang, out = light.ang + 2.1, orbit = stage.R * (0.32 + 0.08 * light.rad);
            var place;
            if (leg.leg === "in") {
              var a = around(stage, into, stage.R * 1.45), b = around(stage, into, orbit);
              place = bendPoint(a[0], a[1], b[0], b[1], 0.12, leg.s);
            } else if (leg.leg === "orbit") place = around(stage, into + leg.s * 2.1, orbit);
            else {
              var c = around(stage, out, orbit), d = around(stage, out, stage.R * 1.45);
              place = bendPoint(c[0], c[1], d[0], d[1], 0.12, leg.s);
            }
            entry.orbiting = leg.leg === "orbit" ? Math.min(1, leg.s * 5, (1 - leg.s) * 5) : 0;
            set(entry, place[0], place[1], light.size, 0.9 * (leg.leg === "in" ? leg.s : leg.leg === "out" ? 1 - leg.s : 1), baseColor(light));
          });
        },
        draw: function (stage, t, now, fade) {
          lights.forEach(function (entry) {
            if (entry.orbiting) thread(hub.x, hub.y, entry.x, entry.y, "brass", 0.16 * entry.orbiting * fade, 0.8, 0.06);
          });
          caption(hub.x, hub.y + hub.r + 20, captionOf("hub"), 0.6 * fade, "brass");
        },
      },

      // 01: the hub trains its region's best and hands them to the center.
      pipeline: {
        target: function (stage, t, now) {
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.085, a: 1, lit: 0.3 };
          centerT = {
            x: stage.x1 - stage.R * (stage.phone ? 0.25 : 0.1),
            y: stage.y0 + stage.R * (stage.phone ? 0.25 : 0.14),
            r: stage.R * (0.11 + 0.07 * segment(t, 0.05, 0.9)),
            a: segment(t, 0, 0.12),
          };
          var dim = 1 - 0.4 * segment(t, 0.2, 0.9);
          lights.forEach(function (entry) {
            var light = entry.light;
            var base = cloudPlace(light, stage, now, 1.15, still);
            var k = departure(light.rank, COUNT, t), legs = intakeLegs(k);
            var inHub = [stage.cx + Math.cos(light.ang) * stage.R * 0.13, stage.cy + Math.sin(light.ang) * stage.R * 0.11];
            var place = legs.toCenter > 0
              ? bendPoint(inHub[0], inHub[1], center.x, center.y, 0.2, legs.toCenter)
              : bendPoint(base[0], base[1], inHub[0], inHub[1], 0.1, legs.toHub);
            entry.k = k; entry.hx = inHub[0]; entry.hy = inHub[1]; entry.out = legs.toCenter;
            entry.snap = k > 0;
            var leaving = segment(k, 0.6, 1);
            set(entry, place[0], place[1], light.size * (1 - 0.5 * leaving), baseAlpha(light) * (k > 0 ? 1 - leaving * leaving * leaving : dim), baseColor(light));
          });
        },
        draw: function (stage, t, now, fade) {
          lights.forEach(function (entry) {
            if (entry.out > 0 && entry.out < 1) {
              thread(entry.hx, entry.hy, center.x, center.y, baseColor(entry.light), 0.22 * fade * Math.sin(Math.PI * entry.out), 0.8, 0.2, [2, 4]);
            }
          });
          caption(center.x - center.r - 14, center.y + center.r + 14, captionOf("center"), 0.55 * fade * center.a, "ink", "end");
          caption(hub.x, hub.y + hub.r + 20, captionOf("hub"), 0.6 * fade, "brass");
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

      // 04: a lab passes through the hub: the organization's team arrives at a
      // lab beside the hub, the hub's members deliver, other labs run beside
      // it, and the lab's Brain goes home with the organization.
      labs: {
        target: function (stage, t, now) {
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.09, a: 1, lit: 0.85 };
          var week = labWeek(t), present = guestsPresent(week), arrive = segment(t, 0, 0.04);
          var lab = [stage.cx + stage.R * 0.52, stage.cy + stage.R * 0.24];
          var org = [stage.x1 - stage.R * 0.12, stage.y0 + stage.R * 0.22];
          this.state = { week: week, home: labHome(t), present: present, lab: lab, org: org };
          region(stage, now, 1.6, 0.16);
          // The team, from the organization to the lab.
          Array.from({ length: 4 }, function (_, j) {
            var entry = member(0, j, 4, 80), angle = (still ? 0 : now * 0.00024) + (j * TAU) / 4;
            var at = [lab[0] + Math.cos(angle) * stage.R * 0.08, lab[1] + Math.sin(angle) * stage.R * 0.08];
            set(entry, org[0] + (at[0] - org[0]) * ease(arrive), org[1] + (at[1] - org[1]) * ease(arrive), 3, 1, "brassSoft");
          });
          // The hub's members; three go over to deliver during the pilot.
          Array.from({ length: 6 }, function (_, j) {
            var entry = member(0, j, 6, 84), rest = around(stage, Math.PI * 0.62 + j * 0.42, stage.R * 0.2);
            var goes = j < 3 ? ease(present) : 0, angle = -0.4 + j * 0.9;
            var at = [lab[0] + Math.cos(angle) * stage.R * 0.15, lab[1] + Math.sin(angle) * stage.R * 0.15];
            set(entry, rest[0] + (at[0] - rest[0]) * goes, rest[1] + (at[1] - rest[1]) * goes, 2.4, 0.85, "ink");
          });
          // Other labs at the hub, each on its own clock.
          this.state.labs = [Math.PI * 0.95, Math.PI * 1.32, Math.PI * 0.6].map(function (angle, j) {
            return { at: around(stage, angle, stage.R * 0.62), progress: still ? 0.5 : ((now / 11000) + j * 0.31) % 1 };
          });
          this.state.labs.forEach(function (other, j) {
            Array.from({ length: 4 }, function (_, k) {
              var entry = member(j, k, 4, 90), angle = (still ? 0 : now * 0.0003) + (k * TAU) / 4;
              set(entry, other.at[0] + Math.cos(angle) * stage.R * 0.05, other.at[1] + Math.sin(angle) * stage.R * 0.05, 1.8, 0.75, "brassSoft");
            });
          });
        },
        draw: function (stage, t, now, fade) {
          var state = this.state, week = state.week, home = state.home, lab = state.lab, org = state.org;
          var dial = stage.R * 0.24, start = -Math.PI / 2;
          function angleOf(w) { return start + (w / 26) * TAU; }
          // The hub holds its labs.
          state.labs.forEach(function (other) {
            thread(hub.x, hub.y, other.at[0], other.at[1], "brass", 0.22 * fade, 0.8, 0.08);
            ring(other.at[0], other.at[1], stage.R * 0.075, "brass", 0.3 * fade, 1, 0, 0);
            ctx.strokeStyle = C.brass; ctx.globalAlpha = 0.8 * fade; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(other.at[0], other.at[1], stage.R * 0.075, start, start + other.progress * TAU); ctx.stroke();
            ctx.globalAlpha = 1;
          });
          thread(hub.x, hub.y, lab[0], lab[1], "brass", 0.35 * fade, 1, -0.08);
          // The lab's twenty-six weeks.
          Array.from({ length: 26 }, function (_, w) {
            var a = angleOf(w + 0.5), passed = w < week;
            thread(lab[0] + Math.cos(a) * (dial - 3), lab[1] + Math.sin(a) * (dial - 3), lab[0] + Math.cos(a) * (dial + 3), lab[1] + Math.sin(a) * (dial + 3), passed ? "brass" : "ink", (passed ? 0.7 : 0.18) * fade, 1, 0);
          });
          [[0, 3, 2.4], [3, 18, 1.5], [18, 24, 1.9], [24, 26, 2.4]].forEach(function (phase) {
            var reach = Math.min(phase[1], Math.max(phase[0], week));
            if (reach <= phase[0]) return;
            ctx.strokeStyle = C.brass; ctx.globalAlpha = 0.85 * fade; ctx.lineWidth = phase[2];
            ctx.beginPath(); ctx.arc(lab[0], lab[1], dial + 9, angleOf(phase[0]) + 0.02, angleOf(reach) - 0.02); ctx.stroke();
            ctx.globalAlpha = 1;
          });
          caption(lab[0], lab[1] + dial + 26, String(captionOf("week")).replace("{week}", pad(Math.min(26, Math.floor(week) + 1))), 0.6 * fade, "ink");
          // Decisions gather in the lab's Brain, which goes home at the end.
          var brain = segment(week, 3, 4.2), decisions = decisionsBy(week);
          var bx = lab[0] + (org[0] - lab[0]) * ease(home), by = lab[1] + (org[1] - lab[1]) * ease(home);
          ctx.fillStyle = C.ink; ctx.globalAlpha = 0.5 * fade * (1 - home);
          Array.from({ length: decisions }, function (_, k) {
            var a = k * 2.399, rr = stage.R * (0.11 + (k % 3) * 0.018);
            ctx.fillRect(lab[0] + Math.cos(a) * rr - 1.5, lab[1] + Math.sin(a) * rr - 2, 3, 4);
          });
          ctx.globalAlpha = 1;
          lantern(bx, by, stage.R * (0.03 + 0.02 * brain), fade * brain, brain);
          Array.from({ length: 3 }, function (_, j) {
            var entry = member(0, j, 6, 84);
            thread(entry.x, entry.y, lab[0], lab[1], "ink", 0.22 * state.present * fade, 0.8, 0.15);
          });
          // The organization: where the team came from, and where its Brain goes.
          dot(org[0], org[1], 5, fade, "brassSoft");
          caption(org[0] - 12, org[1], captionOf(home > 0.5 ? "home" : "organization"), 0.6 * fade, "brass", "end");
          if (home > 0) thread(hub.x, hub.y, bx, by, "brass", 0.25 * fade * home, 0.8, 0.2, [3, 4]);
          if (week >= 18 && home < 0.5) [0, 0.33, 0.66].forEach(function (offset) { pulse(org[0], org[1], lab[0], lab[1], 0.1, "brassSoft", fade, now, 2400, offset); });
          caption(hub.x, hub.y + hub.r + 20, captionOf("hub"), 0.6 * fade, "brass");
          if (state.present > 0.3 && !stage.phone) caption(hub.x - stage.R * 0.05, hub.y - stage.R * 0.3, captionOf("members"), 0.45 * state.present * fade, "ink", "end");
        },
      },

      // 05: the hub at the center of its written terms: organizations' Brains
      // around it, its members, Rizom B.V., and the commons as a ring around
      // everything; then the split of every lab flows.
      fit: {
        target: function (stage, t, now) {
          var focus = holderInFocus(t, chosenHolder());
          function dim(id) { return focus && focus !== id ? 0.3 : 1; }
          var moved = certified(t);
          this.state = { dim: dim, flow: splitFlow(t), moved: moved };
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.09, a: dim("hub"), lit: dim("hub") };
          region(stage, now, 1.7, 0);
          lights.forEach(function (entry) { entry.tr = 0; });
          var orgs = this.state.orgs = Array.from({ length: 6 }, function (_, j) { return around(stage, (j / 6) * TAU + 0.3, stage.R * 0.46); });
          orgs.forEach(function (at, j) {
            Array.from({ length: 2 }, function (_, k) {
              var entry = member(j, k, 2, 0), angle = (still ? 0 : now * 0.0002) + k * Math.PI + j;
              set(entry, at[0] + Math.cos(angle) * 12, at[1] + Math.sin(angle) * 10, 1.8, 0.8 * dim("orgs"), "brassSoft");
            });
          });
          this.state.members = Array.from({ length: 6 }, function (_, j) {
            var entry = member(0, j, 6, 12), at = around(stage, (j / 6) * TAU, stage.R * 0.24);
            set(entry, at[0], at[1], 2.4, dim("members") * (0.75 + 0.25 * moved), "ink");
            return entry;
          });
          this.state.bv = Array.from({ length: 4 }, function (_, j) {
            var entry = member(0, j, 4, 18), at = around(stage, Math.PI / 4 + (j * Math.PI) / 2, stage.R * 0.66);
            set(entry, at[0], at[1], 2.6, dim("bv"), "ruby");
            return entry;
          });
          this.state.roots = Array.from({ length: 14 }, function (_, j) {
            var entry = member(0, j, 14, 22), at = around(stage, (j / 14) * TAU + 0.1, stage.R * 0.86);
            set(entry, at[0], at[1], 2, dim("foundation"), "moss");
            return entry;
          });
        },
        draw: function (stage, t, now, fade) {
          var state = this.state, dim = state.dim, flow = state.flow, moved = state.moved;
          // The commons: a ring of roots around everything.
          [0, 1].forEach(function (k) {
            oval(hub.x, hub.y, stage.R * (0.86 + k * 0.035), "moss", 0.4 * fade * dim("foundation") * (1 - k * 0.5), 1.2, k ? 0.02 : 0, k * 2);
          });
          caption(hub.x, hub.y + stage.R * 0.86 * 0.86 + 22, captionOf(stage.phone ? "foundationShort" : "foundation"), 0.7 * fade * dim("foundation"), "moss");
          state.bv.forEach(function (entry) { thread(entry.x, entry.y, hub.x, hub.y, "ruby", 0.2 * fade * dim("bv"), 0.8, 0.05, [2, 4]); });
          caption(state.bv[0].x + 12, state.bv[0].y, captionOf("bv"), 0.7 * fade * dim("bv"), "ruby", "start");
          state.orgs.forEach(function (at) {
            lantern(at[0], at[1], stage.R * 0.035, fade * dim("orgs"), 0.6, "brassSoft");
            thread(at[0], at[1], hub.x, hub.y, "brass", 0.16 * fade * Math.min(dim("orgs"), dim("hub")), 0.8, 0.06);
          });
          caption(state.orgs[4][0], state.orgs[4][1] - 22, captionOf("organizations"), 0.65 * fade * dim("orgs"), "brass");
          state.members.forEach(function (entry) { thread(entry.x, entry.y, hub.x, hub.y, "ink", 0.16 * fade * dim("members"), 0.7, 0); });
          caption(state.members[1].x + 12, state.members[1].y + 10, captionOf(moved > 0.5 ? "membersCertified" : "members"), 0.6 * fade * dim("members"), "ink", "start");
          caption(hub.x, hub.y - hub.r - 16, captionOf("hub"), 0.75 * fade * dim("hub"), "brass");
          if (flow <= 0) return;
          // Every lab: 60 to whoever delivers, 15 to the hub, 25 back to the commons.
          state.orgs.forEach(function (at, j) {
            var offset = j / 6, bv = state.bv[j % 4], m = state.members[j], root = state.roots[(j * 2 + 1) % 14];
            pulse(at[0], at[1], hub.x, hub.y, 0.1, "brass", fade * flow, now, 3200, offset, 2.4);
            [0, 0.25, 0.5, 0.75].forEach(function (o) {
              pulse(at[0], at[1], bv.x, bv.y, 0.15, "ruby", fade * flow * (1 - moved), now, 3200, offset + o * 0.25, 2.1);
              pulse(at[0], at[1], m.x, m.y, -0.15, "ink", fade * flow * moved, now, 3200, offset + o * 0.25, 2.1);
            });
            [0, 0.5].forEach(function (o) { pulse(at[0], at[1], root.x, root.y, 0.1, "moss", fade * flow, now, 3600, offset + o * 0.4, 2.1); });
          });
          // What the commons earns flows back into the platform every hub runs on.
          state.roots.filter(function (_, j) { return j % 3 === 0; }).forEach(function (entry, j) {
            pulse(entry.x, entry.y, hub.x, hub.y, -0.06, "moss", 0.7 * fade * flow, now, 4200, j * 0.23, 1.8);
          });
        },
      },

      // 06: from this hub the network runs past every edge, and nobody is in
      // the middle. Hubs under the chapter's words stay faint on a wide screen.
      network: {
        target: function (stage, t, now) {
          hubT = { x: stage.cx, y: stage.cy, r: stage.R * 0.07, a: 1, lit: 1 };
          var lit = hubsLit(t, sites.length);
          function at(spot) { return [stage.x0 + spot[0] * stage.w, stage.y0 + spot[1] * stage.h]; }
          function faint(point) { return !stage.phone && point[0] < stage.x0 - 20 ? 0.25 : 1; }
          this.state = { at: at, faint: faint, lit: lit };
          lights.forEach(function (entry, i) {
            var h = Math.floor(i / 5), j = i % 5;
            var centre = h === 0 ? [stage.cx, stage.cy] : at(sites[(h - 1) % sites.length]);
            var shown = h === 0 || h <= lit - 1;
            var angle = (j / 5) * TAU + entry.light.ph * 0.2 + (still ? 0 : now * 0.00012), rr = stage.R * (0.07 + 0.03 * (j % 3));
            set(entry, centre[0] + Math.cos(angle) * rr, centre[1] + Math.sin(angle) * rr * 0.86, entry.light.size * 0.75, shown ? 0.75 * faint(centre) : 0, baseColor(entry.light));
          });
        },
        draw: function (stage, t, now, fade) {
          var state = this.state;
          var points = [[stage.cx, stage.cy]]
            .concat(sites.slice(0, state.lit - 1).map(state.at))
            .concat(planted.map(function (spot) { return state.at([spot.u, spot.v]); }));
          // Each hub links to its nearest neighbors; nobody sits in the middle.
          linkNearest(points, 2).forEach(function (pair, k) {
            var a = points[pair[0]], b = points[pair[1]], f = state.faint(a) * state.faint(b);
            thread(a[0], a[1], b[0], b[1], "brass", 0.3 * fade * f, 1, 0.1);
            pulse(a[0], a[1], b[0], b[1], 0.1, "brassSoft", fade * f, now, 2600 + (k % 5) * 500, (k * 0.17) % 1, 2);
          });
          points.forEach(function (point, i) { if (i) lantern(point[0], point[1], stage.R * 0.035, fade * state.faint(point), 0.7); });
          planted.forEach(function (spot) {
            var point = state.at([spot.u, spot.v]);
            var grow = Math.min(1, Math.max(0, (Date.now() - spot.born) / 900));
            ring(point[0], point[1], stage.R * 0.035 + (1 - grow) * 30, "brass", fade * (0.4 + 0.6 * grow), 1.2, 0, 0);
          });
          caption(hub.x, hub.y + stage.R * 0.16 + 12, captionOf("ours"), 0.75 * fade, "brass");
        },
      },

      // 07: the field at rest around the lit hub, clear of the doors.
      start: {
        target: function (stage, t, now) {
          var rest = stage.phone ? { cx: stage.cx, cy: stage.cy, s: 0.8 } : { cx: stage.x1 - stage.R * 0.42, cy: stage.y1 - stage.R * 0.46, s: 0.5 };
          var resting = { x0: stage.x0, x1: stage.x1, y0: stage.y0, y1: stage.y1, w: stage.w, h: stage.h, cx: rest.cx, cy: rest.cy, R: stage.R, phone: stage.phone };
          this.rest = rest;
          hubT = { x: rest.cx, y: rest.cy, r: stage.R * 0.08 * rest.s * 1.4, a: 1, lit: 1 };
          lights.forEach(function (entry) {
            var place = cloudPlace(entry.light, resting, now, rest.s, still);
            set(entry, place[0], place[1], entry.light.size, entry.light.warm ? 0.85 : 0.4, baseColor(entry.light));
          });
        },
        draw: function (stage, t, now, fade) {
          var rest = this.rest;
          pairs.forEach(function (pair) {
            var p = lights[pair[0]], q = lights[pair[1]];
            thread(p.x, p.y, q.x, q.y, "brass", 0.12 * fade, 0.8, 0.12);
          });
          lights.forEach(function (entry) {
            if (entry.light.warm) thread(entry.x, entry.y, hub.x, hub.y, "brass", 0.1 * fade, 0.7, 0.05);
          });
          Array.from({ length: 5 }, function (_, k) {
            ring(hub.x, hub.y, stage.R * rest.s * (0.18 + k * 0.07), "brass", (0.2 - k * 0.03) * fade, 0.8, 0.06 + k * 0.01, k);
          });
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
      lights.forEach(function (entry) { entry.snap = false; entry.orbiting = 0; entry.out = 0; entry.k = 0; });
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
