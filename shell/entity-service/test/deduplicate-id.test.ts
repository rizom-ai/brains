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

// Test note entity schema
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
});

type Note = z.infer<typeof noteSchema>;

type NoteInput = Omit<Note, "id" | "created" | "updated" | "contentHash"> & {
  id?: string;
  created?: string;
  updated?: string;
};

function createNoteInput(
  data: { title: string; content: string; tags: string[] },
  id?: string,
): NoteInput {
  return {
    ...(id && { id }),
    entityType: "note" as const,
    title: data.title,
    content: data.content,
    tags: data.tags,
    metadata: {},
  };
}

// Test adapter
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

describe("deduplicateId option", () => {
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
    entityRegistry.registerEntityType("note", noteSchema, noteAdapter);

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

  test("without deduplicateId, duplicate ID should throw", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    // First create succeeds
    await entityService.createEntity<Note>(noteData);

    // Second create with same ID should throw (preserves current behavior)
    let threw = false;
    try {
      await entityService.createEntity<Note>(noteData);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("with deduplicateId, duplicate ID should get -2 suffix", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    // First create succeeds normally
    const first = await entityService.createEntity<Note>(noteData);
    expect(first.entityId).toBe("my-note");

    // Second create with deduplicateId should get -2 suffix
    const second = await entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(second.entityId).toBe("my-note-2");

    // Verify both entities exist
    const entity1 = await entityService.getEntity<Note>("note", "my-note");
    const entity2 = await entityService.getEntity<Note>("note", "my-note-2");
    expect(entity1).not.toBeNull();
    expect(entity2).not.toBeNull();
  });

  test("with deduplicateId, triple collision should get -3 suffix", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    // Create first two
    await entityService.createEntity<Note>(noteData);
    await entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });

    // Third create should get -3 suffix
    const third = await entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(third.entityId).toBe("my-note-3");

    // Verify all three exist
    const entities = await entityService.listEntities<Note>("note");
    expect(entities).toHaveLength(3);
  });

  test("deduplicateId with no collision should use original ID", async () => {
    const noteData = createNoteInput(
      { title: "Unique Note", content: "Content", tags: [] },
      "unique-note",
    );

    // No collision — should use original ID even with deduplicateId
    const result = await entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(result.entityId).toBe("unique-note");
  });

  test("deduplicateId respects composite key (id + entityType)", async () => {
    // Register a second entity type
    const articleSchema = baseEntitySchema.extend({
      entityType: z.literal("article"),
      title: z.string(),
    });

    type Article = z.infer<typeof articleSchema>;

    const articleAdapter: EntityAdapter<Article> = {
      entityType: "article",
      schema: articleSchema,
      toMarkdown: (entity: Article): string =>
        `---\ntitle: ${entity.title}\n---\n\n${entity.content}`,
      fromMarkdown: (markdown: string): Partial<Article> => {
        const titleMatch = markdown.match(/title:\s*(.+)/);
        const title = titleMatch?.[1] ?? "Untitled";
        return { title, content: markdown };
      },
      extractMetadata: (entity: Article): Record<string, unknown> => ({
        title: entity.title,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Article): string => {
        return `---\ntitle: ${entity.title}\n---\n`;
      },
    };

    entityRegistry.registerEntityType("article", articleSchema, articleAdapter);

    // Create a note with ID "shared-id"
    const noteData = createNoteInput(
      { title: "Note", content: "Note content", tags: [] },
      "shared-id",
    );
    await entityService.createEntity<Note>(noteData);

    // Create an article with the same ID — should NOT need dedup
    // because PK is (id, entityType)
    const articleData: Omit<
      Article,
      "id" | "created" | "updated" | "contentHash"
    > & {
      id?: string;
    } = {
      id: "shared-id",
      entityType: "article" as const,
      title: "Article",
      content: "Article content",
      metadata: {},
    };

    const result = await entityService.createEntity<Article>(articleData);
    expect(result.entityId).toBe("shared-id");
  });
});
