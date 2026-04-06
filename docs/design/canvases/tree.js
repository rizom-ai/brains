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
  // Captured at build time so the animation loop can send pulses along them
  let trunkPath = [];
  let branchPaths = []; // each entry: [x0,y0,c1x,c1y,c2x,c2y,x1,y1]

  function buildStatic() {
    const light = isLightMode();
    if (builtTheme === light) return;
    builtTheme = light;
    nodes = [];
    trunkPath = [];
    branchPaths = [];
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
      // Capture substantial branches so the animation loop can run
      // sap pulses along their bezier curves
      if (w >= 1.4) {
        branchPaths.push([x, y, c1x, c1y, c2x, c2y, ex, ey]);
      }
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
    // Snapshot the trunk polyline for the animation loop to traverse
    trunkPath = trunkPoints.slice();

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

  // Sap pulses traveling along trunk and branches
  const pulses = [];
  let lastPulseSpawn = 0;
  let lastFlareSpawn = 0;

  function spawnTrunkPulse() {
    if (trunkPath.length < 2) return;
    pulses.push({
      type: "trunk",
      seg: 0,
      progress: 0,
      speed: 0.8 + Math.random() * 0.55,
      color: Math.random() < 0.6 ? "#FFA366" : "#FFD4A8",
    });
  }

  function spawnBranchPulse() {
    if (!branchPaths.length) return;
    pulses.push({
      type: "branch",
      pathIdx: Math.floor(Math.random() * branchPaths.length),
      progress: 0,
      speed: 0.9 + Math.random() * 0.75,
      color: Math.random() < 0.7 ? "#FFA366" : "#E87722",
    });
  }

  function bezierPoint(p, u) {
    const mu = 1 - u;
    const mu2 = mu * mu;
    const u2 = u * u;
    return [
      mu2 * mu * p[0] + 3 * mu2 * u * p[2] + 3 * mu * u2 * p[4] + u2 * u * p[6],
      mu2 * mu * p[1] + 3 * mu2 * u * p[3] + 3 * mu * u2 * p[5] + u2 * u * p[7],
    ];
  }

  // Released spores — bright motes that drift outward from random visible
  // tree nodes, biased toward the empty side of the canvas so the whole
  // viewport gets ambient motion (not just the right side where the tree lives)
  const spores = [];
  let lastSporeRelease = 0;

  function releaseSpore(srcY) {
    // Only spawn from nodes near the trunk axis so spores genuinely
    // radiate from the spine, not from arbitrary branch tips
    const trunkRange = 90;
    const candidates = [];
    for (const n of nodes) {
      const sy = n.y - srcY;
      if (sy > -50 && sy < H + 50 && Math.abs(n.x - trunkX) < trunkRange) {
        candidates.push(n);
      }
    }
    if (!candidates.length) return;
    const n = candidates[Math.floor(Math.random() * candidates.length)];
    // Mostly leftward drift (outward into empty space) with some up/down spread
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.75;
    const speed = 14 + Math.random() * 18;
    spores.push({
      x: n.x,
      y: n.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      maxAge: 5 + Math.random() * 3,
      color: Math.random() < 0.7 ? "#FFA366" : "#FFD4A8",
      r: 0.9 + Math.random() * 0.8,
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

    // Spawn sap pulses — trunk pulses bring life up the spine,
    // branch pulses scatter through the limbs.
    // Tuned for the ai site's kinetic energy: shorter interval, higher
    // probability, occasional triple branch spawns.
    if (timestamp - lastPulseSpawn > 200) {
      lastPulseSpawn = timestamp;
      if (Math.random() < 0.7) spawnTrunkPulse();
      if (Math.random() < 0.95) spawnBranchPulse();
      if (Math.random() < 0.55) spawnBranchPulse();
      if (Math.random() < 0.3) spawnBranchPulse();
    }

    // Animate + draw pulses (world-space coords, drawn relative to srcY)
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.progress += dt * p.speed;
      let px = 0,
        py = 0,
        alive = true;
      if (p.type === "trunk") {
        if (p.progress >= 1) {
          // Often fork onto a branch when arriving at a junction
          if (Math.random() < 0.55) spawnBranchPulse();
          p.seg++;
          p.progress = 0;
          if (p.seg >= trunkPath.length - 1) {
            alive = false;
          }
        }
        if (alive) {
          const a = trunkPath[p.seg];
          const b = trunkPath[p.seg + 1];
          const e = p.progress * p.progress * (3 - 2 * p.progress);
          px = a.x + (b.x - a.x) * e;
          py = a.y + (b.y - a.y) * e;
        }
      } else {
        if (p.progress >= 1) {
          alive = false;
        }
        if (alive) {
          const path = branchPaths[p.pathIdx];
          const pt = bezierPoint(path, p.progress);
          px = pt[0];
          py = pt[1];
        }
      }
      if (!alive) {
        pulses.splice(i, 1);
        continue;
      }
      const screenY = py - srcY;
      if (screenY < -20 || screenY > H + 20) continue;
      const fade = Math.sin(p.progress * Math.PI); // fade in + out at endpoints
      ctx.fillStyle = rgba(p.color, (light ? 0.32 : 0.42) * fade);
      ctx.beginPath();
      ctx.arc(px, screenY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(p.color, (light ? 0.5 : 0.6) * fade);
      ctx.beginPath();
      ctx.arc(px, screenY, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(light ? "#C45A08" : "#FFF8EE", 0.85 * fade);
      ctx.beginPath();
      ctx.arc(px, screenY, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spawn + animate drifting spores released from the tree
    if (timestamp - lastSporeRelease > 200) {
      lastSporeRelease = timestamp;
      releaseSpore(srcY);
      if (Math.random() < 0.85) releaseSpore(srcY);
      if (Math.random() < 0.35) releaseSpore(srcY);
    }
    for (let i = spores.length - 1; i >= 0; i--) {
      const sp = spores[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 4 * dt; // gentle gravity
      sp.age += dt;
      if (sp.age > sp.maxAge) {
        spores.splice(i, 1);
        continue;
      }
      const screenY = sp.y - srcY;
      if (screenY < -20 || screenY > H + 20 || sp.x < -20 || sp.x > W + 20)
        continue;
      const lr = sp.age / sp.maxAge;
      const alpha =
        lr < 0.1 ? lr / 0.1 : lr > 0.7 ? Math.max(0, (1 - lr) / 0.3) : 1;
      ctx.fillStyle = rgba(sp.color, alpha * 0.18);
      ctx.beginPath();
      ctx.arc(sp.x, screenY, sp.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(light ? "#C45A08" : sp.color, alpha * 0.85);
      ctx.beginPath();
      ctx.arc(sp.x, screenY, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trigger random flares on visible mid+large nodes
    if (timestamp - lastFlareSpawn > 600 && Math.random() < 0.7) {
      lastFlareSpawn = timestamp;
      const candidates = [];
      for (const n of nodes) {
        const sy = n.y - srcY;
        if (sy > -50 && sy < H + 50 && n.r > 1.5) candidates.push(n);
      }
      if (candidates.length) {
        const n = candidates[Math.floor(Math.random() * candidates.length)];
        n.flare = 1.0;
      }
    }

    // Pulsing nodes (with optional flare boost) — only visible window
    nodes.forEach((n) => {
      if (n.flare > 0) n.flare = Math.max(0, n.flare - dt * 0.85);
      const screenY = n.y - srcY;
      if (screenY < -100 || screenY > H + 100) return;
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.2 + n.phase);
      const flareBoost = 1 + (n.flare || 0) * 2.5;
      const pr = n.r * (2 + Math.sin(t * 0.7 + n.phase)) * flareBoost;
      ctx.fillStyle = rgba(n.color, n.op * 0.1 * pulse * flareBoost);
      ctx.beginPath();
      ctx.arc(n.x, screenY, pr * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba("#FFD4A8", n.op * 0.12 * pulse * flareBoost);
      ctx.beginPath();
      ctx.arc(n.x, screenY, pr * 2, 0, Math.PI * 2);
      ctx.fill();
      if (n.flare > 0.05) {
        ctx.fillStyle = rgba("#FFF8EE", n.flare * 0.9);
        ctx.beginPath();
        ctx.arc(n.x, screenY, n.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
