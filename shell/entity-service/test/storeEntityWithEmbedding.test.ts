import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import type { EntityAdapter, BaseEntity } from "../src/types";
import { baseEntitySchema } from "../src/types";
import {
  createSilentLogger,
  createMockJobQueueService,
} from "@brains/test-utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import { z } from "@brains/utils";

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

describe("storeEntityWithEmbedding", () => {
  let entityService: EntityService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;

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

  test("should NOT overwrite existing metadata when updating embedding", async () => {
    // Create an entity with metadata including coverImageId
    const originalContent = "Original content";
    const mockEmbedding = new Float32Array(384).fill(0.1);

    // Insert entity directly with storeEntityWithEmbedding first
    await entityService.storeEntityWithEmbedding({
      id: "test-entity",
      entityType: "test",
      content: originalContent,
      metadata: { coverImageId: "my-cover-image", otherField: "preserved" },
      created: Date.now(),
      updated: Date.now(),
      contentWeight: 1.0,
      embedding: mockEmbedding,
    });

    // Verify entity was saved with metadata
    const savedEntity = await entityService.getEntity("test", "test-entity");
    expect(savedEntity).not.toBeNull();
    expect(savedEntity?.metadata["coverImageId"]).toBe("my-cover-image");

    // Now call storeEntityWithEmbedding AGAIN with DIFFERENT metadata (simulating stale job)
    // This should ONLY update embedding, not overwrite metadata
    await entityService.storeEntityWithEmbedding({
      id: "test-entity",
      entityType: "test",
      content: originalContent, // Same content (would pass content hash check)
      metadata: { staleField: "this-should-not-replace" }, // Stale metadata, missing coverImageId!
      created: Date.now(),
      updated: Date.now(),
      contentWeight: 1.0,
      embedding: new Float32Array(384).fill(0.5),
    });

    // Verify metadata was NOT overwritten
    const afterEmbedding = await entityService.getEntity("test", "test-entity");
    expect(afterEmbedding).not.toBeNull();
    // coverImageId should still be there!
    expect(afterEmbedding?.metadata["coverImageId"]).toBe("my-cover-image");
    expect(afterEmbedding?.metadata["otherField"]).toBe("preserved");
  });

  test("should update embedding and contentWeight only", async () => {
    // Create an entity
    const content = "Test content for embedding";
    const mockEmbedding = new Float32Array(384).fill(0.1);

    // Insert entity with initial embedding
    await entityService.storeEntityWithEmbedding({
      id: "embed-test",
      entityType: "test",
      content,
      metadata: { important: "data" },
      created: Date.now(),
      updated: Date.now(),
      contentWeight: 1.0,
      embedding: mockEmbedding,
    });

    // Store with different embedding and contentWeight
    await entityService.storeEntityWithEmbedding({
      id: "embed-test",
      entityType: "test",
      content,
      metadata: {}, // Empty metadata from job
      created: Date.now(),
      updated: Date.now() + 1000, // Different timestamp
      contentWeight: 0.8,
      embedding: new Float32Array(384).fill(0.3),
    });

    // Verify content and metadata unchanged, but embedding was stored
    const result = await entityService.getEntity("test", "embed-test");
    expect(result).not.toBeNull();
    expect(result?.content).toBe(content);
    expect(result?.metadata["important"]).toBe("data"); // Metadata preserved
  });
});
