import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import type { SemanticSpaceProjection } from "@brains/plugins";
import { buildProximityMapData } from "../src/lib/proximity-map-data";
import { createTestAgent } from "./fixtures/agent";

describe("buildProximityMapData", () => {
  test("joins semantic points to agents and reports agents pending indexing", async () => {
    const agents = [
      createTestAgent({
        id: "alpha",
        name: "Alpha",
        kind: "professional",
        status: "approved",
      }),
      createTestAgent({
        id: "beta",
        name: "Beta",
        kind: "team",
        status: "discovered",
      }),
      createTestAgent({
        id: "old",
        name: "Old Agent",
        url: "https://old-agent.io",
        status: "archived",
      }),
      createTestAgent({ id: "pending", name: "Pending" }),
    ];
    const projection: SemanticSpaceProjection = {
      origin: {
        kind: "entity",
        entityId: "brain-character",
        entityType: "brain-character",
      },
      points: [
        {
          entityId: "alpha",
          entityType: "agent",
          coordinates: [1, 0],
          distanceToOrigin: 0.4,
        },
        {
          entityId: "beta",
          entityType: "agent",
          coordinates: [0, 1],
          distanceToOrigin: 0.6,
        },
        {
          entityId: "old",
          entityType: "agent",
          coordinates: [-1, 0],
          distanceToOrigin: 0.5,
        },
      ],
      neighbors: [
        {
          source: { entityId: "alpha", entityType: "agent" },
          target: { entityId: "beta", entityType: "agent" },
          distance: 0.2,
        },
        {
          source: { entityId: "beta", entityType: "agent" },
          target: { entityId: "old", entityType: "agent" },
          distance: 0.1,
        },
      ],
      distanceRange: { min: 0.4, max: 0.6 },
    };
    const listEntities = mock(async () => agents);
    const project = mock(async () => projection);

    const result = await buildProximityMapData({
      entityService: { listEntities },
      semantic: { project },
    });

    expect(project).toHaveBeenCalledWith({
      types: ["agent"],
      origin: {
        entityId: "brain-character",
        entityType: "brain-character",
      },
      maxNeighborDistance: 0.25,
    });
    expect(result.center).toEqual({ kind: "identity" });
    expect(result.nodes).toEqual([
      {
        id: "alpha",
        name: "Alpha",
        kind: "professional",
        status: "approved",
        tags: ["blog", "writing"],
        distance: 0.4,
        bearing: 0,
      },
      {
        id: "beta",
        name: "Beta",
        kind: "team",
        status: "discovered",
        tags: ["blog", "writing"],
        distance: 0.6,
        bearing: 90,
      },
      {
        id: "old",
        name: "Old Agent",
        kind: "professional",
        status: "archived",
        tags: ["blog", "writing"],
        distance: 0.5,
        bearing: 180,
      },
    ]);
    expect(result.clusters).toEqual([
      {
        label: "blog · 2",
        memberIds: ["alpha", "beta"],
        links: [{ sourceId: "alpha", targetId: "beta" }],
      },
    ]);
    expect(result.distanceRange).toEqual({ min: 0.4, max: 0.6 });
    expect(result.pendingCount).toBe(1);
  });

  test("surfaces centroid fallback and ignores projection points without agents", async () => {
    const result = await buildProximityMapData({
      entityService: {
        listEntities: async () => [createTestAgent({ id: "known" })],
      },
      semantic: {
        project: async () => ({
          origin: { kind: "centroid" },
          points: [
            {
              entityId: "unknown",
              entityType: "agent",
              coordinates: [0, 0],
              distanceToOrigin: 0.2,
            },
          ],
          neighbors: [],
          distanceRange: { min: 0.2, max: 0.2 },
        }),
      },
    });

    expect(result).toEqual({
      center: { kind: "centroid" },
      nodes: [],
      clusters: [],
      distanceRange: { min: 0.2, max: 0.2 },
      pendingCount: 1,
    });
  });
});
