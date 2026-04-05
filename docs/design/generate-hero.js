const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");

const W = 680,
  H = 800;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

let seed = 42;
function rand() {
  seed = (seed * 16807 + 0) % 2147483647;
  return seed / 2147483647;
}
function randRange(a, b) {
  return a + rand() * (b - a);
}

function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// --- BACKGROUND with subtle gradient ---
const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
bgGrad.addColorStop(0, "#0B0818");
bgGrad.addColorStop(0.5, "#0D0A1A");
bgGrad.addColorStop(1, "#0E0B1E");
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// First grain pass — coarse
const grainData = ctx.getImageData(0, 0, W, H);
for (let i = 0; i < grainData.data.length; i += 4) {
  const noise = (rand() - 0.5) * 14;
  grainData.data[i] = Math.max(0, Math.min(255, grainData.data[i] + noise));
  grainData.data[i + 1] = Math.max(
    0,
    Math.min(255, grainData.data[i + 1] + noise),
  );
  grainData.data[i + 2] = Math.max(
    0,
    Math.min(255, grainData.data[i + 2] + noise),
  );
}
ctx.putImageData(grainData, 0, 0);

// --- GLOWING BEZIER with layered halos ---
function glowBezier(pts, color, width, glowRadius, opacity) {
  // Wide atmospheric halo
  for (let r = glowRadius * 2; r > glowRadius; r -= 2) {
    const a = opacity * 0.02 * (1 - (r - glowRadius) / glowRadius);
    ctx.strokeStyle = colorWithAlpha(color, a);
    ctx.lineWidth = width + r * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    ctx.stroke();
  }
  // Inner glow
  for (let r = glowRadius; r > 0; r -= 0.6) {
    const a = opacity * (1 - r / glowRadius) * 0.1;
    ctx.strokeStyle = colorWithAlpha(color, a);
    ctx.lineWidth = width + r * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    ctx.stroke();
  }
  // Core
  ctx.strokeStyle = colorWithAlpha(color, opacity * 0.9);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  ctx.stroke();
  // Hot core (brighter, thinner)
  ctx.strokeStyle = colorWithAlpha("#FFD4A8", opacity * 0.4);
  ctx.lineWidth = width * 0.4;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  ctx.stroke();
}

