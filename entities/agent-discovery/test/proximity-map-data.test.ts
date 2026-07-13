import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import type { SemanticSpaceProjection } from "@brains/plugins";
import { buildProximityMapData } from "../src/lib/proximity-map-data";
import { createTestAgent } from "./fixtures/agent";
import { createTestSighting } from "./fixtures/sighting";

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
    const listEntities = mock(async (request: { entityType: string }) =>
      request.entityType === "agent" ? agents : [],
    );
    const project = mock(async () => projection);

    const result = await buildProximityMapData({
      entityService: { listEntities } as never,
      semantic: { project },
    });

    expect(project).toHaveBeenCalledWith({
      types: ["agent", "agent-sighting"],
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
        listEntities: (async (request: { entityType: string }) =>
          request.entityType === "agent"
            ? [createTestAgent({ id: "known" })]
            : []) as never,
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
      sightings: [],
      distanceRange: { min: 0.2, max: 0.2 },
      pendingCount: 1,
    });
  });

  test("charts pruned second-order sightings routed through visible introducers", async () => {
    const agents = [
      createTestAgent({ id: "kai", name: "Kai", status: "approved" }),
      createTestAgent({ id: "gone", name: "Gone", status: "archived" }),
    ];
    const sightings = [
      // near, introduced by an active agent → charted
      createTestSighting({ id: "vale", name: "Vale", introducedBy: ["kai"] }),
      // introduced only by an archived agent → no honest route, dropped
      createTestSighting({
        id: "cairn",
        name: "Cairn",
        introducedBy: ["gone"],
      }),
      // beyond the germination threshold → dropped
      createTestSighting({ id: "far", name: "Far", introducedBy: ["kai"] }),
      // no embedding yet → dropped
      createTestSighting({ id: "dark", name: "Dark", introducedBy: ["kai"] }),
    ];
    const project = mock(async () => ({
      origin: {
        kind: "entity" as const,
        entityId: "brain-character",
        entityType: "brain-character",
      },
      points: [
        {
          entityId: "kai",
          entityType: "agent",
          coordinates: [1, 0] as [number, number],
          distanceToOrigin: 0.3,
        },
        {
          entityId: "gone",
          entityType: "agent",
          coordinates: [-1, 0] as [number, number],
          distanceToOrigin: 0.4,
        },
        {
          entityId: "vale",
          entityType: "agent-sighting",
          coordinates: [0, 1] as [number, number],
          distanceToOrigin: 0.35,
        },
        {
          entityId: "cairn",
          entityType: "agent-sighting",
          coordinates: [0, -1] as [number, number],
          distanceToOrigin: 0.3,
        },
        {
          entityId: "far",
          entityType: "agent-sighting",
          coordinates: [1, 1] as [number, number],
          distanceToOrigin: 0.9,
        },
      ],
      neighbors: [],
      distanceRange: { min: 0.3, max: 0.9 },
    }));

    const result = await buildProximityMapData({
      entityService: {
        listEntities: (async (request: { entityType: string }) =>
          request.entityType === "agent" ? agents : sightings) as never,
      },
      semantic: { project },
    });

    expect(result.sightings).toEqual([
      {
        id: "vale",
        name: "Vale",
        viaIds: ["kai"],
        tags: ["research"],
        distance: 0.35,
        bearing: 90,
      },
    ]);
  });
});
