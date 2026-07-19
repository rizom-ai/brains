import { describe, expect, test } from "bun:test";
import {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
} from "../../src/lib/knowledge-map-data";
import type { KnowledgeMapDataContext } from "../../src/lib/knowledge-map-data";

/* Phase 1 of docs/plans/knowledge-map.md: the data builder projects the whole
   corpus (centerless 2D), turns topics into zones, files each entity into its
   nearest zone in the projected plane (so zones visually contain their
   members), and flags what lands outside every border as unfiled. */

function makeContext(): KnowledgeMapDataContext {
  const points = [
    {
      entityId: "future-of-work",
      entityType: "topic",
      coordinates: [0, 0] as [number, number],
      distanceToOrigin: 0.2,
    },
    {
      entityId: "workshops",
      entityType: "topic",
      coordinates: [10, 0] as [number, number],
      distanceToOrigin: 0.3,
    },
    {
      entityId: "play-essay",
      entityType: "post",
      coordinates: [1, 0.5] as [number, number],
      distanceToOrigin: 0.25,
    },
    {
      entityId: "team-assessment",
      entityType: "skill",
      coordinates: [9, 0.4] as [number, number],
      distanceToOrigin: 0.35,
    },
    {
      entityId: "blog-excerpt",
      entityType: "prompt",
      coordinates: [5, 8] as [number, number],
      distanceToOrigin: 0.5,
    },
    {
      entityId: "cococo",
      entityType: "deck",
      coordinates: [20, 15] as [number, number],
      distanceToOrigin: 0.7,
    },
  ];
  const entitiesByType: Record<string, { id: string; content: string }[]> = {
    topic: [
      { id: "future-of-work", content: "# Future of Work\n\nnotes" },
      { id: "workshops", content: "# Workshops\n\nnotes" },
    ],
    post: [
      { id: "play-essay", content: "# The Future of Work is Play\n\nbody" },
    ],
    skill: [{ id: "team-assessment", content: "# Team Assessment\n\nbody" }],
    prompt: [{ id: "blog-excerpt", content: "no heading here" }],
    deck: [{ id: "cococo", content: "# CoCoCo\n\nslides" }],
  };
  return {
    semantic: {
      project: () =>
        Promise.resolve({
          origin: { kind: "centroid" as const },
          points,
          neighbors: [],
          distanceRange: { min: 0.2, max: 0.7 },
        }),
    },
    entityService: {
      listEntities: (request: { entityType: string }) =>
        Promise.resolve(
          (entitiesByType[request.entityType] ?? []).map((entity) => ({
            id: entity.id,
            entityType: request.entityType,
            content: entity.content,
          })),
        ),
    },
  };
}

