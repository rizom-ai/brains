import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestEntity } from "@brains/test-utils";
import { createEmbeddingDatabase } from "../src/db/embedding-db";
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

  test("should store embedding for existing entity", async () => {
    const content = "Test content for embedding";
    const testEntity = createTestEntity("test", { content });
    const mockEmbedding = new Float32Array(MOCK_DIMENSIONS).fill(0.1);

    // Create entity via service
    await ctx.entityService.createEntity({
      entity: {
        ...testEntity,
        id: "test-entity",
      },
    });

    await ctx.entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: mockEmbedding,
      contentHash: testEntity.contentHash,
    });

    // Verify embedding is in the embedding DB
    const { db: embDb } = createEmbeddingDatabase(ctx.embeddingDbConfig);
    const embeddingResult = await embDb
      .select()
      .from(embeddings)
      .where(
        and(
          eq(embeddings.entityId, "test-entity"),
          eq(embeddings.entityType, "test"),
        ),
      );

    expect(embeddingResult).toHaveLength(1);
    expect(embeddingResult[0]?.contentHash).toBe(testEntity.contentHash);
  });

  test("should update existing embedding (upsert behavior)", async () => {
    const content = "Test content for embedding";

    await insertTestEntity(
      ctx.dbConfig,
      {
        id: "test-entity",
        entityType: "test",
        content,
        metadata: { important: "data" },
        created: Date.now(),
        updated: Date.now(),
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      },
      ctx.embeddingDbConfig,
    );

    const updatedEntity = createTestEntity("test", {
      content: "updated content",
    });

    await ctx.entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.5),
      contentHash: updatedEntity.contentHash,
    });

    const { db: embDb } = createEmbeddingDatabase(ctx.embeddingDbConfig);
    const embeddingResult = await embDb
      .select()
      .from(embeddings)
      .where(
        and(
          eq(embeddings.entityId, "test-entity"),
          eq(embeddings.entityType, "test"),
        ),
      );

    expect(embeddingResult).toHaveLength(1);
    expect(embeddingResult[0]?.contentHash).toBe(updatedEntity.contentHash);
  });

  test("should NOT affect entity data when storing embedding", async () => {
    const content = "Original content";

    await insertTestEntity(
      ctx.dbConfig,
      {
        id: "test-entity",
        entityType: "test",
        content,
        metadata: { coverImageId: "my-cover-image", otherField: "preserved" },
        created: Date.now(),
        updated: Date.now(),
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      },
      ctx.embeddingDbConfig,
    );

    const savedEntity = await ctx.entityService.getEntity({
      entityType: "test",
      id: "test-entity",
    });
    expect(savedEntity).not.toBeNull();
    expect(savedEntity?.metadata["coverImageId"]).toBe("my-cover-image");

    const newEntity = createTestEntity("test", { content: "new content" });
    await ctx.entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.5),
      contentHash: newEntity.contentHash,
    });

    const afterEmbedding = await ctx.entityService.getEntity({
      entityType: "test",
      id: "test-entity",
    });
    expect(afterEmbedding).not.toBeNull();
    expect(afterEmbedding?.metadata["coverImageId"]).toBe("my-cover-image");
    expect(afterEmbedding?.metadata["otherField"]).toBe("preserved");
    expect(afterEmbedding?.content).toBe(content);
  });
});
