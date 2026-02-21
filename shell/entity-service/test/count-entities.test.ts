import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { postSchema, postAdapter } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { insertTestEntity } from "./helpers/test-entity-db";

describe("countEntities", () => {
  let ctx: EntityServiceTestContext;

  const mockEmbedding = new Float32Array(384).fill(0.1);

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
    ]);

    await insertTestEntity(ctx.dbConfig, {
      id: "post-1",
      entityType: "post",
      content: "Post 1",
      metadata: { status: "published", category: "tech" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(ctx.dbConfig, {
      id: "post-2",
      entityType: "post",
      content: "Post 2",
      metadata: { status: "published", category: "life" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(ctx.dbConfig, {
      id: "post-3",
      entityType: "post",
      content: "Post 3",
      metadata: { status: "draft", category: "tech" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("should count all entities of a type", async () => {
    const count = await ctx.entityService.countEntities("post");
    expect(count).toBe(3);
  });

  test("should return 0 for non-existent entity type", async () => {
    const count = await ctx.entityService.countEntities("nonexistent");
    expect(count).toBe(0);
  });

  test("should count only published entities when publishedOnly is true", async () => {
    const count = await ctx.entityService.countEntities("post", {
      publishedOnly: true,
    });
    expect(count).toBe(2);
  });

  test("should count entities with metadata filter", async () => {
    const count = await ctx.entityService.countEntities("post", {
      filter: { metadata: { category: "tech" } },
    });
    expect(count).toBe(2);
  });

  test("should combine publishedOnly and metadata filter", async () => {
    const count = await ctx.entityService.countEntities("post", {
      publishedOnly: true,
      filter: { metadata: { category: "tech" } },
    });
    expect(count).toBe(1);
  });
});
