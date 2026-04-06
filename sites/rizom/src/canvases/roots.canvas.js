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

  const docH = Math.max(document.body.scrollHeight, 5000);
  const stripH = Math.min(docH, 8000);
  let staticCanvas = document.createElement("canvas");
  staticCanvas.width = canvas.width;
  staticCanvas.height = stripH * dpr;

  let nodes = [];
  let seedPoints = [];
  let builtTheme = null;

  function buildStatic() {
    const light = isLightMode();
    if (builtTheme === light) return;
    builtTheme = light;
    nodes = [];
    seedPoints = [];
    const rng = createRand(133);

    staticCanvas = document.createElement("canvas");
    staticCanvas.width = canvas.width;
    staticCanvas.height = stripH * dpr;
    const sctx = staticCanvas.getContext("2d");
    sctx.scale(dpr, dpr);

    // Ambient subterranean glows scattered throughout the full strip
    const ambientCount = Math.max(6, Math.floor(stripH / 900));
    for (let i = 0; i < ambientCount; i++) {
      const ax = rng.range(W * 0.1, W * 0.9);
      const ay = rng.range(stripH * 0.04, stripH * 0.96);
      const ar = rng.range(W * 0.25, W * 0.55);
      const ag = sctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
      if (!light) {
        ag.addColorStop(0, "rgba(107,47,160,0.06)");
        ag.addColorStop(0.5, "rgba(232,119,34,0.018)");
        ag.addColorStop(1, "rgba(14,0,39,0)");
      } else {
        ag.addColorStop(0, "rgba(107,47,160,0.04)");
        ag.addColorStop(1, "rgba(107,47,160,0)");
      }
      sctx.fillStyle = ag;
      sctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
    }

    // Recursive root branch — gentle downward bias but can grow in any direction
    function root(x, y, angle, len, w, depth, color, op) {
      if (depth <= 0 || w < 0.18 || len < 4) return;
      const j = rng.range(-0.12, 0.12);
      const downBias = 0.1; // gentle gravity preference
      const ex = x + Math.cos(angle + j) * len;
      const ey = y + Math.sin(angle + j) * len + downBias * len;
      const c1x = x + Math.cos(angle + rng.range(-0.3, 0.3)) * len * 0.35;
      const c1y =
        y +
        Math.sin(angle + rng.range(-0.3, 0.3)) * len * 0.35 +
        downBias * len * 0.3;
      const c2x = x + Math.cos(angle + rng.range(-0.2, 0.2)) * len * 0.7;
      const c2y =
        y +
        Math.sin(angle + rng.range(-0.2, 0.2)) * len * 0.7 +
        downBias * len * 0.6;
      drawGlowBezier(
        sctx,
        [x, y, c1x, c1y, c2x, c2y, ex, ey],
        color,
        w,
        Math.max(2, w * 3),
        op,
        light,
      );

      if (depth <= 2 || rng.next() < 0.35) {
        const nr = Math.max(0.6, w * 0.5);
        drawGlowNode(sctx, ex, ey, nr, color, op * 0.5, light);
        nodes.push({
          x: ex,
          y: ey,
          r: nr,
          color,
          op: op * 0.5,
          phase: rng.next() * Math.PI * 2,
        });
      }

      const nb =
        depth > 3 ? Math.floor(rng.range(1, 3)) : Math.floor(rng.range(1, 2));
      for (let i = 0; i < nb; i++) {
        const spread = depth > 3 ? rng.range(0.5, 1.2) : rng.range(0.6, 1.5);
        const newAngle = angle + rng.range(-spread, spread);
        let nc = color;
        if (depth <= 3 && rng.next() < 0.22) nc = "#FFA366";
        else if (rng.next() < 0.3)
          nc = nc === "#6B2FA0" ? "#8C82C8" : "#6B2FA0";
        root(
          ex,
          ey,
          newAngle,
          len * rng.range(0.5, 0.78),
          w * rng.range(0.52, 0.74),
          depth - 1,
          nc,
          op * rng.range(0.55, 0.82),
        );
      }
    }

    // Distribute seed bulbs across the FULL strip via jittered grid.
    // Cols scale with viewport width (mobile floors at 3); desktop also
    // gets shorter rows so the network feels rich top to bottom.
    const cols = Math.max(3, Math.round(W / 220));
    const cellW = W / cols;
    const cellH = W < 768 ? 480 : 380;
    const rows = Math.ceil(stripH / cellH);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng.next() < 0.25) continue; // sparse holes
        const sx = c * cellW + rng.range(cellW * 0.1, cellW * 0.9);
        const sy = r * cellH + rng.range(cellH * 0.15, cellH * 0.85);
        if (sy > stripH - 20 || sy < 20) continue;
        seedPoints.push({ x: sx, y: sy });

        // Bioluminescent seed bulb
        const bulbR = rng.range(2.8, 4.8);
        drawGlowNode(
          sctx,
          sx,
          sy,
          bulbR,
          "#FFA366",
          rng.range(0.55, 0.8),
          light,
        );
        nodes.push({
          x: sx,
          y: sy,
          r: bulbR,
          color: "#FFA366",
          op: 0.72,
          phase: rng.next() * Math.PI * 2,
          isSeed: true,
        });

        // Local root system from this seed — branches in any direction
        const rootCount = Math.floor(rng.range(1, 3));
        for (let p = 0; p < rootCount; p++) {
          const angle = rng.range(0, Math.PI * 2);
          const len = rng.range(60, 130);
          const w = rng.range(1.2, 2.2);
          root(sx, sy, angle, len, w, 4, "#6B2FA0", rng.range(0.35, 0.55));
        }
      }
    }

    // Lateral rhizomatic interconnects between nearby seeds (any pair, not just adjacent)
    const maxConnect = 260;
    const maxConnect2 = maxConnect * maxConnect;
    for (let i = 0; i < seedPoints.length; i++) {
      const a = seedPoints[i];
      for (let j = i + 1; j < seedPoints.length; j++) {
        const b = seedPoints[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxConnect2) continue;
        if (rng.next() > 0.32) continue; // sparse interconnects
        const midX = (a.x + b.x) / 2 + rng.range(-50, 50);
        const midY = (a.y + b.y) / 2 + rng.range(-30, 70); // mild downward dip
        drawGlowBezier(
          sctx,
          [
            a.x,
            a.y,
            a.x + (midX - a.x) * 0.5,
            a.y + (midY - a.y) * 0.4,
            midX + (b.x - midX) * 0.4,
            midY + (b.y - midY) * 0.5,
            b.x,
            b.y,
          ],
          rng.next() < 0.7 ? "#6B2FA0" : "#8C82C8",
          rng.range(0.5, 1.1),
          4,
          rng.range(0.14, 0.26),
          light,
        );
      }
    }

    // Background capillary fibers — count tracks seed density so the
    // ambient texture scales with viewport (not a fixed number)
    const capCount = Math.floor(seedPoints.length * 2);
    for (let i = 0; i < capCount; i++) {
      const fx = rng.range(0, W);
      const fy = rng.range(0, stripH);
      const fAngle = rng.range(0, Math.PI * 2);
      const fLen = rng.range(25, 70);
      root(
        fx,
        fy,
        fAngle,
        fLen,
        rng.range(0.4, 0.85),
        3,
        rng.next() < 0.6 ? "#6B2FA0" : "#8C82C8",
        rng.range(0.12, 0.22),
      );
    }
  }

  // Drifting spore particles — gentle ambient motion
  const particles = [];
  const rngP = createRand(211);
  const dustC = ["#8C82C8", "#6B2FA0", "#FFA366", "#FFD4A8"];
  for (let i = 0; i < 180; i++) {
    particles.push({
      x: rngP.range(0, W),
      y: rngP.range(0, H),
      r: rngP.range(0.3, 1.2),
      vx: rngP.range(-0.04, 0.04),
      vy: rngP.range(0.02, 0.1),
      color: dustC[Math.floor(rngP.next() * dustC.length)],
      alpha: rngP.range(0.04, 0.15),
      phase: rngP.next() * Math.PI * 2,
    });
  }

  buildStatic();
  window._heroRebuild = function () {
    builtTheme = null;
    buildStatic();
  };

  // Flowing nutrient pulses spawn at random seed bulbs throughout the strip
  let flows = [];
  let lastFlow = 0;

  function spawnFlow() {
    if (!seedPoints.length) return;
    const seed = seedPoints[Math.floor(Math.random() * seedPoints.length)];
    flows.push({
      x: seed.x + (Math.random() - 0.5) * 14,
      y: seed.y,
      vy: 60 + Math.random() * 50,
      vx: (Math.random() - 0.5) * 30,
      life: 0,
      maxLife: 5 + Math.random() * 4,
      color: Math.random() < 0.72 ? "#FFA366" : "#8C82C8",
    });
  }

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

    const light = isLightMode();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollRatio = (scrollY * 0.7) / Math.max(1, docH - H);
    const srcY = scrollRatio * (stripH - H);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(staticCanvas, 0, srcY * dpr, W * dpr, H * dpr, 0, 0, W, H);

    // Drifting spore particles (viewport-local)
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

    // Spawn + animate flowing nutrients (world-space coords, drawn relative to srcY)
    if (timestamp - lastFlow > 280 && flows.length < 60) {
      lastFlow = timestamp;
      spawnFlow();
      if (Math.random() < 0.5) spawnFlow();
    }
    for (let i = flows.length - 1; i >= 0; i--) {
      const f = flows[i];
      f.x += f.vx * dt + Math.sin(t * 0.5 + i) * 0.4;
      f.y += f.vy * dt;
      f.life += dt;
      if (f.life > f.maxLife || f.y > stripH) {
        flows.splice(i, 1);
        continue;
      }
      const screenY = f.y - srcY;
      if (screenY < -20 || screenY > H + 20) continue;
      const lr = f.life / f.maxLife;
      const alpha = lr < 0.15 ? lr / 0.15 : lr > 0.85 ? (1 - lr) / 0.15 : 1;
      ctx.fillStyle = rgba(f.color, alpha * 0.35);
      ctx.beginPath();
      ctx.arc(f.x, screenY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(f.color, alpha * 0.55);
      ctx.beginPath();
      ctx.arc(f.x, screenY, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(light ? "#C45A08" : "#FFF8EE", alpha * 0.9);
      ctx.beginPath();
      ctx.arc(f.x, screenY, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pulsing nodes — only those visible in current scroll window
    nodes.forEach((n) => {
      const screenY = n.y - srcY;
      if (screenY < -100 || screenY > H + 100) return;
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.8 + n.phase);
      const pr =
        n.r *
        (n.isSeed
          ? 1.4 + Math.sin(t * 0.6 + n.phase) * 0.3
          : 2 + Math.sin(t * 0.7 + n.phase));
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
