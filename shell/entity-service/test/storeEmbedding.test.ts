import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestEntity } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { createEntityDatabase } from "../src/db";
import { embeddings } from "../src/schema/embeddings";
import { and, eq } from "drizzle-orm";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { insertTestEntity } from "./helpers/test-entity-db";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("storeEmbedding", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function readEmbedding(): Promise<
    typeof embeddings.$inferSelect | undefined
  > {
    const { db, client } = createEntityDatabase(ctx.dbConfig);
    try {
      const rows = await db
        .select()
        .from(embeddings)
        .where(
          and(
            eq(embeddings.entityId, "test-entity"),
            eq(embeddings.entityType, "test"),
          ),
        );
      return rows[0];
    } finally {
      client.close();
    }
  }

  test("stores an embedding in the entity database", async () => {
    const testEntity = createTestEntity("test", {
      id: "test-entity",
      content: "Test content for embedding",
    });
    await ctx.entityService.createEntity({ entity: testEntity });

    await ctx.entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: testEntity.contentHash,
    });

    expect((await readEmbedding())?.contentHash).toBe(testEntity.contentHash);
  });

  test("updates the current embedding", async () => {
    const content = "Test content for embedding";
    await insertTestEntity(ctx.dbConfig, {
      id: "test-entity",
      entityType: "test",
      content,
      metadata: { important: "data" },
      created: Date.now(),
      updated: Date.now(),
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
    });

    const contentHash = computeContentHash(content);
    await ctx.entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.5),
      contentHash,
    });

    const stored = await readEmbedding();
    expect(stored?.contentHash).toBe(contentHash);
    expect(stored?.embedding[0]).toBeCloseTo(0.5);
  });

  test("ignores an embedding generated for stale content", async () => {
    const content = "Original content";
    await insertTestEntity(ctx.dbConfig, {
      id: "test-entity",
      entityType: "test",
      content,
      metadata: { coverImageId: "my-cover-image", otherField: "preserved" },
      created: Date.now(),
      updated: Date.now(),
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
    });

    await ctx.entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.5),
      contentHash: computeContentHash("new content"),
    });

    const savedEntity = await ctx.entityService.getEntity({
      entityType: "test",
      id: "test-entity",
    });
    expect(savedEntity?.metadata["coverImageId"]).toBe("my-cover-image");
    expect(savedEntity?.metadata["otherField"]).toBe("preserved");
    expect(savedEntity?.content).toBe(content);
    expect((await readEmbedding())?.embedding[0]).toBeCloseTo(0.1);
  });

  test("rejects vectors with dimensions from another provider", async () => {
    const testEntity = createTestEntity("test", {
      id: "test-entity",
      content: "Dimension check",
    });
    await ctx.entityService.createEntity({ entity: testEntity });

    expect(
      ctx.entityService.storeEmbedding({
        entityId: testEntity.id,
        entityType: "test",
        embedding: new Float32Array(MOCK_DIMENSIONS + 1),
        contentHash: testEntity.contentHash,
      }),
    ).rejects.toThrow(
      `Expected ${MOCK_DIMENSIONS} embedding dimensions, received ${MOCK_DIMENSIONS + 1}`,
    );
  });
});