// --- GLOWING NODE with chromatic shift ---
function glowNode(x, y, radius, color, opacity) {
  // Distant atmospheric halo
  for (let r = radius * 10; r > radius * 3; r -= 2) {
    const a = opacity * 0.008 * (1 - (r - radius * 3) / (radius * 7));
    ctx.fillStyle = colorWithAlpha(color, a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mid glow — chromatic shift to warmer
  for (let r = radius * 4; r > radius; r -= 0.8) {
    const t = (r - radius) / (radius * 3);
    const a = opacity * 0.06 * (1 - t);
    ctx.fillStyle = colorWithAlpha("#FFB366", a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Inner concentrated glow
  for (let r = radius * 1.5; r > 0; r -= 0.3) {
    const a = opacity * 0.2 * (1 - r / (radius * 1.5));
    ctx.fillStyle = colorWithAlpha(color, a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // White-hot core
  ctx.fillStyle = colorWithAlpha("#FFF8EE", opacity * 0.85);
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// --- RECURSIVE BRANCHING ---
function branch(x, y, angle, length, width, depth, color, opacity) {
  if (depth <= 0 || width < 0.12 || length < 3) return;

  const jitter = randRange(-0.15, 0.15);
  const endX = x + Math.cos(angle + jitter) * length;
  const endY = y + Math.sin(angle + jitter) * length;

  const cx1 = x + Math.cos(angle + randRange(-0.4, 0.4)) * length * 0.35;
  const cy1 = y + Math.sin(angle + randRange(-0.4, 0.4)) * length * 0.35;
  const cx2 = x + Math.cos(angle + randRange(-0.25, 0.25)) * length * 0.7;
  const cy2 = y + Math.sin(angle + randRange(-0.25, 0.25)) * length * 0.7;

  const glowR = Math.max(3, width * 4);
  glowBezier(
    [x, y, cx1, cy1, cx2, cy2, endX, endY],
    color,
    width,
    glowR,
    opacity,
  );

  if (depth <= 2) {
    glowNode(endX, endY, Math.max(0.8, width * 0.6), color, opacity * 0.6);
  }

  const numBranches =
    depth > 4 ? Math.floor(randRange(2, 5)) : Math.floor(randRange(1, 4));
  for (let i = 0; i < numBranches; i++) {
    const spread = depth > 3 ? randRange(0.25, 0.7) : randRange(0.3, 1.0);
    const newAngle = angle + randRange(-spread, spread);
    const newLength = length * randRange(0.45, 0.78);
    const newWidth = width * randRange(0.45, 0.72);
    const newOpacity = opacity * randRange(0.55, 0.82);

    let newColor = color;
    if (depth <= 3 && rand() < 0.2) newColor = "#6B2FA0";
    else if (rand() < 0.35)
      newColor = newColor === "#E87722" ? "#FFA366" : "#E87722";

    branch(
      endX,
      endY,
      newAngle,
      newLength,
      newWidth,
      depth - 1,
      newColor,
      newOpacity,
    );
  }
}

// --- DEEP AMBIENT GLOW ---
const amb1 = ctx.createRadialGradient(265, 380, 0, 265, 380, 280);
amb1.addColorStop(0, "rgba(232,119,34,0.07)");
amb1.addColorStop(0.3, "rgba(255,163,102,0.03)");
amb1.addColorStop(0.6, "rgba(107,47,160,0.015)");
amb1.addColorStop(1, "rgba(14,0,39,0)");
ctx.fillStyle = amb1;
ctx.fillRect(0, 0, W, H);

const amb2 = ctx.createRadialGradient(350, 180, 0, 350, 180, 200);
amb2.addColorStop(0, "rgba(255,163,102,0.04)");
amb2.addColorStop(1, "rgba(14,0,39,0)");
ctx.fillStyle = amb2;
ctx.fillRect(0, 0, W, H);

// --- MAIN TRUNK SYSTEM ---
// Primary artery
glowBezier([268, 800, 265, 700, 262, 600, 264, 480], "#E87722", 5, 22, 0.6);
glowBezier([264, 480, 264, 420, 265, 370, 268, 340], "#E87722", 4.5, 20, 0.55);
glowBezier([268, 340, 275, 290, 288, 250, 305, 225], "#E87722", 3.8, 16, 0.5);
glowBezier([305, 225, 328, 200, 352, 182, 378, 170], "#FFA366", 3, 12, 0.45);

// Secondary strand — slightly offset
glowBezier([275, 800, 272, 710, 265, 620, 258, 520], "#FFA366", 2.8, 12, 0.35);
glowBezier([258, 520, 252, 440, 250, 370, 255, 310], "#FFA366", 2.2, 10, 0.3);

// Tertiary wisp
glowBezier([260, 800, 255, 730, 258, 660, 262, 580], "#E87722", 1.5, 7, 0.2);
glowBezier([262, 580, 258, 520, 255, 460, 260, 400], "#E87722", 1.2, 5, 0.15);

// --- PRIMARY HUB NODE ---
glowNode(265, 385, 8, "#FFA366", 1.0);

// --- SECONDARY HUBS ---
glowNode(378, 170, 6, "#FFA366", 0.8);
glowNode(305, 225, 5, "#E87722", 0.7);
glowNode(258, 500, 4.5, "#FFA366", 0.6);
glowNode(268, 300, 4, "#E87722", 0.55);

// --- BRANCHING FROM PRIMARY HUB ---
branch(265, 385, -0.3, 130, 3.2, 6, "#E87722", 0.5);
branch(265, 385, -0.7, 110, 2.8, 6, "#FFA366", 0.45);
branch(265, 385, 0.2, 120, 2.5, 5, "#E87722", 0.4);
branch(265, 385, 0.6, 100, 2.2, 5, "#FFA366", 0.35);
branch(265, 385, Math.PI - 0.3, 100, 2.2, 5, "#FFA366", 0.3);
branch(265, 385, Math.PI + 0.4, 80, 1.8, 4, "#6B2FA0", 0.2);
branch(265, 385, Math.PI - 0.8, 70, 1.5, 3, "#6B2FA0", 0.15);

// --- BRANCHING FROM UPPER HUB ---
branch(378, 170, -0.5, 110, 2.5, 5, "#FFA366", 0.45);
branch(378, 170, -0.1, 130, 2.2, 5, "#E87722", 0.4);
branch(378, 170, -1.0, 90, 2, 4, "#FFA366", 0.35);
branch(378, 170, -1.5, 70, 1.5, 3, "#E87722", 0.25);
branch(378, 170, 0.4, 100, 2, 4, "#E87722", 0.3);
branch(378, 170, 0.9, 80, 1.5, 3, "#FFA366", 0.2);

// --- BRANCHING FROM MID HUBS ---
branch(305, 225, -0.4, 100, 2.2, 5, "#E87722", 0.4);
branch(305, 225, 0.7, 80, 1.8, 4, "#FFA366", 0.3);
branch(305, 225, Math.PI - 0.5, 70, 1.5, 3, "#6B2FA0", 0.18);
branch(305, 225, -1.2, 60, 1.3, 3, "#FFA366", 0.22);

branch(268, 300, -0.3, 80, 1.8, 4, "#E87722", 0.3);
branch(268, 300, 0.5, 70, 1.5, 3, "#FFA366", 0.25);
branch(268, 300, Math.PI + 0.3, 60, 1.2, 3, "#6B2FA0", 0.15);

// --- LOWER BRANCHING ---
branch(258, 500, 0.3, 110, 2.2, 5, "#FFA366", 0.35);
branch(258, 500, -0.5, 90, 1.8, 4, "#E87722", 0.28);
branch(258, 500, 0.9, 80, 1.5, 4, "#E87722", 0.22);
branch(258, 500, Math.PI + 0.2, 90, 2, 4, "#FFA366", 0.25);
branch(258, 500, Math.PI - 0.6, 70, 1.3, 3, "#6B2FA0", 0.15);

branch(262, 620, 0.4, 80, 1.5, 3, "#E87722", 0.2);
branch(262, 620, -0.6, 70, 1.2, 3, "#FFA366", 0.15);
branch(262, 620, Math.PI + 0.5, 60, 1, 2, "#FFA366", 0.12);

branch(265, 720, 0.3, 60, 1, 2, "#E87722", 0.12);
branch(265, 720, -0.4, 50, 0.8, 2, "#FFA366", 0.1);

// --- ATMOSPHERIC DUST FIELD ---
const dustColors = ["#FFA366", "#E87722", "#6B2FA0", "#8C82C8", "#FFD4A8"];
for (let i = 0; i < 350; i++) {
  const dx = randRange(0, W);
  const dy = randRange(0, H);
  const dr = randRange(0.2, 1.4);
  const da = randRange(0.015, 0.08);
  const dc = dustColors[Math.floor(rand() * dustColors.length)];
  ctx.fillStyle = colorWithAlpha(dc, da);
  ctx.beginPath();
  ctx.arc(dx, dy, dr, 0, Math.PI * 2);
  ctx.fill();
}

// Denser spores near the active zone
for (let i = 0; i < 150; i++) {
  const dx = randRange(120, 520);
  const dy = randRange(80, 600);
  const dr = randRange(0.3, 1.8);
  const da = randRange(0.02, 0.1);
  ctx.fillStyle = colorWithAlpha("#FFA366", da);
  ctx.beginPath();
  ctx.arc(dx, dy, dr, 0, Math.PI * 2);
  ctx.fill();
}

// --- FINAL GRAIN REFINEMENT ---
const finalData = ctx.getImageData(0, 0, W, H);
for (let i = 0; i < finalData.data.length; i += 4) {
  const n = (rand() - 0.5) * 6;
  finalData.data[i] = Math.max(0, Math.min(255, finalData.data[i] + n));
  finalData.data[i + 1] = Math.max(0, Math.min(255, finalData.data[i + 1] + n));
  finalData.data[i + 2] = Math.max(0, Math.min(255, finalData.data[i + 2] + n));
}
ctx.putImageData(finalData, 0, 0);

// --- OUTPUT ---
const buffer = canvas.toBuffer("image/png");
const outPath =
  "/home/yeehaa/Documents/brains/docs/design/hero-illustration.png";
fs.writeFileSync(outPath, buffer);
console.log(`Written: ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
