/**
 * Product card mini-canvases (rover / relay / ranger).
 *
 * Each product card has its own <canvas id="{variant}Canvas"> drawn
 * by drawProductCanvas(). Uses the shared prelude helpers
 * (createRand, drawGlowBezier, drawGlowNode, rgba, dpr, isLightMode)
 * which load once via /canvases/prelude.canvas.js — top-level consts
 * in classic <script> mode are visible to subsequent scripts in the
 * same document via the global lexical environment.
 *
 * Exposes window.redrawAllCanvases so the boot script's theme-toggle
 * handler can re-render after dark/light mode changes.
 */
function drawProductCanvas(id, type) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const W = 511,
    H = 320;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const rng = createRand(type === "rover" ? 42 : type === "relay" ? 99 : 173);
  const light = isLightMode();
  ctx.clearRect(0, 0, W, H);

  if (type === "rover") {
    const ag = ctx.createRadialGradient(255, 155, 0, 255, 155, 160);
    ag.addColorStop(
      0,
      light ? "rgba(232,119,34,0.04)" : "rgba(232,119,34,0.08)",
    );
    ag.addColorStop(1, "rgba(13,10,26,0)");
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, W, H);
    function rBranch(x, y, a, l, w, d, c, o) {
      if (d <= 0 || w < 0.1 || l < 3) return;
      const ex = x + Math.cos(a + rng.range(-0.15, 0.15)) * l,
        ey = y + Math.sin(a + rng.range(-0.15, 0.15)) * l;
      const c1x = x + Math.cos(a + rng.range(-0.3, 0.3)) * l * 0.35,
        c1y = y + Math.sin(a + rng.range(-0.3, 0.3)) * l * 0.35;
      const c2x = x + Math.cos(a + rng.range(-0.2, 0.2)) * l * 0.7,
        c2y = y + Math.sin(a + rng.range(-0.2, 0.2)) * l * 0.7;
      drawGlowBezier(
        ctx,
        [x, y, c1x, c1y, c2x, c2y, ex, ey],
        c,
        w,
        Math.max(2, w * 3),
        o,
        light,
      );
      if (d <= 2)
        drawGlowNode(ctx, ex, ey, Math.max(0.5, w * 0.4), c, o * 0.5, light);
      const nb =
        d > 3 ? Math.floor(rng.range(2, 4)) : Math.floor(rng.range(1, 3));
      for (let i = 0; i < nb; i++) {
        let nc = c;
        if (d <= 2 && rng.next() < 0.2) nc = "#6B2FA0";
        else if (rng.next() < 0.3)
          nc = nc === "#E87722" ? "#FFA366" : "#E87722";
        rBranch(
          ex,
          ey,
          a + rng.range(-0.7, 0.7),
          l * rng.range(0.45, 0.75),
          w * rng.range(0.45, 0.7),
          d - 1,
          nc,
          o * rng.range(0.55, 0.8),
        );
      }
    }
    drawGlowNode(ctx, 255, 155, 6, "#FFA366", 0.9, light);
    for (let i = 0; i < 8; i++)
      rBranch(
        255,
        155,
        (i * Math.PI * 2) / 8 + rng.range(-0.3, 0.3),
        rng.range(80, 130),
        rng.range(2, 3.5),
        5,
        "#E87722",
        rng.range(0.35, 0.5),
      );
  } else if (type === "relay") {
    if (!light) {
      const ag = ctx.createRadialGradient(255, 160, 0, 255, 160, 180);
      ag.addColorStop(0, "rgba(107,47,160,0.06)");
      ag.addColorStop(1, "rgba(13,10,26,0)");
      ctx.fillStyle = ag;
      ctx.fillRect(0, 0, W, H);
    }
    const pts = [
      [110, 130],
      [380, 110],
      [260, 250],
    ];
    pts.forEach((p, i) => {
      const np = pts[(i + 1) % 3];
      drawGlowBezier(
        ctx,
        [
          p[0],
          p[1],
          (p[0] + np[0]) * 0.5 + rng.range(-20, 20),
          (p[1] + np[1]) * 0.5 + rng.range(-15, 15),
          (p[0] + np[0]) * 0.5 + rng.range(-10, 10),
          (p[1] + np[1]) * 0.5 + rng.range(-10, 10),
          np[0],
          np[1],
        ],
        "#8C82C8",
        2.8,
        12,
        0.4,
        light,
      );
    });
    pts.forEach((p) => drawGlowNode(ctx, p[0], p[1], 5, "#FFA366", 0.7, light));
    drawGlowNode(ctx, 250, 163, 3.5, "#8C82C8", 0.5, light);
    pts.forEach((p) => {
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, Math.PI * 2),
          l = rng.range(40, 80);
        const ex = p[0] + Math.cos(a) * l,
          ey = p[1] + Math.sin(a) * l;
        drawGlowBezier(
          ctx,
          [
            p[0],
            p[1],
            p[0] + Math.cos(a) * l * 0.4,
            p[1] + Math.sin(a) * l * 0.4,
            ex - Math.cos(a) * l * 0.2,
            ey - Math.sin(a) * l * 0.2,
            ex,
            ey,
          ],
          "#FFA366",
          rng.range(0.5, 1.2),
          rng.range(2, 5),
          rng.range(0.15, 0.3),
          light,
        );
        drawGlowNode(
          ctx,
          ex,
          ey,
          rng.range(0.5, 1.5),
          "#FFA366",
          rng.range(0.15, 0.3),
          light,
        );
      }
    });
  } else {
    if (!light) {
      const ag = ctx.createRadialGradient(250, 160, 0, 250, 160, 250);
      ag.addColorStop(0, "rgba(107,47,160,0.05)");
      ag.addColorStop(0.4, "rgba(232,119,34,0.03)");
      ag.addColorStop(1, "rgba(13,10,26,0)");
      ctx.fillStyle = ag;
      ctx.fillRect(0, 0, W, H);
    }
    const hubs = [
      [168, 95],
      [285, 105],
      [188, 200],
      [255, 205],
      [105, 138],
      [335, 175],
      [65, 55],
      [365, 78],
      [228, 278],
    ];
    hubs.forEach((p, i) => {
      for (let j = i + 1; j < hubs.length; j++) {
        const d = Math.hypot(p[0] - hubs[j][0], p[1] - hubs[j][1]);
        if (d < 200) {
          const c = rng.next() < 0.5 ? "#8C82C8" : "#6B2FA0";
          drawGlowBezier(
            ctx,
            [
              p[0],
              p[1],
              (p[0] + hubs[j][0]) * 0.5 + rng.range(-15, 15),
              (p[1] + hubs[j][1]) * 0.5 + rng.range(-10, 10),
              (p[0] + hubs[j][0]) * 0.5 + rng.range(-10, 10),
              (p[1] + hubs[j][1]) * 0.5 + rng.range(-8, 8),
              hubs[j][0],
              hubs[j][1],
            ],
            c,
            0.5,
            3,
            0.12,
            light,
          );
        }
      }
    });
    hubs.forEach((p, i) => {
      const size = i < 4 ? rng.range(2.5, 4) : rng.range(1, 2.5);
      const op = i < 4 ? rng.range(0.4, 0.7) : rng.range(0.15, 0.35);
      const c = rng.next() < 0.5 ? "#FFA366" : "#8C82C8";
      drawGlowNode(ctx, p[0], p[1], size, c, op, light);
    });
    for (let i = 0; i < 40; i++) {
      const c =
        rng.next() < 0.5 ? "#FFA366" : rng.next() < 0.5 ? "#8C82C8" : "#6B2FA0";
      drawGlowNode(
        ctx,
        rng.range(10, 500),
        rng.range(10, 310),
        rng.range(0.3, 1),
        c,
        rng.range(0.05, 0.15),
        light,
      );
    }
  }
  for (let i = 0; i < 60; i++) {
    const c = ["#FFA366", "#E87722", "#6B2FA0"][Math.floor(rng.next() * 3)];
    ctx.fillStyle = rgba(c, rng.range(0.02, 0.08));
    ctx.beginPath();
    ctx.arc(
      rng.range(0, W),
      rng.range(0, H),
      rng.range(0.2, 1),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function redrawAllCanvases() {
  drawProductCanvas("roverCanvas", "rover");
  drawProductCanvas("relayCanvas", "relay");
  drawProductCanvas("rangerCanvas", "ranger");
}

// Expose to the boot script's theme-toggle handler.
window.redrawAllCanvases = redrawAllCanvases;

// Initial draw — wait for DOM.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", redrawAllCanvases);
} else {
  redrawAllCanvases();
}
