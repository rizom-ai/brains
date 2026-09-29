import { describe, expect, it } from "bun:test";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { findNearestEntity, type NearestEntityDeps } from "../../src";

function entity(id: string, visibility: ContentVisibility): BaseEntity {
  return {
    id,
    entityType: "faq",
    content: id,
    contentHash: id,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    visibility,
    metadata: {},
  };
}

/** Stores `entities`; reads honour the requested visibility scope. */
function deps(
  distances: Array<{ entityId: string; entityType: string; distance: number }>,
  entities: BaseEntity[],
): NearestEntityDeps<BaseEntity> & { queries: string[] } {
  const order: ContentVisibility[] = ["public", "shared", "restricted"];
  const queries: string[] = [];
  return {
    queries,
    searchWithDistances: async ({ query }): Promise<typeof distances> => {
      queries.push(query);
      return distances;
    },
    getEntity: async ({ id, visibilityScope }): Promise<BaseEntity | null> => {
      const found = entities.find((candidate) => candidate.id === id);
      if (!found || !visibilityScope) return null;
      return order.indexOf(found.visibility) <= order.indexOf(visibilityScope)
        ? found
        : null;
    },
  };
}

describe("findNearestEntity", () => {
  it("returns the closest entity of the type within the distance", async () => {
    const service = deps(
      [
        { entityId: "note-1", entityType: "note", distance: 0.01 },
        { entityId: "near", entityType: "faq", distance: 0.1 },
        { entityId: "nearer-later", entityType: "faq", distance: 0.12 },
      ],
      [entity("near", "public"), entity("nearer-later", "public")],
    );

    const match = await findNearestEntity(service, {
      query: "markdown",
      entityType: "faq",
      maxDistance: 0.2,
      visibility: "public",
    });

    expect(match?.id).toBe("near");
    expect(service.queries).toEqual(["markdown"]);
  });

  it("ignores entities beyond the distance", async () => {
    const service = deps(
      [{ entityId: "far", entityType: "faq", distance: 0.3 }],
      [entity("far", "public")],
    );

    expect(
      await findNearestEntity(service, {
        query: "markdown",
        entityType: "faq",
        maxDistance: 0.2,
        visibility: "public",
      }),
    ).toBeUndefined();
  });

  it("matches only an entity of exactly the requested visibility", async () => {
    const service = deps(
      [
        { entityId: "public", entityType: "faq", distance: 0.05 },
        { entityId: "restricted", entityType: "faq", distance: 0.06 },
        { entityId: "shared", entityType: "faq", distance: 0.07 },
      ],
      [
        entity("public", "public"),
        entity("restricted", "restricted"),
        entity("shared", "shared"),
      ],
    );

    const match = await findNearestEntity(service, {
      query: "markdown",
      entityType: "faq",
      maxDistance: 0.2,
      visibility: "shared",
    });

    expect(match?.id).toBe("shared");
  });
});
