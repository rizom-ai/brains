/**
 * The field's model: the lights, where the drawing stands, which chapter the
 * reader is in and where each light sits in the region. These are pure, so
 * they are tested here and inlined into the shipped script (see ./script);
 * each names nothing from this module but the other functions inlined with
 * it, and only by their own names.
 */

/** One light in the field: a place in the region, its flicker, its size, whether it is warm, and when the pipeline takes it. */
export interface Light {
  ang: number;
  rad: number;
  ph: number;
  size: number;
  warm: boolean;
  rank: number;
}

/** Where the drawing stands on the screen. */
export interface Stage {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  R: number;
  phone: boolean;
}

/** A seeded random stream (mulberry32), so the field lands the same way every time. */
export function mulberry(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The region's lights; about a quarter are warm, and the warm ones are ranked first. */
export function seedLights(count: number, seed: number): Light[] {
  const rand = mulberry(seed);
  const lights = Array.from({ length: count }, function make() {
    return {
      ang: rand() * Math.PI * 2,
      rad: Math.sqrt(rand()),
      ph: rand() * Math.PI * 2,
      size: 1.2 + rand() * 2.1,
      warm: rand() < 0.24,
      rank: 0,
      key: rand(),
    };
  });
  lights
    .map(function index(light, i) {
      return { light: light, i: i };
    })
    .sort(function order(a, b) {
      return (
        Number(b.light.warm) - Number(a.light.warm) || a.light.key - b.light.key
      );
    })
    .forEach(function rank(entry, k) {
      entry.light.rank = k;
    });
  return lights.map(function strip(light) {
    return {
      ang: light.ang,
      rad: light.rad,
      ph: light.ph,
      size: light.size,
      warm: light.warm,
      rank: light.rank,
    };
  });
}

/** Each light's k nearest neighbors in the region, as pairs listed once, lower index first. */
export function nearestPairs(lights: Light[], k: number): [number, number][] {
  const points = lights.map(function point(light) {
    return [Math.cos(light.ang) * light.rad, Math.sin(light.ang) * light.rad];
  });
  const seen: Record<string, boolean> = {};
  return points.flatMap(function near(p, i) {
    return points
      .map(function distance(q, j) {
        return {
          d: Math.hypot((q[0] ?? 0) - (p[0] ?? 0), (q[1] ?? 0) - (p[1] ?? 0)),
          j: j,
        };
      })
      .filter(function other(entry) {
        return entry.j !== i;
      })
      .sort(function closest(a, b) {
        return a.d - b.d;
      })
      .slice(0, k)
      .map(function pair(entry): [number, number] {
        return i < entry.j ? [i, entry.j] : [entry.j, i];
      })
      .filter(function fresh(pair) {
        const key = pair[0] + "-" + pair[1];
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
  });
}

/**
 * Where the drawing stands: beside the chapters on a wide screen, clear of
 * the chapter rail; across the top of a phone, ending above the chapter's
 * card (`cardTop`, or a default when no card is docked), kept between two
 * fifths and three fifths of the screen.
 */
export function stageFor(
  width: number,
  height: number,
  cardTop: number | null,
): Stage {
  const phone = width < 860;
  const bottom = Math.min(
    height * 0.62,
    Math.max(height * 0.4, (cardTop ?? height * 0.56) - 14),
  );
  const x0 = phone ? 0 : width * 0.4;
  const x1 = phone ? width : width - 130;
  const y0 = phone ? 60 : 70;
  const y1 = phone ? bottom : height - 24;
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    x0: x0,
    x1: x1,
    y0: y0,
    y1: y1,
    w: w,
    h: h,
    cx: x0 + w / 2,
    cy: y0 + h / 2,
    R: Math.min(w, h) * (phone ? 0.46 : 0.44),
    phone: phone,
  };
}

/** The last chapter whose top has passed the middle of the screen, and how far through it the reader is (0 to 1). */
export function sceneAt(
  boxes: { top: number; height: number }[],
  scrollY: number,
  viewport: number,
): { index: number; t: number } {
  const middle = scrollY + viewport / 2;
  const index = boxes.reduce(function passed(found, box, i) {
    return box.top <= middle ? i : found;
  }, 0);
  const box = boxes[index];
  if (!box) return { index: 0, t: 0 };
  const t = Math.min(
    1,
    Math.max(0, (middle - box.top) / Math.max(1, box.height)),
  );
  return { index: index, t: t };
}

/**
 * A light's place in the region: an organic cloud around the stage's center,
 * opened by `scale`, drifting slowly with time unless held still.
 */
export function cloudPlace(
  light: Light,
  stage: Stage,
  time: number,
  scale: number,
  still: boolean,
): [number, number] {
  const wobble =
    1 +
    0.13 * Math.sin(3 * light.ang + 0.7) +
    0.07 * Math.sin(5 * light.ang + 2);
  const radius = (0.16 + 0.84 * light.rad) * stage.R * scale * wobble;
  const drift = still ? 0 : 1;
  return [
    stage.cx +
      Math.cos(light.ang) * radius * 1.12 +
      drift * Math.sin(time * 0.00041 + light.ph) * 5,
    stage.cy +
      Math.sin(light.ang) * radius * 0.86 +
      drift * Math.cos(time * 0.00033 + light.ph) * 4,
  ];
}
