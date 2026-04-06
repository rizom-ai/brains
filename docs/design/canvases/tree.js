(function () {
  const canvas = document.getElementById("heroCanvas");
  if (!canvas) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Full document height for the tree
  const docH = Math.max(document.body.scrollHeight, 5000);
  // Tree trunk runs along the right third of the page
  const trunkX = W * 0.7;

  const stripH = Math.min(docH, 8000);
  let staticCanvas = document.createElement("canvas");
  staticCanvas.width = canvas.width;
  staticCanvas.height = stripH * dpr;

  let nodes = [];
  let builtTheme = null;

  function buildStatic() {
    const light = isLightMode();
    if (builtTheme === light) return;
    builtTheme = light;
    nodes = [];
    const rng = createRand(42);
    // Completely replace the static canvas — no chance of state leak
    staticCanvas = document.createElement("canvas");
    staticCanvas.width = canvas.width;
    staticCanvas.height = stripH * dpr;
    const sctx = staticCanvas.getContext("2d");
    sctx.scale(dpr, dpr);

    // Ambient glows at different heights
    const ambients = [
      { y: stripH * 0.08, r: W * 0.4 },
      { y: stripH * 0.35, r: W * 0.35 },
      { y: stripH * 0.6, r: W * 0.3 },
      { y: stripH * 0.85, r: W * 0.25 },
    ];
    ambients.forEach((a) => {
      const ag = sctx.createRadialGradient(trunkX, a.y, 0, trunkX, a.y, a.r);
      if (!light) {
        ag.addColorStop(0, "rgba(232,119,34,0.04)");
        ag.addColorStop(0.5, "rgba(107,47,160,0.01)");
        ag.addColorStop(1, "rgba(14,0,39,0)");
      } else {
        ag.addColorStop(0, "rgba(196,90,8,0.03)");
        ag.addColorStop(1, "rgba(196,90,8,0)");
      }
      sctx.fillStyle = ag;
      sctx.fillRect(0, a.y - a.r, W, a.r * 2);
    });

    // Branch helper
    function branch(x, y, angle, len, w, depth, color, op) {
      if (depth <= 0 || w < 0.15 || len < 4) return;
      const j = rng.range(-0.15, 0.15);
      const ex = x + Math.cos(angle + j) * len;
      const ey = y + Math.sin(angle + j) * len;
      const c1x = x + Math.cos(angle + rng.range(-0.4, 0.4)) * len * 0.35;
      const c1y = y + Math.sin(angle + rng.range(-0.4, 0.4)) * len * 0.35;
      const c2x = x + Math.cos(angle + rng.range(-0.25, 0.25)) * len * 0.7;
      const c2y = y + Math.sin(angle + rng.range(-0.25, 0.25)) * len * 0.7;
      drawGlowBezier(
        sctx,
        [x, y, c1x, c1y, c2x, c2y, ex, ey],
        color,
        w,
        Math.max(2, w * 3),
        op,
        light,
      );
      if (depth <= 2) {
        const nr = Math.max(0.5, w * 0.4);
        drawGlowNode(sctx, ex, ey, nr, color, op * 0.4, light);
        nodes.push({
          x: ex,
          y: ey,
          r: nr,
          color,
          op: op * 0.4,
          phase: rng.next() * Math.PI * 2,
        });
      }
      const nb =
        depth > 3 ? Math.floor(rng.range(2, 3)) : Math.floor(rng.range(1, 3));
      for (let i = 0; i < nb; i++) {
        const sp = depth > 3 ? rng.range(0.2, 0.6) : rng.range(0.3, 0.9);
        let nc = color;
        if (depth <= 3 && rng.next() < 0.2) nc = "#6B2FA0";
        else if (rng.next() < 0.3)
          nc = nc === "#E87722" ? "#FFA366" : "#E87722";
        branch(
          ex,
          ey,
          angle + rng.range(-sp, sp),
          len * rng.range(0.45, 0.75),
          w * rng.range(0.45, 0.7),
          depth - 1,
          nc,
          op * rng.range(0.5, 0.8),
        );
      }
    }

    // === MAIN TRUNK — continuous line from bottom to top ===
    const segments = 22;
    let prevX = trunkX + rng.range(-10, 10);
    let prevY = stripH;
    const trunkPoints = [{ x: prevX, y: prevY }];

    for (let i = 0; i < segments; i++) {
      const t = (i + 1) / segments;
      const nextY = stripH * (1 - t);
      const drift = rng.range(-40, 40);
      const nextX = trunkX + drift + Math.sin(t * Math.PI * 2) * 30;
      trunkPoints.push({ x: nextX, y: nextY });

      // Draw trunk segment
      const w = 5 * (1 - t * 0.15); // thicker trunk
      const op = 0.55 * (1 - t * 0.1);
      const c = i % 2 === 0 ? "#E87722" : "#FFA366";
      drawGlowBezier(
        sctx,
        [
          prevX,
          prevY,
          prevX + rng.range(-20, 20),
          prevY - (prevY - nextY) * 0.35,
          nextX + rng.range(-15, 15),
          nextY + (prevY - nextY) * 0.3,
          nextX,
          nextY,
        ],
        c,
        w,
        Math.max(3, w * 3.5),
        op,
        light,
      );

      // Hub node at each segment junction
      const hubR = 3 + (1 - t) * 4;
      drawGlowNode(sctx, nextX, nextY, hubR, "#FFA366", op * 0.8, light);
      nodes.push({
        x: nextX,
        y: nextY,
        r: hubR,
        color: "#FFA366",
        op: op * 0.8,
        phase: i * 0.9,
      });

      // Branches at each junction — reaching left and right
      const branchCount = Math.floor(rng.range(3, 5));
      for (let b = 0; b < branchCount; b++) {
        const side = rng.next() < 0.5 ? -1 : 1;
        const bAngle =
          side * rng.range(0.2, 1.4) +
          (rng.next() < 0.4 ? Math.PI * 0.5 * side : 0);
        const bLen = rng.range(80, 250);
        const bW = rng.range(1.2, 3);
        const bOp = rng.range(0.18, 0.42);
        const bColor =
          rng.next() < 0.7
            ? rng.next() < 0.5
              ? "#E87722"
              : "#FFA366"
            : "#6B2FA0";
        branch(
          nextX,
          nextY,
          bAngle,
          bLen,
          bW,
          Math.floor(rng.range(3, 5)),
          bColor,
          bOp,
        );
      }

      prevX = nextX;
      prevY = nextY;
    }

    // Secondary strands alongside trunk
    for (let strand = 0; strand < 3; strand++) {
      const offset = (strand - 1) * 20 + rng.range(-5, 5);
      let spx = trunkX + offset;
      let spy = stripH;
      const strandW = [2, 1.5, 1][strand];
      const strandOp = [0.25, 0.18, 0.12][strand];
      for (let i = 0; i < segments - 2; i++) {
        const t = (i + 1) / segments;
        const ref = trunkPoints[i + 1];
        const nx = ref.x + rng.range(-25, 35);
        const ny = ref.y + rng.range(-30, 30);
        drawGlowBezier(
          sctx,
          [
            spx,
            spy,
            spx + rng.range(-15, 15),
            (spy + ny) * 0.5,
            nx + rng.range(-15, 15),
            (spy + ny) * 0.5 + rng.range(-25, 25),
            nx,
            ny,
          ],
          strand < 2 ? "#FFA366" : "#E87722",
          strandW * (1 - t * 0.4),
          6,
          strandOp * (1 - t * 0.3),
          light,
        );
        // Extra small branches off secondary strands
        if (rng.next() < 0.4) {
          const a = rng.range(-1.5, 1.5);
          branch(
            nx,
            ny,
            a,
            rng.range(40, 100),
            rng.range(0.5, 1.5),
            3,
            "#FFA366",
            strandOp * 0.5,
            light,
          );
        }
        spx = nx;
        spy = ny;
      }
    }
  }

  // Particles — spread across full viewport
  const particles = [];
  const rngP = createRand(99);
  const dustC = ["#FFA366", "#E87722", "#6B2FA0", "#8C82C8", "#FFD4A8"];
  for (let i = 0; i < 200; i++) {
    particles.push({
      x: rngP.range(0, W),
      y: rngP.range(0, H),
      r: rngP.range(0.3, 1.5),
      vx: rngP.range(-0.06, 0.06),
      vy: rngP.range(-0.1, 0.03),
      color: dustC[Math.floor(rngP.next() * dustC.length)],
      alpha: rngP.range(0.03, 0.15),
      phase: rngP.next() * Math.PI * 2,
    });
  }

  buildStatic();
  window._heroRebuild = function () {
    builtTheme = null;
    buildStatic();
  };

  let t = 0,
    lastTime = 0;
  function animate(timestamp) {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;
    t += dt;

    const scrollY = window.scrollY || window.pageYOffset;
    const scrollRatio = (scrollY * 0.7) / Math.max(1, docH - H);

    ctx.clearRect(0, 0, W, H);

    // Draw the visible slice of the static tree
    // Map scroll position to the strip
    const srcY = scrollRatio * (stripH - H);
    // Source rect in the offscreen canvas (in device pixels)
    ctx.drawImage(
      staticCanvas,
      0,
      srcY * dpr,
      W * dpr,
      H * dpr, // source
      0,
      0,
      W,
      H, // destination
    );

    // Animated particles (viewport-local)
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      const fl = 0.5 + 0.5 * Math.sin(t * 1.5 + p.phase);
      ctx.fillStyle = rgba(p.color, p.alpha * 2 * fl);
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        p.r * (0.8 + 0.3 * Math.sin(t + p.phase)),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });

    // Pulsing nodes — only draw those visible in current scroll window
    nodes.forEach((n) => {
      const screenY = n.y - srcY;
      if (screenY < -100 || screenY > H + 100) return;
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.2 + n.phase);
      const pr = n.r * (2 + Math.sin(t * 0.7 + n.phase));
      ctx.fillStyle = rgba(n.color, n.op * 0.1 * pulse);
      ctx.beginPath();
      ctx.arc(n.x, screenY, pr * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba("#FFD4A8", n.op * 0.12 * pulse);
      ctx.beginPath();
      ctx.arc(n.x, screenY, pr * 2, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
