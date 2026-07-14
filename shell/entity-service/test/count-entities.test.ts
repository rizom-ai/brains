import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  postSchema,
  postAdapter,
  peerSchema,
  peerAdapter,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { insertTestEntity } from "./helpers/test-entity-db";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("countEntities", () => {
  let ctx: EntityServiceTestContext;

  const mockEmbedding = new Float32Array(MOCK_DIMENSIONS).fill(0.1);

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
    ]);

    await insertTestEntity(
      ctx.dbConfig,
      {
        id: "post-1",
        entityType: "post",
        content: "Post 1",
        metadata: { status: "published", category: "tech" },
        created: Date.now(),
        updated: Date.now(),
        embedding: mockEmbedding,
      },
      ctx.embeddingDbConfig,
    );

    await insertTestEntity(
      ctx.dbConfig,
      {
        id: "post-2",
        entityType: "post",
        content: "Post 2",
        metadata: { status: "published", category: "life" },
        created: Date.now(),
        updated: Date.now(),
        embedding: mockEmbedding,
      },
      ctx.embeddingDbConfig,
    );

    await insertTestEntity(
      ctx.dbConfig,
      {
        id: "post-3",
        entityType: "post",
        content: "Post 3",
        metadata: { status: "draft", category: "tech" },
        created: Date.now(),
        updated: Date.now(),
        embedding: mockEmbedding,
      },
      ctx.embeddingDbConfig,
    );
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("should count all entities of a type", async () => {
    const count = await ctx.entityService.countEntities({ entityType: "post" });
    expect(count).toBe(3);
  });

  test("should return 0 for non-existent entity type", async () => {
    const count = await ctx.entityService.countEntities({
      entityType: "nonexistent",
    });
    expect(count).toBe(0);
  });

  test("should count only published entities when publishedOnly is true", async () => {
    const count = await ctx.entityService.countEntities({
      entityType: "post",
      options: {
        publishedOnly: true,
      },
    });
    expect(count).toBe(2);
  });

  test("should count entities with metadata filter", async () => {
    const count = await ctx.entityService.countEntities({
      entityType: "post",
      options: {
        filter: { metadata: { category: "tech" } },
      },
    });
    expect(count).toBe(2);
  });

  test("should combine publishedOnly and metadata filter", async () => {
    const count = await ctx.entityService.countEntities({
      entityType: "post",
      options: {
        publishedOnly: true,
        filter: { metadata: { category: "tech" } },
      },
    });
    expect(count).toBe(1);
  });

  // What "published" means belongs to the entity type: an adapter may declare
  // its own publish-gate statuses (agents: approval is the directory's publish
  // gate) instead of the shell hardcoding every plugin's lifecycle vocabulary.
  test("publishedOnly uses the adapter's declared publishedStatuses", async () => {
    const declaringCtx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
      {
        name: "peer",
        schema: peerSchema,
        adapter: peerAdapter, // declares publishedStatuses: ["approved"]
      },
    ]);
    try {
      const rows = [
        { id: "peer-approved", status: "approved" },
        { id: "peer-discovered", status: "discovered" },
        { id: "peer-archived", status: "archived" },
      ];
      for (const row of rows) {
        await insertTestEntity(
          declaringCtx.dbConfig,
          {
            id: row.id,
            entityType: "peer",
            content: row.id,
            metadata: { status: row.status },
            created: Date.now(),
            updated: Date.now(),
            embedding: mockEmbedding,
          },
          declaringCtx.embeddingDbConfig,
        );
      }
      // An entity with no lifecycle status at all: for a type that DECLARES
      // its publish gate, absence of status is not published.
      await insertTestEntity(
        declaringCtx.dbConfig,
        {
          id: "peer-statusless",
          entityType: "peer",
          content: "no status",
          metadata: {},
          created: Date.now(),
          updated: Date.now(),
          embedding: mockEmbedding,
        },
        declaringCtx.embeddingDbConfig,
      );

      const count = await declaringCtx.entityService.countEntities({
        entityType: "peer",
        options: { publishedOnly: true },
      });
      expect(count).toBe(1);

      // Specifically the approved one — not the statusless one that the
      // default NULL-counts-as-published rule would have let through.
      const published = await declaringCtx.entityService.listEntities({
        entityType: "peer",
        options: { publishedOnly: true },
      });
      expect(published.map((entity) => entity.id)).toEqual(["peer-approved"]);

      // A non-declaring type keeps the default lifecycle semantics: an
      // "approved" status is unknown vocabulary there, not published.
      await insertTestEntity(
        declaringCtx.dbConfig,
        {
          id: "post-approved",
          entityType: "post",
          content: "Approved post",
          metadata: { status: "approved" },
          created: Date.now(),
          updated: Date.now(),
          embedding: mockEmbedding,
        },
        declaringCtx.embeddingDbConfig,
      );
      const postCount = await declaringCtx.entityService.countEntities({
        entityType: "post",
        options: { publishedOnly: true },
      });
      expect(postCount).toBe(0);
    } finally {
      await declaringCtx.cleanup();
    }
  });
});
