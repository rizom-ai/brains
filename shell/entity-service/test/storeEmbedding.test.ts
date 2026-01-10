import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import {
  createTestEntityDatabase,
  insertTestEntity,
} from "./helpers/test-entity-db";
import type { EntityAdapter, BaseEntity } from "../src/types";
import { baseEntitySchema } from "../src/types";
import {
  createSilentLogger,
  createMockJobQueueService,
} from "@brains/test-utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import { z, computeContentHash } from "@brains/utils";
import { createEntityDatabase } from "../src/db";
import { embeddings } from "../src/schema/embeddings";
import { and, eq } from "drizzle-orm";

// Mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Simple test entity schema
const testSchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
});

// Simple test adapter
const testAdapter: EntityAdapter<BaseEntity> = {
  entityType: "test",
  schema: testSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: () => ({}),
  extractMetadata: () => ({}),
  parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>) =>
    schema.parse({}),
  generateFrontMatter: () => "",
};

describe("storeEmbedding", () => {
  let entityService: EntityService;
  let cleanup: () => Promise<void>;
  let dbConfig: { url: string };

  beforeEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;
    dbConfig = testDb.config;

    const logger = createSilentLogger();
    const entityRegistry = EntityRegistry.createFresh(logger);
    const mockJobQueueService = createMockJobQueueService({
      returns: { enqueue: "mock-job-id" },
    });

    entityRegistry.registerEntityType("test", testSchema, testAdapter);

    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: testDb.config,
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  test("should store embedding for existing entity", async () => {
    // Create an entity first
    const content = "Test content for embedding";
    const contentHash = computeContentHash(content);
    const mockEmbedding = new Float32Array(384).fill(0.1);

    // Insert entity without embedding (simulating immediate persistence before embedding job)
    const { db } = createEntityDatabase(dbConfig);
    const { entities } = await import("../src/schema/entities");

    await db.insert(entities).values({
      id: "test-entity",
      entityType: "test",
      content,
      contentHash,
      metadata: { important: "data" },
      created: Date.now(),
      updated: Date.now(),
    });

    // Store embedding
    await entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: mockEmbedding,
      contentHash,
    });

    // Verify embedding was stored in the embeddings table
    const embeddingResult = await db
      .select()
      .from(embeddings)
      .where(
        and(
          eq(embeddings.entityId, "test-entity"),
          eq(embeddings.entityType, "test"),
        ),
      );

    expect(embeddingResult).toHaveLength(1);
    expect(embeddingResult[0]?.contentHash).toBe(contentHash);
  });

  test("should update existing embedding (upsert behavior)", async () => {
    // Create an entity with initial embedding
    const content = "Test content for embedding";
    const mockEmbedding1 = new Float32Array(384).fill(0.1);

    await insertTestEntity(dbConfig, {
      id: "test-entity",
      entityType: "test",
      content,
      metadata: { important: "data" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding1,
    });

    // Store new embedding (should update)
    const mockEmbedding2 = new Float32Array(384).fill(0.5);
    const newContentHash = computeContentHash("updated content");

    await entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: mockEmbedding2,
      contentHash: newContentHash,
    });

    // Verify embedding was updated
    const { db } = createEntityDatabase(dbConfig);
    const embeddingResult = await db
      .select()
      .from(embeddings)
      .where(
        and(
          eq(embeddings.entityId, "test-entity"),
          eq(embeddings.entityType, "test"),
        ),
      );

    expect(embeddingResult).toHaveLength(1);
    expect(embeddingResult[0]?.contentHash).toBe(newContentHash);
  });

  test("should NOT affect entity data when storing embedding", async () => {
    // Create an entity with specific metadata
    const content = "Original content";
    const mockEmbedding = new Float32Array(384).fill(0.1);

    await insertTestEntity(dbConfig, {
      id: "test-entity",
      entityType: "test",
      content,
      metadata: { coverImageId: "my-cover-image", otherField: "preserved" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });

    // Verify entity was saved with metadata
    const savedEntity = await entityService.getEntity("test", "test-entity");
    expect(savedEntity).not.toBeNull();
    expect(savedEntity?.metadata["coverImageId"]).toBe("my-cover-image");

    // Store a new embedding (simulating embedding update)
    await entityService.storeEmbedding({
      entityId: "test-entity",
      entityType: "test",
      embedding: new Float32Array(384).fill(0.5),
      contentHash: computeContentHash("new content"),
    });

    // Verify metadata was NOT affected
    const afterEmbedding = await entityService.getEntity("test", "test-entity");
    expect(afterEmbedding).not.toBeNull();
    expect(afterEmbedding?.metadata["coverImageId"]).toBe("my-cover-image");
    expect(afterEmbedding?.metadata["otherField"]).toBe("preserved");
    // Content should also be unchanged
    expect(afterEmbedding?.content).toBe(content);
  });
});
