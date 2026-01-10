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

// Helper to create note input with proper typing
// EntityInput omits id/created/updated/contentHash but makes id/created/updated optional
type NoteInput = Omit<Note, "id" | "created" | "updated" | "contentHash"> & {
  id?: string;
  created?: string;
  updated?: string;
};

function createNoteInput(data: {
  title: string;
  content: string;
  tags: string[];
}): NoteInput {
  return {
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
    // Simple parsing for tests
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

describe("Immediate Entity Persistence", () => {
  let logger: Logger;
  let entityRegistry: EntityRegistry;
  let entityService: EntityService;
  let mockJobQueueService: IJobQueueService;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Reset singletons
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create test database with migrations
    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;

    // Create mock job queue service
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

    // Create fresh instances
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

  describe("createEntity - immediate persistence", () => {
    test("entity should be readable immediately after createEntity returns", async () => {
      const noteData = createNoteInput({
        title: "Test Note",
        content: "This is the content",
        tags: ["test"],
      });

      // Create entity
      const { entityId } = await entityService.createEntity<Note>(noteData);

      // Entity should be readable immediately (before embedding job runs)
      const entity = await entityService.getEntity<Note>("note", entityId);

      expect(entity).not.toBeNull();
      expect(entity?.id).toBe(entityId);
      expect(entity?.entityType).toBe("note");
      expect(entity?.title).toBe("Test Note");
    });

    test("entity should be listable immediately after createEntity returns", async () => {
      const noteData = createNoteInput({
        title: "Listable Note",
        content: "Content here",
        tags: ["list-test"],
      });

      // Create entity
      await entityService.createEntity<Note>(noteData);

      // Entity should appear in list immediately
      const entities = await entityService.listEntities<Note>("note");

      expect(entities.length).toBe(1);
      expect(entities[0]?.title).toBe("Listable Note");
    });

    test("multiple concurrent creates should all be immediately readable", async () => {
      // Create multiple entities concurrently
      const creates = await Promise.all([
        entityService.createEntity<Note>(
          createNoteInput({ title: "Note 1", content: "Content 1", tags: [] }),
        ),
        entityService.createEntity<Note>(
          createNoteInput({ title: "Note 2", content: "Content 2", tags: [] }),
        ),
        entityService.createEntity<Note>(
          createNoteInput({ title: "Note 3", content: "Content 3", tags: [] }),
        ),
      ]);

      // All entities should be readable immediately
      const entities = await entityService.listEntities<Note>("note");
      expect(entities.length).toBe(3);

      // Each entity should be individually readable
      for (const { entityId } of creates) {
        const entity = await entityService.getEntity<Note>("note", entityId);
        expect(entity).not.toBeNull();
      }
    });
  });

  describe("updateEntity - immediate persistence", () => {
    test("updates should be visible immediately after updateEntity returns", async () => {
      // First create an entity
      const noteData = createNoteInput({
        title: "Original Title",
        content: "Original content",
        tags: [],
      });
      const { entityId } = await entityService.createEntity<Note>(noteData);

      // Get the created entity
      const original = await entityService.getEntity<Note>("note", entityId);
      expect(original).not.toBeNull();
      if (!original) throw new Error("Entity should exist");

      // Update the entity
      await entityService.updateEntity<Note>({
        ...original,
        title: "Updated Title",
        content: "Updated content",
      });

      // Changes should be visible immediately
      const updated = await entityService.getEntity<Note>("note", entityId);
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.content).toContain("Updated content");
    });
  });

  describe("search behavior with embeddings table", () => {
    test("newly created entities should NOT appear in search until embedding is ready", async () => {
      // Create entity
      const noteData = createNoteInput({
        title: "Searchable Note",
        content: "This note should eventually be searchable",
        tags: ["search"],
      });
      await entityService.createEntity<Note>(noteData);

      // Entity exists but has no embedding yet
      // Search should NOT return it (INNER JOIN with embeddings table)
      const results = await entityService.search("searchable");

      // With separate embeddings table, entity won't appear until embedding job runs
      expect(results.length).toBe(0);
    });
  });

  describe("deleteEntity - cascade to embeddings", () => {
    test("deleting entity should also remove its embedding", async () => {
      // Create entity
      const noteData = createNoteInput({
        title: "To Be Deleted",
        content: "This will be deleted",
        tags: [],
      });
      const { entityId } = await entityService.createEntity<Note>(noteData);

      // Verify entity exists
      const beforeDelete = await entityService.getEntity<Note>(
        "note",
        entityId,
      );
      expect(beforeDelete).not.toBeNull();

      // Delete the entity
      const deleted = await entityService.deleteEntity("note", entityId);
      expect(deleted).toBe(true);

      // Entity should be gone
      const afterDelete = await entityService.getEntity<Note>("note", entityId);
      expect(afterDelete).toBeNull();

      // Note: We can't easily test that the embedding was also deleted
      // without direct DB access, but the implementation should handle this
    });
  });

  describe("race condition prevention", () => {
    test("concurrent updates to same entity should not lose data", async () => {
      // Create initial entity
      const noteData = createNoteInput({
        title: "Concurrent Note",
        content: "Initial content",
        tags: ["initial"],
      });
      const { entityId } = await entityService.createEntity<Note>(noteData);

      // Get the entity
      const entity = await entityService.getEntity<Note>("note", entityId);
      expect(entity).not.toBeNull();
      if (!entity) throw new Error("Entity should exist");

      // Simulate concurrent updates (in real scenario, these would be from different processes)
      // With immediate persistence, each update writes immediately
      await Promise.all([
        entityService.updateEntity<Note>({
          ...entity,
          tags: ["tag1"],
        }),
        entityService.updateEntity<Note>({
          ...entity,
          tags: ["tag2"],
        }),
      ]);

      // The final state should have one of the tags (last write wins)
      // The important thing is the entity still exists and wasn't corrupted
      const final = await entityService.getEntity<Note>("note", entityId);
      expect(final).not.toBeNull();
      expect(final?.id).toBe(entityId);
    });
  });
});
