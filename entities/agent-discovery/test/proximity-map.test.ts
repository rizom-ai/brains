import { describe, expect, test } from "bun:test";
import type { SemanticSpaceNeighbor } from "@brains/plugins";
import {
  bearingFromCoordinates,
  buildProximityClusters,
  normalizeCosineDistance,
} from "../src/lib/proximity-map";
import type { ProximityMapNode } from "../src/lib/proximity-map-schema";

function node(id: string, tags: string[], bearing = 0): ProximityMapNode {
  return {
    id,
    name: id,
    kind: "person",
    status: "approved",
    tags,
    distance: 0.25,
    bearing,
  };
}

function neighbor(sourceId: string, targetId: string): SemanticSpaceNeighbor {
  return {
    source: { entityId: sourceId, entityType: "agent" },
    target: { entityId: targetId, entityType: "agent" },
    distance: 0.2,
  };
}

describe("proximity map math", () => {
  test("normalizes cosine distance to the map's zero-to-one radius", () => {
    expect(normalizeCosineDistance(-0.1)).toBe(0);
    expect(normalizeCosineDistance(0.6)).toBeCloseTo(0.6);
    expect(normalizeCosineDistance(2.2)).toBe(1);
  });

  test("derives degree bearings and deterministic fallbacks", () => {
    expect(bearingFromCoordinates([1, 0], 0)).toBeCloseTo(0);
    expect(bearingFromCoordinates([0, 1], 0)).toBeCloseTo(90);
    expect(bearingFromCoordinates([-1, 0], 0)).toBeCloseTo(180);
    expect(bearingFromCoordinates([0, -1], 0)).toBeCloseTo(270);
    expect(bearingFromCoordinates([0, 0], 0)).toBe(0);
    expect(bearingFromCoordinates([0, 0], 1)).toBeCloseTo(137.507764);
  });

  test("builds deterministic connected clusters with tag labels", () => {
    const nodes = [
      node("alpha", ["research", "writing"]),
      node("beta", ["research", "editing"]),
      node("gamma", ["operations"]),
      node("delta", ["automation"]),
    ];
    const clusters = buildProximityClusters(nodes, [
      neighbor("beta", "alpha"),
      neighbor("beta", "gamma"),
    ]);

    expect(clusters).toEqual([
      {
        label: "research · 3",
        memberIds: ["alpha", "beta", "gamma"],
        links: [
          { sourceId: "alpha", targetId: "beta" },
          { sourceId: "beta", targetId: "gamma" },
        ],
      },
    ]);
  });

  test("labels untagged constellations as unknown and sorts them last", () => {
    const clusters = buildProximityClusters(
      [
        node("alpha", []),
        node("beta", []),
        node("gamma", ["branding"]),
        node("zeta", ["branding"]),
      ],
      [neighbor("alpha", "beta"), neighbor("gamma", "zeta")],
    );

    expect(clusters.map((cluster) => cluster.label)).toEqual([
      "branding · 2",
      "unknown · 2",
    ]);
  });

  test("breaks tag-frequency ties lexically and ignores unknown nodes", () => {
    const clusters = buildProximityClusters(
      [node("alpha", ["writing"]), node("beta", ["research"])],
      [neighbor("alpha", "beta"), neighbor("alpha", "missing")],
    );

    expect(clusters).toEqual([
      {
        label: "research · 2",
        memberIds: ["alpha", "beta"],
        links: [{ sourceId: "alpha", targetId: "beta" }],
      },
    ]);
  });
});
