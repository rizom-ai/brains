import {
  proximityMaxDistance,
  proximityReach,
  type ProximityMapData,
} from "@brains/agent-discovery/proximity-map";

/**
 * The live network as the Ask room draws it (docs/plans/rizom-ask-network.md):
 * every brain that is not archived is a light placed by how close its work
 * runs to Rizom's, on a sky around Rizom's lantern; tendrils fork from the
 * lantern toward the lights; the brains not yet in reach are dust beyond the
 * far lights. Everything here is geometry in percent of the drawing; the
 * drawing itself is NetworkLayer (../opening.tsx).
 */

/** The sky the brains sit on, in percent of the drawing. */
const DISC = { x: 50, y: 50, radius: 44 };
/** A near brain still clears Rizom's corona. */
const INNER = 11;
/** Percent of the drawing one character of a name takes, at the names' size. */
const CHARACTER = 1.45;
const GAP = 3;
/** At the drawing's right edge a name goes below its light, so it stays in the frame. */
const EDGE = 78;
/** Where a tendril forks, as a share of the nearer brain's radius. */
const FORK = 0.45;
const DUST_CAP = 40;

export type BrainKind = ProximityMapData["nodes"][number]["kind"];

export interface PlacedBrain {
  id: string;
  name: string;
  kind: BrainKind;
  /** Percent of the drawing. */
  x: number;
  y: number;
  /** How far out it sits, from the centre (0) to the outer ring (1). */
  reach: number;
  /** Where its name goes: beside it on the outer side; below it when that side has no room or a neighbour, and at the drawing's right edge. */
  side: "left" | "right" | "below";
}

/** A trunk from Rizom to a fork, and a branch from the fork to each of its brains. */
export interface Tendril {
  trunk: string;
  branches: {
    id: string;
    /** From the fork to the brain. */
    path: string;
    /** From Rizom to the brain, the trunk and the branch as one path. */
    route: string;
  }[];
}

export interface Mote {
  x: number;
  y: number;
  r: number;
}

export interface PlacedNetwork {
  brains: PlacedBrain[];
  kin: { from: string; to: string }[];
  tendrils: Tendril[];
  dust: Mote[];
}

interface Spot {
  x: number;
  y: number;
  name: string;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** A small deterministic generator in [-0.5, 0.5), seeded from the network's ids: the same network draws the same sky. */
function wobble(seedText: string): () => number {
  let seed = Array.from(seedText).reduce(
    (h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0,
    7,
  );
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
}

/** A point on the sky at a bearing (counterclockwise from east, north up, as proximityPoint reads it) and a radius. */
const at = (bearing: number, radius: number): { x: number; y: number } => {
  const radians = (bearing * Math.PI) / 180;
  return {
    x: DISC.x + radius * Math.cos(radians),
    y: DISC.y - radius * Math.sin(radians),
  };
};

const point = (p: { x: number; y: number }): string => `${r2(p.x)} ${r2(p.y)}`;

export function placeNetwork(map: ProximityMapData): PlacedNetwork {
  const shown = map.nodes.filter((node) => node.status !== "archived");
  if (shown.length === 0)
    return { brains: [], kin: [], tendrils: [], dust: [] };
  const max = proximityMaxDistance({ ...map, nodes: shown });
  // Bearings relax halfway toward an even spread in bearing order, so the sky
  // is used and no sector piles its lights; order and reach stay the map's.
  const ordered = [...shown].sort((a, b) => a.bearing - b.bearing);
  const step = 360 / ordered.length;
  const first = ordered[0]?.bearing ?? 0;
  const placed = ordered.map((node, i) => {
    const reach = proximityReach(node.distance, max);
    const bearing = (node.bearing + (first + i * step)) / 2;
    const radius = INNER + reach * (DISC.radius - INNER);
    const p = at(bearing, radius);
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      x: r1(p.x),
      y: r1(p.y),
      reach,
      bearing,
      radius,
    };
  });
  const span = (name: string): number => name.length * CHARACTER + GAP;
  const room = (brain: Spot, dir: -1 | 1): boolean =>
    (dir < 0 ? brain.x - GAP : 100 - brain.x - GAP) >= span(brain.name);
  const blocked = (brain: Spot, dir: -1 | 1): boolean =>
    placed.some(
      (other) =>
        other !== brain &&
        Math.abs(other.y - brain.y) < 4 &&
        (dir < 0
          ? other.x < brain.x && brain.x - other.x < span(brain.name)
          : other.x > brain.x && other.x - brain.x < span(brain.name)),
    );
  const brains = placed.map(
    ({ bearing: _b, radius: _r, ...brain }): PlacedBrain => {
      // A name sits on its light's outer side; when there is no room there,
      // or a neighbour is in the way, it goes below, never inward across
      // the tendrils.
      if (brain.x >= EDGE) return { ...brain, side: "below" };
      const outer: -1 | 1 = brain.x < DISC.x ? -1 : 1;
      const fits = room(brain, outer) && !blocked(brain, outer);
      return {
        ...brain,
        side: !fits ? "below" : outer < 0 ? "left" : "right",
      };
    },
  );
  const ids = new Set(brains.map((brain) => brain.id));
  const kin = map.clusters.flatMap((cluster) =>
    cluster.links
      .filter((link) => ids.has(link.sourceId) && ids.has(link.targetId))
      .map((link) => ({ from: link.sourceId, to: link.targetId })),
  );
  // Tendrils: neighbours in bearing order share a trunk that forks where the
  // nearer one's radius is about half spent; a seeded wobble bends the curves
  // like roots, not like compass lines.
  const next = wobble(placed.map((b) => b.id).join("|"));
  const pairs = Array.from({ length: Math.ceil(placed.length / 2) }, (_, i) =>
    placed.slice(i * 2, i * 2 + 2),
  );
  const tendrils = pairs.map((pair): Tendril => {
    const mean = pair.reduce((s, b) => s + b.bearing, 0) / pair.length;
    const forkRadius =
      Math.min(...pair.map((b) => b.radius)) * (FORK + next() * 0.12);
    const fork = at(mean + next() * 14, forkRadius);
    const bend = at(mean + next() * 30, forkRadius * 0.45);
    const trunk = `M50 50 Q${point(bend)} ${point(fork)}`;
    return {
      trunk,
      branches: pair.map((b) => {
        const mid = at(b.bearing + next() * 18, (forkRadius + b.radius) / 2);
        const tail = `Q${point(mid)} ${b.x} ${b.y}`;
        return {
          id: b.id,
          path: `M${point(fork)} ${tail}`,
          route: `${trunk} ${tail}`,
        };
      }),
    };
  });
  // Dust: the directory's brains not yet in reach, beyond the far lights.
  const motes = wobble(`dust|${map.pendingCount}`);
  const dust = Array.from(
    { length: Math.min(map.pendingCount, DUST_CAP) },
    (): Mote => {
      const p = at(motes() * 360, 45 + Math.abs(motes()) * 20);
      return { x: r1(p.x), y: r1(p.y), r: r2(0.2 + Math.abs(motes()) * 0.7) };
    },
  );
  return { brains, kin, tendrils, dust };
}
