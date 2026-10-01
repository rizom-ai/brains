import { describe, expect, test } from "bun:test";
import type { ProximityMapData } from "@brains/agent-discovery/proximity-map";
import { placeNetwork } from "../../src/story/network";

function node(
  id: string,
  name: string,
  distance: number,
  bearing: number,
  status: "approved" | "discovered" | "archived" = "approved",
): ProximityMapData["nodes"][number] {
  return { id, name, kind: "person", status, tags: [], distance, bearing };
}

const map: ProximityMapData = {
  center: { kind: "identity" },
  nodes: [
    node("east", "East", 0.3, 0),
    node("north", "North", 0.6, 90),
    node("near-north", "Near North", 0.6, 92),
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

describe("the live network on the homepage", () => {
  const placed = placeNetwork(map);

  test("places every brain that is not archived by its distance and bearing, on a disc of 44", () => {
    expect(placed.brains.map((b) => b.id)).toEqual([
      "east",
      "north",
      "near-north",
      "west",
    ]);
    const east = placed.brains[0];
    expect(east?.x).toBeCloseTo(72, 0);
    expect(east?.y).toBeCloseTo(50, 0);
    expect(east?.reach).toBeCloseTo(0.5, 2);
    const north = placed.brains[1];
    expect(north?.x).toBeCloseTo(50, 0);
    expect(north?.y).toBeCloseTo(6, 0);
    expect(north?.reach).toBe(1);
  });

  test("names a brain on its outer side, and on the other side when a neighbour is in the way", () => {
    const by = Object.fromEntries(placed.brains.map((b) => [b.id, b.side]));
    expect(by["east"]).toBe("right");
    expect(by["west"]).toBe("left");
    // North and Near North sit on one row; the one whose outer side runs into
    // the other turns away from it.
    expect(new Set([by["north"], by["near-north"]]).size).toBe(2);
  });

  test("draws a kin thread for each link the projection found", () => {
    expect(placed.kin).toEqual([{ from: "near-north", to: "north" }]);
  });

  test("has nothing to draw for an empty map", () => {
    expect(placeNetwork({ ...map, nodes: [], clusters: [] })).toEqual({
      brains: [],
      kin: [],
    });
  });
});
