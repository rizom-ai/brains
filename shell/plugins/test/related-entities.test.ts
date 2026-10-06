import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectSemanticSpaceRequest,
  SemanticSpacePoint,
  SemanticSpaceProjection,
} from "@brains/entity-service";
import { createMockShell } from "../src/test/mock-shell";
import { findRelatedEntities } from "../src/service/related-entities";

const centre: [number, number] = [0, 0];

function point(entityId: string, distanceToOrigin: number): SemanticSpacePoint {
  return {
    entityId,
    entityType: "note",
    coordinates: centre,
    distanceToOrigin,
  };
}

function note(
  id: string,
  metadata: Record<string, unknown>,
  content = "",
): BaseEntity {
  return {
    id,
    entityType: "note",
    content,
    contentHash: id,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata,
  };
}

function projectionOf(points: SemanticSpacePoint[]): SemanticSpaceProjection {
  return {
    origin: { kind: "entity", entityType: "topic", entityId: "thema" },
    points,
    neighbors: [],
    distanceRange: { min: 0, max: 1 },
  };
}

describe("findRelatedEntities", () => {
  it("returns the nearest entries within the cutoff, closest first, up to the limit", async () => {
    const shell = createMockShell();
    shell.addEntities([
      note("a", { title: "Erste Notiz", slug: "erste" }),
      note("b", {}, "---\ntitle: Zweite Notiz\n---\n\nErfunden.\n"),
      note("c", {}),
      note("d", { title: "Ferne Notiz" }),
    ]);
    const requests: ProjectSemanticSpaceRequest[] = [];
    const related = await findRelatedEntities(
      {
        ...shell.getEntityService(),
        projectSemanticSpace: async (request) => {
          requests.push(request);
          return projectionOf([
            point("d", 0.9),
            point("c", 0.4),
            point("a", 0.1),
            point("b", 0.3),
          ]);
        },
      },
      {
        origin: { entityType: "topic", entityId: "thema" },
        types: ["note"],
        maxDistance: 0.5,
        limit: 2,
      },
    );

    expect(requests).toEqual([
      { types: ["note"], origin: { entityType: "topic", entityId: "thema" } },
    ]);
    expect(
      related.map((r) => [r.entity.id, r.title, r.slug, r.distance]),
    ).toEqual([
      ["a", "Erste Notiz", "erste", 0.1],
      ["b", "Zweite Notiz", null, 0.3],
    ]);
  });

  it("names an entry by its id when it has no title", async () => {
    const shell = createMockShell();
    shell.addEntities([note("c", {})]);
    const [related] = await findRelatedEntities(
      {
        ...shell.getEntityService(),
        projectSemanticSpace: async () => projectionOf([point("c", 0.2)]),
      },
      {
        origin: { entityType: "topic", entityId: "thema" },
        types: ["note"],
        maxDistance: 0.5,
        limit: 5,
      },
    );

    expect(related?.title).toBe("c");
  });

  it("skips entries that are gone", async () => {
    const shell = createMockShell();
    shell.addEntities([note("a", { title: "Da" })]);
    const related = await findRelatedEntities(
      {
        ...shell.getEntityService(),
        projectSemanticSpace: async () =>
          projectionOf([point("weg", 0.1), point("a", 0.2)]),
      },
      {
        origin: { entityType: "topic", entityId: "thema" },
        types: ["note"],
        maxDistance: 0.5,
        limit: 5,
      },
    );

    expect(related.map((r) => r.entity.id)).toEqual(["a"]);
  });

  it("finds nothing in a brain without embeddings", async () => {
    const shell = createMockShell();
    const related = await findRelatedEntities(
      {
        ...shell.getEntityService(),
        projectSemanticSpace: async () => {
          throw new Error(
            "Semantic indexing is disabled for this Brain instance",
          );
        },
      },
      {
        origin: { entityType: "topic", entityId: "thema" },
        types: ["note"],
        maxDistance: 0.5,
        limit: 5,
      },
    );

    expect(related).toEqual([]);
  });
});
