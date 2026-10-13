import { describe, expect, test } from "bun:test";
import {
  buildKnowledgeMapData,
  knowledgeMapDataSchema,
} from "../../src/lib/knowledge-map-data";
import type {
  KnowledgeMapDataContext,
  ProjectedPoint,
} from "../../src/lib/knowledge-map-data";

/* The data builder projects the whole
   corpus (centerless 2D), turns topics into zones, and files each entity into
   its nearest zone in the projected plane (so zones visually contain their
   members). */

function makeContext(): KnowledgeMapDataContext {
  const points: ProjectedPoint[] = [
    {
      entityId: "future-of-work",
      entityType: "topic",
      coordinates: [0, 0],
      distanceToOrigin: 0.2,
    },
    {
      entityId: "workshops",
      entityType: "topic",
      coordinates: [10, 0],
      distanceToOrigin: 0.3,
    },
    {
      entityId: "play-essay",
      entityType: "post",
      coordinates: [1, 0.5],
      distanceToOrigin: 0.25,
    },
    {
      entityId: "team-assessment",
      entityType: "skill",
      coordinates: [9, 0.4],
      distanceToOrigin: 0.35,
    },
    {
      entityId: "blog-excerpt",
      entityType: "prompt",
      coordinates: [5, 8],
      distanceToOrigin: 0.5,
    },
    {
      entityId: "cococo",
      entityType: "deck",
      coordinates: [20, 15],
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
  // Each topic's nearest sources by stored embedding.
  const nearestByTopic: Record<
    string,
    { entityType: string; entityId: string }[]
  > = {
    "future-of-work": [
      { entityType: "post", entityId: "play-essay" },
      { entityType: "prompt", entityId: "blog-excerpt" },
    ],
    workshops: [
      { entityType: "skill", entityId: "team-assessment" },
      { entityType: "deck", entityId: "cococo" },
    ],
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
    sourceTypes: () =>
      Promise.resolve(
        Object.keys(entitiesByType).filter((type) => type !== "topic"),
      ),
    entityService: {
      listEntities: (request: { entityType: string }) =>
        Promise.resolve(
          (entitiesByType[request.entityType] ?? []).map((entity) => ({
            id: entity.id,
            entityType: request.entityType,
            content: entity.content,
          })),
        ),
      countEntities: (request) =>
        Promise.resolve((entitiesByType[request.entityType] ?? []).length),
      nearestToEntity: (request) =>
        Promise.resolve(
          (nearestByTopic[request.origin.entityId] ?? [])
            .slice(0, request.limit)
            .map((reference, index) => ({
              ...reference,
              distance: index / 10,
            })),
        ),
      getEntity: (
        request,
      ): ReturnType<KnowledgeMapDataContext["entityService"]["getEntity"]> => {
        const entity = (entitiesByType[request.entityType] ?? []).find(
          ({ id }) => id === request.id,
        );
        return Promise.resolve(
          entity ? { ...entity, entityType: request.entityType } : null,
        );
      },
    },
  };
}

describe("buildKnowledgeMapData", () => {
  test("projects the corpus into zones and source points", async () => {
    const data = await buildKnowledgeMapData(makeContext(), "public");

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

    // the far deck is filed nowhere, but remains an ordinary source point
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
    const clump: ProjectedPoint[] = [
      {
        entityId: "future-of-work",
        entityType: "topic",
        coordinates: [0.01, 0.02],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "workshops",
        entityType: "topic",
        coordinates: [0.03, 0.01],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "play-essay",
        entityType: "post",
        coordinates: [0.02, 0.03],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "team-assessment",
        entityType: "skill",
        coordinates: [0.04, 0.04],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "blog-excerpt",
        entityType: "prompt",
        coordinates: [0.02, 0.01],
        distanceToOrigin: 0.2,
      },
      {
        entityId: "cococo",
        entityType: "deck",
        coordinates: [8, 9],
        distanceToOrigin: 0.9,
      },
    ];
    context.semantic = {
      project: (): ReturnType<KnowledgeMapDataContext["semantic"]["project"]> =>
        Promise.resolve({ points: clump }),
    };
    const data = await buildKnowledgeMapData(context, "public");

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
    const again = await buildKnowledgeMapData(context, "public");
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
    const data = await buildKnowledgeMapData(context, "public");
    expect(data.points).toEqual([]);
    expect(data.zones).toEqual([]);
    expect(data.counts).toEqual({ entities: 0, topics: 0 });
  });
});

// Unscoped projection and reads see public entities only: the owner's map on
// the dashboard showed none of their non-public work.
describe("buildKnowledgeMapData scope", () => {
  test("projects and titles at the scope it is given", async () => {
    const base = makeContext();
    const projected: unknown[] = [];
    const listed: unknown[] = [];
    const looked: unknown[] = [];
    await buildKnowledgeMapData(
      {
        semantic: {
          project: (request) => {
            projected.push(request);
            return base.semantic.project(request);
          },
        },
        sourceTypes: base.sourceTypes,
        entityService: {
          listEntities: (request) => {
            listed.push(request);
            return base.entityService.listEntities(request);
          },
          countEntities: (request) => {
            looked.push(request);
            return base.entityService.countEntities(request);
          },
          nearestToEntity: (request) => {
            looked.push(request);
            return base.entityService.nearestToEntity(request);
          },
          getEntity: (request) => {
            looked.push(request);
            return base.entityService.getEntity(request);
          },
        },
      },
      "restricted",
    );

    expect(projected).toEqual([
      expect.objectContaining({ visibilityScope: "restricted" }),
    ]);
    // Every count the map takes to size itself is scoped too.
    expect(looked.length).toBeGreaterThan(0);
    expect(looked).toEqual(
      looked.map(() =>
        expect.objectContaining({
          options: { filter: { visibilityScope: "restricted" } },
        }),
      ),
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed).toEqual(
      listed.map(() =>
        expect.objectContaining({
          options: { filter: { visibilityScope: "restricted" } },
        }),
      ),
    );
  });
});

// A book brain projects thousands of sections; the map must not grow with it.
describe("buildKnowledgeMapData at corpus scale", () => {
  test("maps the topics and their nearest sources, not the whole corpus", async () => {
    const topics = ["will-to-power", "eternal-recurrence", "bad-conscience"];
    const longId = (n: number): string =>
      `die-philosophie-im-tragischen-zeitalter-der-griechen:00001-erster-theil:00002-vorrede-und-einleitung:${String(n).padStart(5, "0")}-abschnitt`;
    const projected: { entityType: string; entityId: string }[][] = [];
    const context: KnowledgeMapDataContext = {
      semantic: {
        project: (request) => {
          const entities = request.entities ?? [];
          projected.push(entities);
          return Promise.resolve({
            points: entities.map((reference, index) => ({
              ...reference,
              coordinates: [Math.cos(index), Math.sin(index * 1.7)],
              distanceToOrigin: 0.5,
            })),
          });
        },
      },
      sourceTypes: () => Promise.resolve(["book-section"]),
      entityService: {
        listEntities: () =>
          Promise.resolve(
            topics.map((id) => ({
              id,
              entityType: "topic",
              content: `# ${id}`,
            })),
          ),
        countEntities: () => Promise.resolve(3000),
        nearestToEntity: (request) =>
          Promise.resolve(
            Array.from({ length: request.limit }, (_, index) => ({
              entityType: "book-section",
              entityId: longId(
                topics.indexOf(request.origin.entityId) * 1000 + index,
              ),
              distance: index / 10,
            })),
          ),
        getEntity: (request) =>
          Promise.resolve({
            id: request.id,
            entityType: request.entityType,
            content: "Text.",
          }),
      },
    };

    const essay = { entityType: "post", entityId: "far-from-every-topic" };
    const started = performance.now();
    const data = await buildKnowledgeMapData(context, "public", {
      include: [essay],
    });

    expect(performance.now() - started).toBeLessThan(2000);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.length).toBe(topics.length + topics.length * 8 + 1);
    expect(data.zones).toHaveLength(topics.length);
    expect(data.points).toHaveLength(topics.length * 8 + 1);
    // What the caller must show is drawn, near a topic or not.
    expect(data.points.some(({ id }) => id === essay.entityId)).toBe(true);
  });
  test("files each source under the topic it sits closest to", async () => {
    const topics = ["will-to-power", "eternal-recurrence"];
    // "shared" ranks first for will-to-power but sits closer to eternal-recurrence.
    const nearest: Record<string, [string, number][]> = {
      "will-to-power": [
        ["shared", 0.3],
        ["a1", 0.35],
        ["a2", 0.4],
      ],
      "eternal-recurrence": [
        ["b1", 0.2],
        ["shared", 0.25],
        ["b2", 0.3],
      ],
    };
    const context: KnowledgeMapDataContext = {
      semantic: {
        // The flattened plane puts every source beside the first topic.
        project: (request) =>
          Promise.resolve({
            points: (request.entities ?? []).map((reference) => ({
              ...reference,
              coordinates:
                reference.entityId === "eternal-recurrence" ? [9, 9] : [0, 0],
              distanceToOrigin: 0.5,
            })),
          }),
      },
      sourceTypes: () => Promise.resolve(["book-section"]),
      entityService: {
        listEntities: () =>
          Promise.resolve(
            topics.map((id) => ({
              id,
              entityType: "topic",
              content: `# ${id}`,
            })),
          ),
        countEntities: () => Promise.resolve(3000),
        nearestToEntity: (request) =>
          Promise.resolve(
            (nearest[request.origin.entityId] ?? []).map(
              ([entityId, distance]) => ({
                entityType: "book-section",
                entityId,
                distance,
              }),
            ),
          ),
        getEntity: (request) =>
          Promise.resolve({
            id: request.id,
            entityType: request.entityType,
            content: "Text.",
          }),
      },
    };

    const data = await buildKnowledgeMapData(context, "public", {
      include: [{ entityType: "post", entityId: "far-from-every-topic" }],
    });
    const members = (id: string): string[] | undefined =>
      data.zones
        .find((zone) => zone.id === id)
        ?.memberIds.slice()
        .sort();

    expect(members("will-to-power")).toEqual(["a1", "a2"]);
    expect(members("eternal-recurrence")).toEqual(["b1", "b2", "shared"]);
    expect(
      data.points.find(({ id }) => id === "far-from-every-topic")?.zoneId,
    ).toBeNull();
  });

  test("measures topics against the sources topics are drawn from", async () => {
    const counted: string[] = [];
    const measured: string[][] = [];
    const context: KnowledgeMapDataContext = {
      semantic: {
        project: (request) =>
          Promise.resolve({
            points: (request.entities ?? []).map((reference) => ({
              ...reference,
              coordinates: [0, 0],
              distanceToOrigin: 0.5,
            })),
          }),
      },
      // Prompts are entities too, but no topic is drawn from them.
      sourceTypes: () => Promise.resolve(["book-section"]),
      entityService: {
        listEntities: () =>
          Promise.resolve([
            { id: "will-to-power", entityType: "topic", content: "# W" },
          ]),
        countEntities: (request) => {
          counted.push(request.entityType);
          return Promise.resolve(3000);
        },
        nearestToEntity: (request) => {
          measured.push(request.types);
          return Promise.resolve([]);
        },
        getEntity: () => Promise.resolve(null),
      },
    };

    await buildKnowledgeMapData(context, "public");

    expect(counted).toEqual(["book-section"]);
    expect(measured).toEqual([["book-section"]]);
  });
});
