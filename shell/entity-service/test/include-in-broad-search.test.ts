import { createTestEntity } from "../src/test/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { createTestEntityAdapter } from "../src/test/index";
import { baseEntitySchema } from "../src/types";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("EntityTypeConfig includeInBroadSearch", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      {
        name: "note",
        schema: baseEntitySchema,
        adapter: createTestEntityAdapter("note"),
      },
      {
        name: "derived",
        schema: baseEntitySchema,
        adapter: createTestEntityAdapter("derived"),
        config: { includeInBroadSearch: false },
      },
    ]);
    for (const entityType of ["note", "derived"]) {
      const entity = createTestEntity(entityType, {
        id: `${entityType}-quokka`,
        content: "A field guide to the quokka",
      });
      await ctx.entityService.createEntity({ entity });
      await ctx.entityService.storeEmbedding({
        entityId: entity.id,
        entityType,
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        contentHash: entity.contentHash,
      });
    }
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("a broad search leaves the type out", async () => {
    const results = await ctx.entityService.search({ query: "quokka" });

    expect(results.map((result) => result.entity.id)).toEqual(["note-quokka"]);
  });

  test("a search naming the type still finds it", async () => {
    const results = await ctx.entityService.search({
      query: "quokka",
      options: { types: ["derived"] },
    });

    expect(results.map((result) => result.entity.id)).toEqual([
      "derived-quokka",
    ]);
  });

  test("raw distances still include it", async () => {
    const distances = await ctx.entityService.searchWithDistances({
      query: "quokka",
    });

    expect(distances.map((result) => result.entityId).sort()).toEqual([
      "derived-quokka",
      "note-quokka",
    ]);
  });
});
