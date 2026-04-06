(function () {
  const canvas = document.getElementById("heroCanvas");
  if (!canvas) return;
  let W = window.innerWidth,
    H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  let stars = [];
  let packets = []; // energy traveling between connected stars
  let shooters = []; // shooting stars
  let theme = null;
  let lastPacket = 0;
  let lastShooter = 0;
  let lastFlare = 0;

  function build() {
    theme = isLightMode();
    stars = [];
    packets = [];
    shooters = [];
    const rng = createRand(42);
    const count = Math.floor((W * H) / 8500);
    for (let i = 0; i < count; i++) {
      const tier = rng.next();
      stars.push({
        x: rng.range(0, W),
        y: rng.range(0, H),
        r:
          tier < 0.7
            ? rng.range(0.4, 1.0)
            : tier < 0.95
              ? rng.range(1.0, 1.8)
              : rng.range(1.8, 2.6),
        vx: rng.range(-0.35, 0.35),
        vy: rng.range(-0.3, 0.2),
        phase: rng.next() * Math.PI * 2,
        speed: rng.range(0.5, 1.5),
        color:
          rng.next() < 0.6
            ? "#FFD4A8"
            : rng.next() < 0.55
              ? "#FFA366"
              : "#8C82C8",
        baseAlpha: rng.range(0.3, 0.78),
        flare: 0, // 0..1, decays over time when set
      });
    }
  }

  function spawnPacket() {
    if (stars.length < 2) return;
    // Pick a random star, then a neighbor within connection range
    const maxD = Math.min(W, H) * 0.13;
    const maxD2 = maxD * maxD;
    let tries = 12;
    while (tries-- > 0) {
      const i = Math.floor(Math.random() * stars.length);
      const a = stars[i];
      // Find a connected neighbor
      const neighbors = [];
      for (let j = 0; j < stars.length; j++) {
        if (j === i) continue;
        const b = stars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < maxD2) neighbors.push(j);
      }
      if (!neighbors.length) continue;
      const to = neighbors[Math.floor(Math.random() * neighbors.length)];
      packets.push({
        from: i,
        to,
        progress: 0,
        speed: 0.7 + Math.random() * 0.6,
        color: Math.random() < 0.7 ? "#FFD4A8" : "#8C82C8",
      });
      return;
    }
  }

  function spawnShooter() {
    // Origin somewhere along top/left edge, direction toward bottom-right-ish
    const fromTop = Math.random() < 0.5;
    const startX = fromTop ? Math.random() * W : -40;
    const startY = fromTop ? -40 : Math.random() * H * 0.6;
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5; // ~45° + jitter
    const speed = 380 + Math.random() * 220; // px/sec
    shooters.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 1.0 + Math.random() * 0.6,
    });
  }

  function triggerFlare() {
    if (!stars.length) return;
    // Prefer larger stars for flares so it reads more clearly
    const candidates = stars.filter((s) => s.r > 1.0);
    const pool = candidates.length ? candidates : stars;
    const s = pool[Math.floor(Math.random() * pool.length)];
    s.flare = 1.0;
  }

  build();
  window._heroRebuild = function () {
    build();
  };

  let t = 0,
    last = 0;
  function frame(ts) {
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
    last = ts;
    t += dt;

    const light = isLightMode();
    if (light !== theme) build();

    ctx.clearRect(0, 0, W, H);

    // Drift with gentle random walk on velocity
    const maxV = 0.55;
    for (const s of stars) {
      // Tiny random nudge each frame so stars don't move in perfect straight lines
      s.vx += (Math.random() - 0.5) * 0.012;
      s.vy += (Math.random() - 0.5) * 0.012;
      // Soft clamp so velocities stay bounded
      if (s.vx > maxV) s.vx = maxV;
      else if (s.vx < -maxV) s.vx = -maxV;
      if (s.vy > maxV) s.vy = maxV;
      else if (s.vy < -maxV) s.vy = -maxV;
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < -10) s.x = W + 10;
      else if (s.x > W + 10) s.x = -10;
      if (s.y < -10) s.y = H + 10;
      else if (s.y > H + 10) s.y = -10;
      if (s.flare > 0) s.flare = Math.max(0, s.flare - dt * 0.9);
    }

    // Connection lines (nearest-neighbor mesh)
    const maxD = Math.min(W, H) * 0.13;
    const maxD2 = maxD * maxD;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxD2) {
          const f = 1 - d2 / maxD2;
          const op = f * f * (light ? 0.32 : 0.22);
          ctx.strokeStyle = rgba(light ? "#C45A08" : "#FFD4A8", op);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Spawn + animate packets along connection lines
    if (ts - lastPacket > 180 && packets.length < 28) {
      lastPacket = ts;
      spawnPacket();
      if (Math.random() < 0.4) spawnPacket();
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      const a = stars[p.from],
        b = stars[p.to];
      if (!a || !b) {
        packets.splice(i, 1);
        continue;
      }
      p.progress += dt * p.speed;
      if (p.progress >= 1) {
        // On arrival, occasionally flare the destination star
        if (Math.random() < 0.18) b.flare = Math.max(b.flare, 0.7);
        packets.splice(i, 1);
        continue;
      }
      // Smooth easing for a more "energy traveling" feel
      const e = p.progress * p.progress * (3 - 2 * p.progress);
      const px = a.x + (b.x - a.x) * e;
      const py = a.y + (b.y - a.y) * e;
      // Fade in/out at ends
      const fade = Math.sin(p.progress * Math.PI);
      ctx.fillStyle = rgba(p.color, (light ? 0.55 : 0.42) * fade);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(light ? "#C45A08" : "#FFF8EE", 0.85 * fade);
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trigger random flares (separate from packet-induced ones)
    if (ts - lastFlare > 1400 && Math.random() < 0.35) {
      lastFlare = ts;
      triggerFlare();
    }

    // Spawn + animate shooting stars
    if (ts - lastShooter > 4500 && Math.random() < 0.4) {
      lastShooter = ts;
      spawnShooter();
    }
    for (let i = shooters.length - 1; i >= 0; i--) {
      const sh = shooters[i];
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life += dt;
      if (sh.life > sh.maxLife || sh.x > W + 80 || sh.y > H + 80) {
        shooters.splice(i, 1);
        continue;
      }
      const lifeRatio = sh.life / sh.maxLife;
      // Tail
      const tailLen = 90;
      const tx = sh.x - Math.cos(Math.atan2(sh.vy, sh.vx)) * tailLen;
      const ty = sh.y - Math.sin(Math.atan2(sh.vy, sh.vx)) * tailLen;
      const grad = ctx.createLinearGradient(tx, ty, sh.x, sh.y);
      const alpha = (1 - lifeRatio) * (light ? 0.85 : 0.85);
      grad.addColorStop(0, rgba(light ? "#C45A08" : "#FFD4A8", 0));
      grad.addColorStop(1, rgba(light ? "#C45A08" : "#FFF8EE", alpha));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sh.x, sh.y);
      ctx.stroke();
      // Bright head
      ctx.fillStyle = rgba(light ? "#C45A08" : "#FFF8EE", alpha);
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Soft halo
      ctx.fillStyle = rgba(light ? "#E87722" : "#FFD4A8", alpha * 0.25);
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars on top with twinkle (+ flare boost)
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      const flareBoost = 1 + s.flare * 2.2;
      const a = s.baseAlpha * tw * flareBoost;
      const haloR = s.r * (4 + s.flare * 6);
      // halo
      ctx.fillStyle = rgba(s.color, Math.min(1, a) * (light ? 0.22 : 0.18));
      ctx.beginPath();
      ctx.arc(s.x, s.y, haloR, 0, Math.PI * 2);
      ctx.fill();
      // core
      ctx.fillStyle = rgba(light ? "#C45A08" : s.color, Math.min(1, a));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (1 + s.flare * 0.6), 0, Math.PI * 2);
      ctx.fill();
      // hot center for flaring stars
      if (s.flare > 0.05) {
        ctx.fillStyle = rgba("#FFF8EE", s.flare * 0.9);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener("resize", () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    build();
  });
})();
