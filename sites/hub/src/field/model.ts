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
  return linkNearest(
    lights.map(function point(light): [number, number] {
      return [Math.cos(light.ang) * light.rad, Math.sin(light.ang) * light.rad];
    }),
    k,
  );
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

/** Smoothstep: eases a 0–1 value in and out. */
export function ease(k: number): number {
  return k * k * (3 - 2 * k);
}

/** How far `t` is between `a` and `b`, clamped to 0–1. */
export function segment(t: number, a: number, b: number): number {
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/**
 * How far a light has gone toward the center (0 home, 1 gone) at `t` through
 * the pipeline: the lights leave in rank order, the warm ones first, each
 * over a stretch, until about half the region has left.
 */
export function departure(rank: number, count: number, t: number): number {
  const leaving = ease(segment(t, 0.08, 0.86)) * count * 0.52;
  return Math.min(1, Math.max(0, (leaving - rank) / 9));
}

/** Which cohort is in the program at `t`, how far through it is, and how far it has arrived and left. */
export function cohortPhase(
  t: number,
  cohorts: number,
): { c: number; u: number; arrive: number; leave: number } {
  const at = t * cohorts;
  const c = Math.min(cohorts - 1, Math.floor(at));
  const u = at - c;
  return {
    c: c,
    u: u,
    arrive: ease(segment(u, 0, 0.28)),
    leave: ease(segment(u, 0.74, 1)),
  };
}

/**
 * What the hub has on record at `t` through four cohorts, in cohorts' worth:
 * with a Brain each cohort adds to what the last left; without one, each
 * cohort's learning is gone when it ends.
 */
export function memoryLevel(t: number, withBrain: boolean): number {
  const at = Math.min(Math.max(t, 0), 0.9999) * 4;
  const c = Math.floor(at);
  const u = at - c;
  const rise = ease(segment(u, 0.1, 0.8));
  return withBrain ? c + rise : rise * (1 - segment(u, 0.88, 1));
}

/** People and introductions on record when a cohort (0-based) starts. */
export function onRecord(cohort: number, withBrain: boolean): number {
  return withBrain ? cohort * 14 : 0;
}

/** The sparkline's y for a level, in its 300×78 box. */
export function sparkY(level: number): number {
  return 62 - level * 13;
}

/** The sparkline for what the hub has on record, with or without a Brain, across its 300×78 box. */
export function sparkPath(withBrain: boolean): string {
  return Array.from({ length: 121 }, function point(_, k) {
    const x = 8 + (k / 120) * 284;
    const y = sparkY(memoryLevel(k / 120, withBrain));
    return (k ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }).join("");
}

/** A point `k` along a thread from one end to the other, bent sideways by `bend`. */
export function bendPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend: number,
  k: number,
): [number, number] {
  const cx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const cy = (y1 + y2) / 2 + (x2 - x1) * bend;
  const u = 1 - k;
  return [
    u * u * x1 + 2 * u * k * cx + k * k * x2,
    u * u * y1 + 2 * u * k * cy + k * k * y2,
  ];
}

/** The lab's week (0–26) at `t` through its chapter; the last tenth is the Brain going home. */
export function labWeek(t: number): number {
  return Math.min(1, Math.max(0, (t - 0.04) / 0.86)) * 26;
}

/** How far the lab's Brain has gone home with the organization (0–1). */
export function labHome(t: number): number {
  return Math.min(1, Math.max(0, (t - 0.9) / 0.1));
}

/** The lab's phase: 0 the audit (weeks 1–3), 1 the pilot, 2 the Brain in use (from week 19), 3 the end. */
export function labPhase(week: number, home: number): number {
  if (home > 0 || week >= 24) return 3;
  if (week >= 18) return 2;
  if (week >= 3) return 1;
  return 0;
}

/** Decisions kept in the lab's Brain by a week: from the audit's end through the pilot. */
export function decisionsBy(week: number): number {
  return Math.floor(Math.min(15, Math.max(0, week - 3)) * 1.6);
}

/** How present the people the hub brings in are (0–1): they arrive with the pilot and leave as it ends. */
export function guestsPresent(week: number): number {
  const arrive = Math.min(1, Math.max(0, (week - 4) / 2));
  const leave = Math.min(1, Math.max(0, (week - 17) / 2));
  return arrive * (1 - leave);
}

/**
 * The holder lit in "How it fits into Rizom": the reader's choice when there
 * is one; otherwise each in turn through the chapter's first half
 * (organizations, the hub, members, Rizom B.V., the Foundation), then none,
 * so all show together while the money flows.
 */
export function holderInFocus(t: number, chosen: string | null): string | null {
  if (chosen) return chosen;
  if (t >= 0.5) return null;
  const holders = ["orgs", "hub", "members", "bv", "foundation"];
  return holders[Math.min(4, Math.floor(t / 0.1))] ?? null;
}

/** How far the split of every lab has begun to flow (0–1). */
export function splitFlow(t: number): number {
  return Math.min(1, Math.max(0, (t - 0.5) / 0.12));
}

/** How far delivery has moved from Rizom B.V. to the hub's certified people (0–1). */
export function certified(t: number): number {
  const k = Math.min(1, Math.max(0, (t - 0.74) / 0.2));
  return k * k * (3 - 2 * k);
}

/** Where the network's hubs sit on the stage (0–1 each way): a loose grid, jittered by seed, in the order they light. */
export function hubSites(count: number, seed: number): [number, number][] {
  const rand = mulberry(seed);
  return Array.from({ length: count }, function site(_, k): [
    number,
    number,
    number,
  ] {
    const col = k % 5;
    const row = Math.floor(k / 5);
    const u = 0.1 + col * 0.2 + (rand() - 0.5) * 0.12;
    const v = 0.16 + row * 0.32 + (rand() - 0.5) * 0.16;
    return [
      Math.min(0.96, Math.max(0.04, u)),
      Math.min(0.96, Math.max(0.04, v)),
      rand(),
    ];
  })
    .sort(function order(a, b) {
      return a[2] - b[2];
    })
    .map(function place(entry): [number, number] {
      return [entry[0], entry[1]];
    });
}

/** How many of the fourteen hubs are lit at `t` through the network chapter: the reader's own first, then the rest. */
export function hubsLit(t: number): number {
  return 1 + Math.floor(ease(segment(t, 0.04, 0.6)) * 13);
}

/** Each point's k nearest neighbors, as pairs listed once, lower index first. */
export function linkNearest(
  points: [number, number][],
  k: number,
): [number, number][] {
  const seen: Record<string, boolean> = {};
  return points.flatMap(function near(p, i) {
    return points
      .map(function distance(q, j) {
        return { d: Math.hypot(q[0] - p[0], q[1] - p[1]), j: j };
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

/** Where on the stage (0–1 each way) a tap at the screen point lands, or null when it misses the stage. */
export function plantAt(
  x: number,
  y: number,
  stage: Stage,
): [number, number] | null {
  const u = (x - stage.x0) / stage.w;
  const v = (y - stage.y0) / stage.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return [u, v];
}