describe("buildKnowledgeMapData", () => {
  test("projects the corpus into zones, filed points, and unfiled lights", async () => {
    const data = await buildKnowledgeMapData(makeContext());

    // schema round-trip: the template/datasource contract holds
    expect(knowledgeMapDataSchema.safeParse(data).success).toBe(true);

    // topics become zones, not points
    expect(data.zones.map((zone) => zone.name).sort()).toEqual([
      "Future of Work",
      "Workshops",
    ]);
    expect(data.points.some((point) => point.entityType === "topic")).toBe(
      false,
    );

    // membership: nearest zone in the projected plane, within the radius
    const fow = data.zones.find((zone) => zone.name === "Future of Work");
    const workshops = data.zones.find((zone) => zone.name === "Workshops");
    expect(fow?.memberIds).toEqual(["play-essay"]);
    expect(workshops?.memberIds).toEqual(["team-assessment"]);

    // the far deck is filed nowhere — unfiled, and visibly so
    const deck = data.points.find((point) => point.id === "cococo");
    expect(deck?.zoneId).toBeNull();

    // kinds derive from entity type
    const kinds = Object.fromEntries(
      data.points.map((point) => [point.id, point.kind]),
    );
    expect(kinds["play-essay"]).toBe("published");
    expect(kinds["cococo"]).toBe("published");
    expect(kinds["team-assessment"]).toBe("skill");
    expect(kinds["blog-excerpt"]).toBe("ground");

    // titles from the first heading, id-derived fallback otherwise
    const prompt = data.points.find((point) => point.id === "blog-excerpt");
    expect(prompt?.title).toBe("blog excerpt");
    const essay = data.points.find((point) => point.id === "play-essay");
    expect(essay?.title).toBe("The Future of Work is Play");

    // coordinates normalized to the unit box with uniform scale
    const xs = data.points.map((p) => p.x).concat(data.zones.map((z) => z.x));
    const ys = data.points.map((p) => p.y).concat(data.zones.map((z) => z.y));
    for (const v of xs.concat(ys)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // uniform scale: the wider axis spans the box; the essay stays close to
    // its topic after normalization (visual containment)
    const zone = fow;
    const essayPoint = essay;
    if (!zone || !essayPoint) throw new Error("fixture points missing");
    const dist = Math.hypot(zone.x - essayPoint.x, zone.y - essayPoint.y);
    expect(dist).toBeLessThan(0.12);

    // honest counters
    expect(data.counts).toEqual({ entities: 6, topics: 2 });
  });

  test("clumped projections spread across the field", async () => {
    // Real PCA output: a dense knot plus one outlier. Raw min/max
    // normalization would crush the knot into a corner; the builder must
    // spread it while keeping neighborhoods intact.
    const context = makeContext();
    const clump = [
      {
        entityId: "future-of-work",
        entityType: "topic",
        coordinates: [0.01, 0.02] as [number, number],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "workshops",
        entityType: "topic",
        coordinates: [0.03, 0.01] as [number, number],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "play-essay",
        entityType: "post",
        coordinates: [0.02, 0.03] as [number, number],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "team-assessment",
        entityType: "skill",
        coordinates: [0.04, 0.04] as [number, number],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "blog-excerpt",
        entityType: "prompt",
        coordinates: [0.02, 0.01] as [number, number],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "cococo",
        entityType: "deck",
        coordinates: [8, 9] as [number, number],
        distanceToOrigin: 0.9,
      },
    ];
    context.semantic = {
      project: (): ReturnType<KnowledgeMapDataContext["semantic"]["project"]> =>
        Promise.resolve({ points: clump }),
    };
    const data = await buildKnowledgeMapData(context);

    const positions = data.points
      .map((point) => ({ x: point.x, y: point.y }))
      .concat(data.zones.map((zone) => ({ x: zone.x, y: zone.y })));

    // no two marks sit on top of each other
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        if (!a || !b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.03);
      }
    }

    // the knot occupies real space instead of a corner: its five members
    // span a meaningful part of the box
    const knot = positions.slice(0, positions.length - 1);
    const spanX =
      Math.max(...knot.map((p) => p.x)) - Math.min(...knot.map((p) => p.x));
    const spanY =
      Math.max(...knot.map((p) => p.y)) - Math.min(...knot.map((p) => p.y));
    expect(Math.max(spanX, spanY)).toBeGreaterThan(0.2);

    // determinism: the same projection always lands the same layout
    const again = await buildKnowledgeMapData(context);
    expect(again).toEqual(data);
  });

  test("an empty corpus yields an empty map, not an error", async () => {
    const context = makeContext();
    context.semantic = {
      project: (): ReturnType<KnowledgeMapDataContext["semantic"]["project"]> =>
        Promise.resolve({
          origin: { kind: "centroid" as const },
          points: [],
          neighbors: [],
          distanceRange: { min: 0, max: 0 },
        }),
    };
    const data = await buildKnowledgeMapData(context);
    expect(data.points).toEqual([]);
    expect(data.zones).toEqual([]);
    expect(data.counts).toEqual({ entities: 0, topics: 0 });
  });
});
