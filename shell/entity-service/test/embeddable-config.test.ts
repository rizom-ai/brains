import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { z } from "@brains/utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import type { EntityAdapter } from "../src/types";
import { baseEntitySchema } from "../src/types";
import type { IJobQueueService } from "@brains/job-queue";
import { createTestEntityDatabase } from "./helpers/test-entity-db";

import {
  createSilentLogger,
  createMockJobQueueService,
} from "@brains/test-utils";
import { type Logger, createId } from "@brains/utils";
import type { IEmbeddingService } from "@brains/embedding-service";

// Mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Test note entity schema (embeddable by default)
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
});

type Note = z.infer<typeof noteSchema>;

// Test image entity schema (will be registered with embeddable: false)
const imageSchema = baseEntitySchema.extend({
  entityType: z.literal("image"),
});

type ImageEntity = z.infer<typeof imageSchema>;

// Note adapter
const noteAdapter: EntityAdapter<Note> = {
  entityType: "note",
  schema: noteSchema,
  toMarkdown: (entity: Note): string =>
    `---\ntitle: ${entity.title}\ntags: ${JSON.stringify(entity.tags)}\n---\n\n${entity.content}`,
  fromMarkdown: (markdown: string): Partial<Note> => {
    const titleMatch = markdown.match(/title:\s*(.+)/);
    const title = titleMatch?.[1] ?? "Untitled";
    const bodyMatch = markdown.match(/---\n\n(.+)/s);
    const content = bodyMatch?.[1] ?? markdown;
    return { title, content, tags: [] };
  },
  extractMetadata: (entity: Note): Record<string, unknown> => ({
    title: entity.title,
    tags: entity.tags,
  }),
  parseFrontMatter: <TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter => schema.parse({}),
  generateFrontMatter: (entity: Note): string => {
    return `---\ntitle: ${entity.title}\ntags: ${JSON.stringify(entity.tags)}\n---\n`;
  },
};

// Image adapter (non-embeddable)
const imageAdapter: EntityAdapter<ImageEntity> = {
  entityType: "image",
  schema: imageSchema,
  toMarkdown: (entity: ImageEntity): string => entity.content,
  fromMarkdown: (content: string): Partial<ImageEntity> => ({
    entityType: "image",
    content,
    metadata: {},
  }),
  extractMetadata: (): Record<string, unknown> => ({}),
  parseFrontMatter: <TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter => schema.parse({}),
  generateFrontMatter: (): string => "",
};

describe("EntityTypeConfig embeddable flag", () => {
  let logger: Logger;
  let entityRegistry: EntityRegistry;
  let entityService: EntityService;
  let mockJobQueueService: IJobQueueService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;

    mockJobQueueService = createMockJobQueueService({
      returns: {
        enqueue: "mock-job-id",
        getStatus: {
          status: "pending" as const,
          id: "mock-job-id",
          type: "embedding",
          data: "",
          priority: 0,
          maxRetries: 3,
          retryCount: 0,
          lastError: null,
          createdAt: Date.now(),
          scheduledFor: Date.now(),
          startedAt: null,
          completedAt: null,
          metadata: {
            rootJobId: createId(),
            operationType: "data_processing" as const,
          },
          source: null,
          result: null,
        },
      },
    });

    logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);

    // Register note with default config (embeddable: true by default)
    entityRegistry.registerEntityType("note", noteSchema, noteAdapter);

    // Register image with embeddable: false
    entityRegistry.registerEntityType("image", imageSchema, imageAdapter, {
      embeddable: false,
    });

    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: testDb.config,
    });
  });

  afterEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();
    await cleanup();
  });

  test("createEntity queues embedding job for embeddable entity types", async () => {
    const noteData = {
      entityType: "note" as const,
      title: "Test Note",
      content: "Some text content",
      tags: [],
      metadata: {},
    };

    await entityService.createEntity<Note>(noteData);

    expect(mockJobQueueService.enqueue).toHaveBeenCalled();
  });

  test("createEntity skips embedding job when embeddable is false", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await entityService.createEntity<ImageEntity>(imageData);

    // Entity should still be persisted
    const entity = await entityService.getEntity<ImageEntity>(
      "image",
      result.entityId,
    );
    expect(entity).not.toBeNull();

    // But no embedding job should have been queued
    expect(mockJobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("updateEntity skips embedding job when embeddable is false", async () => {
    // First create the image entity
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const { entityId } =
      await entityService.createEntity<ImageEntity>(imageData);

    // Get the entity for update
    const entity = await entityService.getEntity<ImageEntity>(
      "image",
      entityId,
    );
    expect(entity).not.toBeNull();
    if (!entity) throw new Error("Entity should exist");

    // Update the entity
    await entityService.updateEntity<ImageEntity>({
      ...entity,
      content: "data:image/png;base64,UPDATED",
    });

    // No embedding job should have been queued for the update either
    expect(mockJobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("createEntity returns empty jobId when embedding is skipped", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await entityService.createEntity<ImageEntity>(imageData);

    expect(result.entityId).toBeDefined();
    expect(result.jobId).toBe("");
  });
});
