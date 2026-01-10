import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import {
  createTestEntityDatabase,
  insertTestEntity,
} from "./helpers/test-entity-db";
import type { EntityAdapter } from "../src/types";
import { baseEntitySchema } from "../src/types";
import {
  createSilentLogger,
  createMockJobQueueService,
} from "@brains/test-utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import { z } from "@brains/utils";

const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Post schema for testing
const postSchema = baseEntitySchema.extend({
  entityType: z.literal("post"),
  metadata: z.object({
    publishedAt: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
  }),
});

type Post = z.infer<typeof postSchema>;
type PostMetadata = z.infer<typeof postSchema>["metadata"];

const postAdapter: EntityAdapter<Post, PostMetadata> = {
  entityType: "post",
  schema: postSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: () => ({}),
  extractMetadata: (entity) => entity.metadata,
  parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>) =>
    schema.parse({}),
  generateFrontMatter: () => "",
};

describe("countEntities", () => {
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

    entityRegistry.registerEntityType("post", postSchema, postAdapter);

    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: testDb.config,
    });

    // Create test entities using the helper
    const mockEmbedding = new Float32Array(384).fill(0.1);

    // 2 published posts
    await insertTestEntity(dbConfig, {
      id: "post-1",
      entityType: "post",
      content: "Post 1",
      metadata: { status: "published", category: "tech" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(dbConfig, {
      id: "post-2",
      entityType: "post",
      content: "Post 2",
      metadata: { status: "published", category: "life" },
      created: Date.now(),
      updated: Date.now(),
      embedding: mockEmbedding,
    });

    // 1 draft post
    await insertTestEntity(dbConfig, {
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
    EntityService.resetInstance();
    EntityRegistry.resetInstance();
    await cleanup();
  });

  test("should count all entities of a type", async () => {
    const count = await entityService.countEntities("post");
    expect(count).toBe(3);
  });

  test("should return 0 for non-existent entity type", async () => {
    const count = await entityService.countEntities("nonexistent");
    expect(count).toBe(0);
  });

  test("should count only published entities when publishedOnly is true", async () => {
    const count = await entityService.countEntities("post", {
      publishedOnly: true,
    });
    expect(count).toBe(2);
  });

  test("should count entities with metadata filter", async () => {
    const count = await entityService.countEntities("post", {
      filter: { metadata: { category: "tech" } },
    });
    expect(count).toBe(2); // post-1 and post-3
  });

  test("should combine publishedOnly and metadata filter", async () => {
    const count = await entityService.countEntities("post", {
      publishedOnly: true,
      filter: { metadata: { category: "tech" } },
    });
    expect(count).toBe(1); // only post-1
  });
});
