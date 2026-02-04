import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import {
  createTestEntityDatabase,
  insertTestEntity,
} from "./helpers/test-entity-db";
import type { BaseEntity, EntityAdapter } from "../src/types";
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
  }),
});

type Post = z.infer<typeof postSchema>;

type PostMetadata = z.infer<typeof postSchema>["metadata"];

// Simple test adapter - fromMarkdown only returns entity-specific fields
// Core fields (id, entityType, content, etc.) come from database
const postAdapter: EntityAdapter<Post, PostMetadata> = {
  entityType: "post",
  schema: postSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: () => ({}), // No entity-specific fields to extract
  extractMetadata: (entity) => entity.metadata,
  parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>) =>
    schema.parse({}),
  generateFrontMatter: () => "",
};

describe("listEntities sortFields", () => {
  let entityService: EntityService;
  let cleanup: () => Promise<void>;
  let dbConfig: { url: string };

  beforeEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create test database with migrations
    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;
    dbConfig = testDb.config;

    const logger = createSilentLogger();
    const entityRegistry = EntityRegistry.createFresh(logger);
    const mockJobQueueService = createMockJobQueueService({
      returns: { enqueue: "mock-job-id" },
    });

    // Register the post entity type
    entityRegistry.registerEntityType("post", postSchema, postAdapter);

    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: testDb.config,
    });

    // Create test entities with different metadata values
    const mockEmbedding = new Float32Array(384).fill(0.1);

    await insertTestEntity(dbConfig, {
      id: "post-1",
      entityType: "post",
      content: "Post 1 content",
      metadata: {
        publishedAt: "2025-01-03T00:00:00.000Z",
        status: "published",
      },
      created: new Date("2025-01-01T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-01T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(dbConfig, {
      id: "post-2",
      entityType: "post",
      content: "Post 2 content",
      metadata: {
        publishedAt: "2025-01-01T00:00:00.000Z",
        status: "published",
      },
      created: new Date("2025-01-02T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-02T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(dbConfig, {
      id: "post-3",
      entityType: "post",
      content: "Post 3 content",
      metadata: {
        publishedAt: "2025-01-02T00:00:00.000Z",
        status: "draft",
      },
      created: new Date("2025-01-03T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-03T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });
  });

  afterEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();
    await cleanup();
  });

  test("should sort by single metadata field (publishedAt desc)", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
    });

    expect(result).toHaveLength(3);
    // Should be ordered by publishedAt descending: post-1 (Jan 3), post-3 (Jan 2), post-2 (Jan 1)
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-3", "post-2"]);
  });

  test("should sort by single metadata field (publishedAt asc)", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "asc" }],
    });

    expect(result).toHaveLength(3);
    // Should be ordered by publishedAt ascending: post-2 (Jan 1), post-3 (Jan 2), post-1 (Jan 3)
    expect(result.map((r) => r.id)).toEqual(["post-2", "post-3", "post-1"]);
  });

  test("should sort by multiple metadata fields", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [
        { field: "status", direction: "asc" }, // draft comes before published alphabetically
        { field: "publishedAt", direction: "desc" },
      ],
    });

    expect(result).toHaveLength(3);
    // First by status asc (draft < published), then by publishedAt desc
    // draft: post-3
    // published: post-1 (Jan 3), post-2 (Jan 1)
    expect(result.map((r) => r.id)).toEqual(["post-3", "post-1", "post-2"]);
  });

  test("should sort by system field (created)", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "created", direction: "asc" }],
    });

    expect(result).toHaveLength(3);
    // Should be ordered by created ascending: post-1, post-2, post-3
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-2", "post-3"]);
  });

  test("should combine sortFields with pagination", async () => {
    const page1 = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      limit: 2,
      offset: 0,
    });

    expect(page1).toHaveLength(2);
    expect(page1.map((r) => r.id)).toEqual(["post-1", "post-3"]); // Jan 3, Jan 2

    const page2 = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      limit: 2,
      offset: 2,
    });

    expect(page2).toHaveLength(1);
    expect(page2.map((r) => r.id)).toEqual(["post-2"]); // Jan 1
  });

  test("should combine sortFields with publishedOnly filter", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      publishedOnly: true,
    });

    expect(result).toHaveLength(2); // Only published posts
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-2"]); // Jan 3, Jan 1
    // post-3 (draft) should be excluded
  });

  test("should include entities WITHOUT status field when publishedOnly is true", async () => {
    // Create an entity without a status field (like profile, link, project, etc.)
    const mockEmbedding = new Float32Array(384).fill(0.1);
    await insertTestEntity(dbConfig, {
      id: "post-no-status",
      entityType: "post",
      content: "Post without status field",
      metadata: {
        publishedAt: "2025-01-04T00:00:00.000Z",
        // NOTE: no status field!
      },
      created: new Date("2025-01-04T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-04T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    const result = await entityService.listEntities<BaseEntity>("post", {
      publishedOnly: true,
    });

    // Should include: post-1 (published), post-2 (published), post-no-status (no status = include)
    // Should exclude: post-3 (draft)
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual([
      "post-1",
      "post-2",
      "post-no-status",
    ]);
  });

  test("should return all entities when no limit is specified", async () => {
    // When no limit option is provided, listEntities should return all matching entities
    const result = await entityService.listEntities<BaseEntity>("post");

    expect(result).toHaveLength(3);
  });

  test("should respect explicit limit when provided", async () => {
    const result = await entityService.listEntities<BaseEntity>("post", {
      limit: 2,
    });

    expect(result).toHaveLength(2);
  });
});
