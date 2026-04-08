/*
 * Shared globals + helpers used by tree / constellation / roots canvas
 * scripts. Concatenated in front of each variant canvas at site-package
 * load time (see sites/rizom/src/index.ts) so the variant canvases
 * stay byte-equivalent to docs/design/canvases/ and can be re-synced
 * from the design source without merge conflicts.
 *
 * One difference from the design mock: `isLightMode()` reads the
 * brain's `[data-theme="light"]` attribute on documentElement instead
 * of the mock's `body.classList.contains('light')` — the brain's
 * theme toggle uses the data-attribute convention.
 */

function createRand(seed) {
  let s = seed;
  return {
    next() {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    },
    range(a, b) {
      return a + this.next() * (b - a);
    },
  };
}

// Brand palette — resolved from CSS custom properties on :root at
// load time so theme-rizom/src/theme.css stays the single source of
// truth. Each slot falls back to a hardcoded default if the CSS var
// isn't available yet (first-paint edge case, test sandbox, etc.).
//
// WARM + CORE are NOT brand tokens — they're canvas-only particle
// colors (warm halo, bright core highlight) that live here because
// they only have meaning inside the glow rendering, not in the rest
// of the site UI.
function readPaletteFromCSS() {
  const defaults = {
    AMBER: "#E87722",
    AMBER_LT: "#FFA366",
    AMBER_DK: "#C45A08",
    GLOW: "#FFD4A8",
    PURPLE: "#6B2FA0",
    PURPLE_LT: "#8C82C8",
    PURPLE_MU: "#818CF8",
    WHITE: "#FFFFFF",
    BG_DEEP: "#0D0A1A",
  };
  const varMap = {
    AMBER: "--palette-amber",
    AMBER_LT: "--palette-amber-light",
    AMBER_DK: "--palette-amber-dark",
    GLOW: "--palette-amber-glow",
    PURPLE: "--palette-purple",
    PURPLE_LT: "--palette-purple-light",
    PURPLE_MU: "--palette-purple-muted",
    WHITE: "--palette-white",
    BG_DEEP: "--palette-bg-deep",
  };
  const out = {};
  let cs;
  try {
    cs = window.getComputedStyle(document.documentElement);
  } catch (_e) {
    cs = null;
  }
  for (const key in varMap) {
    const cssName = varMap[key];
    let value = "";
    if (cs) {
      try {
        value = (cs.getPropertyValue(cssName) || "").trim();
      } catch (_e) {
        value = "";
      }
    }
    out[key] = value || defaults[key];
  }
  // Canvas-only non-brand colors — always hardcoded.
  out.WARM = "#FFB366";
  out.CORE = "#FFF8EE";
  return out;
}

const C = readPaletteFromCSS();

const _rgbCache = {};
function parseHex(hex) {
  if (_rgbCache[hex]) return _rgbCache[hex];
  const v = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  _rgbCache[hex] = v;
  return v;
}

function rgba(hex, a) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

// Brain convention: dark mode is the default; `[data-theme="light"]`
// on <html> opts into light mode. Mock used `body.classList.contains('light')`.
function isLightMode() {
  return document.documentElement.getAttribute("data-theme") === "light";
}

const dpr = window.devicePixelRatio || 1;

function drawGlowBezier(ctx, pts, color, w, glowR, op, light) {
  if (light) {
    // Light mode: ink-like strokes with denser halo
    for (let r = glowR * 0.7; r > 0; r -= Math.max(0.5, glowR / 12)) {
      ctx.strokeStyle = rgba(color, op * (1 - r / (glowR * 0.7)) * 0.07);
      ctx.lineWidth = w + r * 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(color, op * 0.65);
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    ctx.stroke();
  } else {
    // Dark mode: full glow
    for (let r = glowR; r > 0; r -= Math.max(0.5, glowR / 20)) {
      ctx.strokeStyle = rgba(color, op * (1 - r / glowR) * 0.08);
      ctx.lineWidth = w + r * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(color, op * 0.8);
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    ctx.stroke();
    ctx.strokeStyle = rgba(C.GLOW, op * 0.3);
    ctx.lineWidth = w * 0.35;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    ctx.stroke();
  }
}

function drawGlowNode(ctx, x, y, r, color, op, light) {
  if (light) {
    // Light mode: solid dots with richer spread
    for (let i = r * 4; i > r; i -= 0.8) {
      ctx.fillStyle = rgba(color, op * 0.05 * (1 - (i - r) / (r * 3)));
      ctx.beginPath();
      ctx.arc(x, y, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(color, op * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(color, op * 0.95);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Dark mode: full glow halos
    for (let i = r * 8; i > r; i -= 1.5) {
      ctx.fillStyle = rgba(color, op * 0.01 * (1 - (i - r) / (r * 7)));
      ctx.beginPath();
      ctx.arc(x, y, i, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = r * 2; i > 0; i -= 0.4) {
      ctx.fillStyle = rgba(C.WARM, op * 0.08 * (1 - i / (r * 2)));
      ctx.beginPath();
      ctx.arc(x, y, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(C.CORE, op * 0.85);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
