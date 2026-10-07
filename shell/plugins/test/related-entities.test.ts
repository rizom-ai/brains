import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  NearestToEntityRequest,
} from "@brains/entity-service";
import { createMockShell } from "../src/test/mock-shell";
import { findRelatedEntities } from "../src/service/related-entities";

function near(
  entityId: string,
  distance: number,
): { entityId: string; entityType: string; distance: number } {
  return { entityId, entityType: "note", distance };
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

describe("findRelatedEntities", () => {
  it("asks the store for the nearest entries within the cutoff and limit, and names them", async () => {
    const shell = createMockShell();
    shell.addEntities([
      note("a", { title: "Erste Notiz", slug: "erste" }),
      note("b", {}, "---\ntitle: Zweite Notiz\n---\n\nErfunden.\n"),
      note("c", {}),
      note("d", { title: "Ferne Notiz" }),
    ]);
    const requests: NearestToEntityRequest[] = [];
    const related = await findRelatedEntities(
      {
        ...shell.getEntityService(),
        nearestToEntity: async (request) => {
          requests.push(request);
          return [near("a", 0.1), near("b", 0.3)];
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
      {
        origin: { entityType: "topic", entityId: "thema" },
        types: ["note"],
        maxDistance: 0.5,
        limit: 2,
      },
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
        nearestToEntity: async () => [near("c", 0.2)],
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
        nearestToEntity: async () => [near("weg", 0.1), near("a", 0.2)],
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
        nearestToEntity: async () => {
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
