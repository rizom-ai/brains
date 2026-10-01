import {
  proximityMaxDistance,
  proximityPoint,
  proximityReach,
  type ProximityMapData,
} from "@brains/agent-discovery/proximity-map";

/**
 * The live network as the homepage opens on it: every brain that is not
 * archived, placed by how close its work runs to Rizom's, on a disc around
 * the brain's lantern, with its name beside it.
 */

/** The disc the brains sit on, in percent of the drawing. */
const DISC = { x: 50, y: 50, radius: 44 };
/** Percent of the drawing one character of a name takes, at the names' size. */
const CHARACTER = 1.45;
const GAP = 3;

export interface PlacedBrain {
  id: string;
  name: string;
  /** Percent of the drawing. */
  x: number;
  y: number;
  /** How far out it sits, from the centre (0) to the outer ring (1). */
  reach: number;
  /** Where its name goes: beside it on the outer side, on the other side when a neighbour is in the way, above when there is no room. */
  side: "left" | "right" | "above";
}

export interface PlacedNetwork {
  brains: PlacedBrain[];
  kin: { from: string; to: string }[];
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

export function placeNetwork(map: ProximityMapData): PlacedNetwork {
  const shown = map.nodes.filter((node) => node.status !== "archived");
  const max = proximityMaxDistance({ ...map, nodes: shown });
  const placed = shown.map((node) => {
    const point = proximityPoint(node.distance, node.bearing, max, DISC);
    return {
      id: node.id,
      name: node.name,
      x: r1(point.x),
      y: r1(point.y),
      reach: proximityReach(node.distance, max),
    };
  });
  const span = (name: string): number => name.length * CHARACTER + GAP;
  const room = (brain: (typeof placed)[number], dir: -1 | 1): boolean =>
    (dir < 0 ? brain.x - GAP : 100 - brain.x - GAP) >= span(brain.name);
  const blocked = (brain: (typeof placed)[number], dir: -1 | 1): boolean =>
    placed.some(
      (other) =>
        other !== brain &&
        Math.abs(other.y - brain.y) < 4 &&
        (dir < 0
          ? other.x < brain.x && brain.x - other.x < span(brain.name)
          : other.x > brain.x && other.x - brain.x < span(brain.name)),
    );
  const brains = placed.map((brain): PlacedBrain => {
    const sides: [-1 | 1, -1 | 1] = brain.x < DISC.x ? [-1, 1] : [1, -1];
    const dir = sides.find(
      (candidate) => room(brain, candidate) && !blocked(brain, candidate),
    );
    return {
      ...brain,
      side: dir === undefined ? "above" : dir < 0 ? "left" : "right",
    };
  });
  const ids = new Set(brains.map((brain) => brain.id));
  const kin = map.clusters.flatMap((cluster) =>
    cluster.links
      .filter((link) => ids.has(link.sourceId) && ids.has(link.targetId))
      .map((link) => ({ from: link.sourceId, to: link.targetId })),
  );
  return { brains, kin };
}
