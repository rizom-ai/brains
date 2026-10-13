import { describe, expect, test } from "bun:test";
import type { ProximityMapData } from "@brains/agent-discovery/proximity-map";
import { placeNetwork } from "../../src/story/network";

function node(
  id: string,
  name: string,
  distance: number,
  bearing: number,
  status: "approved" | "discovered" | "archived" = "approved",
  kind: "person" | "team" | "organization" = "person",
): ProximityMapData["nodes"][number] {
  return { id, name, kind, status, tags: [], distance, bearing };
}

const map: ProximityMapData = {
  center: { kind: "identity" },
  nodes: [
    node("east", "East", 0.3, 0),
    node("north", "North", 0.6, 90, "approved", "team"),
    node("near-north", "Near North", 0.6, 92, "approved", "organization"),
    node("west", "West", 0.45, 180),
    node("gone", "Gone", 0.2, 270, "archived"),
  ],
  clusters: [
    {
      label: "research · 2",
      memberIds: ["north", "near-north"],
      links: [{ sourceId: "near-north", targetId: "north" }],
    },
  ],
  sightings: [],
  distanceRange: { min: 0.3, max: 0.6 },
  pendingCount: 0,
  headingLevel: null,
  kicker: null,
  headingLead: null,
  headingAccent: null,
  lede: null,
  ctaLabel: null,
  ctaHref: null,
};

// A path's points, "M x y Q cx cy x y" → [[x, y], [cx, cy], [x, y]].
const points = (d: string): number[][] =>
  d
    .replace(/[MQ]/g, " ")
    .trim()
    .split(/\s+/)
    .map(Number)
    .reduce<number[][]>((all, n, i) => {
      if (i % 2 === 0) all.push([n]);
      else all[all.length - 1]?.push(n);
      return all;
    }, []);
const last = (d: string): number[] => points(d).at(-1) ?? [];

describe("the live network as the Ask room draws it", () => {
  const placed = placeNetwork(map);
  const by = Object.fromEntries(placed.brains.map((b) => [b.id, b]));
  const brain = (id: string): (typeof placed.brains)[number] => {
    const found = by[id];
    if (!found) throw new Error(`no brain ${id}`);
    return found;
  };

  test("keeps every brain that is not archived, its kind, and its reach as its radius, 11 + reach × 33", () => {
    expect(placed.brains.map((b) => b.id)).toEqual([
      "east",
      "north",
      "near-north",
      "west",
    ]);
    expect(by["north"]?.kind).toBe("team");
    expect(by["near-north"]?.kind).toBe("organization");
    // East is halfway out: a radius of 27.5, on its own bearing.
    expect(by["east"]?.reach).toBeCloseTo(0.5, 2);
    expect(by["east"]?.x).toBeCloseTo(77.5, 0);
    expect(by["east"]?.y).toBeCloseTo(50, 0);
    // North is at the far edge, 44 out, straight up.
    expect(by["north"]?.reach).toBe(1);
    expect(by["north"]?.x).toBeCloseTo(50, 0);
    expect(by["north"]?.y).toBeCloseTo(6, 0);
  });

  test("opens the sky: bearings relax halfway toward an even spread, in bearing order", () => {
    // Four brains, a step of 90° from the first: Near North (92°) moves
    // halfway to 180°, West (180°) halfway to 270°. The order around Rizom
    // is the map's order; the piling is not.
    expect(by["near-north"]?.x).toBeCloseTo(18.3, 0);
    expect(by["near-north"]?.y).toBeCloseTo(19.4, 0);
    expect(by["west"]?.x).toBeCloseTo(24.7, 0);
    expect(by["west"]?.y).toBeCloseTo(75.3, 0);
  });

  test("sets every name below its light, aligned inward at the drawing's edges", () => {
    expect(by["east"]?.align).toBe("center");
    expect(by["west"]?.align).toBe("center");
    // Near North is at the left edge: its name starts at the light; a brain at
    // the right edge has its name end there.
    expect(by["near-north"]?.align).toBe("start");
    const edge = placeNetwork({
      ...map,
      nodes: [node("far-east", "Far East", 0.6, 0)],
      clusters: [],
    });
    expect(edge.brains[0]?.x).toBeCloseTo(94, 0);
    expect(edge.brains[0]?.align).toBe("end");
  });

  test("grows a tendril per pair of neighbours: a trunk from Rizom to a fork, a branch to each brain", () => {
    expect(placed.tendrils).toHaveLength(2);
    const [first, second] = placed.tendrils;
    expect(first?.branches.map((b) => b.id)).toEqual(["east", "north"]);
    expect(second?.branches.map((b) => b.id)).toEqual(["near-north", "west"]);
    for (const tendril of placed.tendrils) {
      expect(tendril.trunk).toMatch(/^M50 50 Q/);
      const fork = last(tendril.trunk);
      const forkRadius = Math.hypot((fork[0] ?? 0) - 50, (fork[1] ?? 0) - 50);
      const nearest = Math.min(
        ...tendril.branches.map((b) =>
          Math.hypot(brain(b.id).x - 50, brain(b.id).y - 50),
        ),
      );
      // The fork is where the nearer brain's radius is about half spent.
      expect(forkRadius).toBeGreaterThan(nearest * 0.35);
      expect(forkRadius).toBeLessThan(nearest * 0.56);
      for (const branch of tendril.branches) {
        // Each branch leaves the fork and arrives at its brain.
        expect(points(branch.path)[0]).toEqual(fork);
        expect(last(branch.path)[0]).toBeCloseTo(brain(branch.id).x, 1);
        expect(last(branch.path)[1]).toBeCloseTo(brain(branch.id).y, 1);
        // Its route from Rizom is the trunk and the branch, one path for a bead to travel.
        expect(branch.route).toBe(
          `${tendril.trunk} ${branch.path.replace(/^M[^Q]*/, "")}`,
        );
      }
    }
  });

  test("draws the same tendrils for the same network", () => {
    expect(placeNetwork(map).tendrils).toEqual(placed.tendrils);
  });

  test("draws a kin thread for each link the projection found", () => {
    expect(placed.kin).toEqual([{ from: "near-north", to: "north" }]);
  });

  test("scatters the brains not yet in reach as dust beyond the far lights, at most forty", () => {
    expect(placed.dust).toEqual([]);
    const some = placeNetwork({ ...map, pendingCount: 5 }).dust;
    expect(some).toHaveLength(5);
    for (const mote of some) {
      const radius = Math.hypot(mote.x - 50, mote.y - 50);
      expect(radius).toBeGreaterThanOrEqual(45);
      expect(radius).toBeLessThanOrEqual(55);
      expect(mote.r).toBeGreaterThanOrEqual(0.2);
      expect(mote.r).toBeLessThanOrEqual(0.55);
    }
    expect(placeNetwork({ ...map, pendingCount: 120 }).dust).toHaveLength(40);
  });

  test("has nothing to draw for an empty map", () => {
    expect(placeNetwork({ ...map, nodes: [], clusters: [] })).toEqual({
      brains: [],
      kin: [],
      tendrils: [],
      dust: [],
    });
  });
});
