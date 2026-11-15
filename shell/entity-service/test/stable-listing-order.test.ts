import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { postAdapter, postSchema } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { insertTestEntity } from "./helpers/test-entity-db";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

// Written out of id order, as one sync writes them: the store's write order
// must never decide where tied entities list.
const WRITE_ORDER = ["post-c", "post-a", "post-e", "post-b", "post-d"];
const ID_ORDER = [...WRITE_ORDER].sort();
const SAME_TIME = new Date("2026-01-01T10:00:00.000Z").getTime();

describe("listing order under ties", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
    ]);
    for (const id of WRITE_ORDER) {
      await insertTestEntity(
        ctx.dbConfig,
        {
          id,
          entityType: "post",
          content: `Content of ${id}`,
          metadata: {
            title: id,
            status: "published",
            publishedAt: "2026-01-01T00:00:00.000Z",
          },
          visibility: "public",
          created: SAME_TIME,
          updated: SAME_TIME,
          embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        },
        ctx.embeddingDbConfig,
      );
    }
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function listIds(
    options: Parameters<
      EntityServiceTestContext["entityService"]["listEntities"]
    >[0]["options"] = {},
  ): Promise<string[]> {
    const listed = await ctx.entityService.listEntities({
      entityType: "post",
      options,
    });
    return listed.map((entity) => entity.id);
  }

  test("the default sort lists tied entities by id, every time", async () => {
    const runs = await Promise.all([listIds(), listIds(), listIds()]);
    for (const run of runs) expect(run).toEqual(ID_ORDER);
  });

  test("a requested sort lists its ties by id", async () => {
    expect(
      await listIds({ sortFields: [{ field: "created", direction: "asc" }] }),
    ).toEqual(ID_ORDER);
    expect(
      await listIds({
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      }),
    ).toEqual(ID_ORDER);
  });

  test("pages across a tie neither overlap nor skip", async () => {
    const pages = await Promise.all(
      [0, 2, 4].map((offset) => listIds({ limit: 2, offset })),
    );
    expect(pages).toEqual([
      ["post-a", "post-b"],
      ["post-c", "post-d"],
      ["post-e"],
    ]);
  });

  test("search lists equal scores by id", async () => {
    const results = await ctx.entityService.search({
      query: "anything",
      options: { types: ["post"], visibilityScope: "public" },
    });
    expect(results.map((result) => result.entity.id)).toEqual(ID_ORDER);
    const paged = await Promise.all(
      [0, 2, 4].map((offset) =>
        ctx.entityService.search({
          query: "anything",
          options: {
            types: ["post"],
            visibilityScope: "public",
            limit: 2,
            offset,
          },
        }),
      ),
    );
    expect(paged.flat().map((result) => result.entity.id)).toEqual(ID_ORDER);
  });

  test("distance reads list equal distances by id", async () => {
    const distances = await ctx.entityService.searchWithDistances({
      query: "anything",
    });
    expect(distances.map((hit) => hit.entityId)).toEqual(ID_ORDER);
    const nearest = await ctx.entityService.nearestToEntity({
      origin: { entityType: "post", entityId: "post-c" },
      types: ["post"],
    });
    expect(nearest.map((hit) => hit.entityId)).toEqual(
      ID_ORDER.filter((id) => id !== "post-c"),
    );
  });
});
