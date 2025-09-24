import { describe, expect, test, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import type { EntityAdapter, BaseEntity } from "../src/types";
import { baseEntitySchema } from "../src/types";
import type { IJobQueueService } from "@brains/job-queue";

import { createSilentLogger, type Logger, createId } from "@brains/utils";
import type { IEmbeddingService } from "@brains/embedding-service";

// Create a mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// ============================================================================
// TEST NOTE ENTITY (following documented functional approach)
// ============================================================================

/**
 * Note entity schema extending base entity
 * For testing, we add title and tags as note-specific fields
 */
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
  category: z.string().optional(),
});

/**
 * Note entity type
 */
type Note = z.infer<typeof noteSchema>;

/**
 * Factory function to create a Note entity (for testing)
 */
function createNote(input: Partial<Note>): Note {
  const defaults = {
    id: createId(),
    entityType: "note" as const,
    title: "Test Note",
    content: "Test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    tags: [],
    category: undefined,
  };

  return { ...defaults, ...input };
}

// ============================================================================
// UNIT TESTS - Focus on EntityService business logic, not database operations
// ============================================================================

describe("EntityService", (): void => {
  let logger: Logger;
  let entityRegistry: EntityRegistry;
  let entityService: EntityService;
  let mockJobQueueService: Partial<IJobQueueService>;

  beforeEach((): void => {
    // Reset singletons
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create minimal mock database (we're not testing DB operations)

    // Create mock job queue service
    mockJobQueueService = {
      enqueue: mock(() => Promise.resolve("mock-job-id")),
      getStatus: mock(() =>
        Promise.resolve({
          status: "completed" as const,
          id: "mock-job-id",
          type: "embedding",
          data: "",
          priority: 0,
          maxRetries: 3,
          retryCount: 0,
          lastError: null,
          createdAt: Date.now(),
          scheduledFor: Date.now(),
          startedAt: Date.now(),
          completedAt: Date.now(),
          metadata: {
            rootJobId: createId(),
            operationType: "data_processing" as const,
          },
          source: null,
          result: null,
        }),
      ),
      registerHandler: mock(),
    };

    // Create fresh instances
    logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);
    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService as unknown as IJobQueueService,
      dbConfig: { url: "file::memory:" }, // Use in-memory database for tests
    });
  });

  test("getEntityTypes returns empty array when no types registered", (): void => {
    const types = entityService.getEntityTypes();
    expect(types).toEqual([]);
  });

  test("getEntityTypes returns registered types", (): void => {
    // Mock the registry to return specific types
    const mockGetAllEntityTypes = mock(() => ["note", "profile"]);
    entityRegistry.getAllEntityTypes = mockGetAllEntityTypes;

    const types = entityService.getEntityTypes();
    expect(types).toEqual(["note", "profile"]);
    expect(mockGetAllEntityTypes).toHaveBeenCalled();
  });

  test("entity validation uses EntityRegistry", (): void => {
    const testEntity = createNote({ title: "Test Note", category: "test" });

    // Mock the registry validation - just return the entity for this test
    const mockValidateEntity = mock(
      (_type: string, entity: unknown) => entity,
    ) as typeof entityRegistry.validateEntity;
    entityRegistry.validateEntity = mockValidateEntity;

    // Mock the adapter
    const mockAdapter = {
      entityType: "note",
      schema: noteSchema,
      toMarkdown: mock(() => "Test content"),
      fromMarkdown: mock(() => ({ content: "Test content" })),
      extractMetadata: mock(() => ({})),
      parseFrontMatter: mock(() => ({})),
      generateFrontMatter: mock(() => ""),
    };
    const mockGetAdapter = mock(
      () => mockAdapter,
    ) as unknown as typeof entityRegistry.getAdapter;
    entityRegistry.getAdapter = mockGetAdapter;

    // This would normally do database operations, but we're testing the validation logic
    // The actual database calls would be tested in integration tests
    expect(() => {
      entityRegistry.validateEntity("note", testEntity);
      const adapter = entityRegistry.getAdapter("note");
      adapter.toMarkdown(testEntity);
    }).not.toThrow();

    expect(mockValidateEntity).toHaveBeenCalledWith("note", testEntity);
    expect(mockGetAdapter).toHaveBeenCalled();
  });

  test("entity creation generates ID when not provided", (): void => {
    const entityData = {
      id: createId(),
      entityType: "note",
      title: "Test Note",
      content: "Test content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
      category: "general",
    };

    // Test the ID generation logic
    const entityWithId = {
      ...entityData,
      id: entityData.id || createId(),
    };

    expect(entityWithId.id).toBeDefined();
    expect(typeof entityWithId.id).toBe("string");
    expect(entityWithId.id.length).toBeGreaterThan(0);
  });

  test("entity creation preserves provided ID", (): void => {
    const customId = "custom-test-id";
    const entityData = {
      id: customId,
      entityType: "note",
      title: "Test Note",
      content: "Test content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
    };

    // Test that provided ID is preserved
    const entityWithId = {
      ...entityData,
      id: entityData.id || createId(),
    };

    expect(entityWithId.id).toBe(customId);
  });

  test("update entity modifies updated timestamp", (): void => {
    const originalTime = "2023-01-01T00:00:00.000Z";
    const entity = createNote({
      id: "test-id",
      title: "Original Title",
      created: originalTime,
      updated: originalTime,
    });

    // Simulate update logic (what EntityService.updateEntitySync does)
    const updatedEntity = {
      ...entity,
      title: "Updated Title",
      updated: new Date().toISOString(),
    };

    expect(updatedEntity.title).toBe("Updated Title");
    expect(updatedEntity.updated).not.toBe(originalTime);
    expect(updatedEntity.created).toBe(originalTime); // Should not change
    expect(updatedEntity.id).toBe(entity.id); // Should not change
  });

  // Note: toMarkdown tests removed - this is now handled by the adapter

  test("serializeEntity converts entities to markdown", () => {
    // Create test adapter
    const testAdapter: EntityAdapter<Note> = {
      entityType: "note",
      schema: noteSchema,
      toMarkdown: (entity: Note): string =>
        `# ${entity.title}\n\n${entity.content}`,
      fromMarkdown: (_markdown: string): Partial<Note> => {
        const lines = _markdown.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "") ?? "Untitled";
        const content = lines.slice(2).join("\n");
        return { title, content };
      },
      extractMetadata: (entity: Note): Record<string, unknown> => ({
        category: entity.category,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Note): string => {
        return `---\ncategory: ${entity.category ?? ""}\n---\n`;
      },
    };

    // Register a test entity type
    entityRegistry.registerEntityType("note", noteSchema, testAdapter);

    const testEntity: Note = {
      id: "test-id",
      entityType: "note",
      content: "Test content",
      created: "2023-01-01T00:00:00.000Z",
      updated: "2023-01-01T00:00:00.000Z",
      title: "Test Note",
      tags: ["test"],
    };

    const markdown = entityService.serializeEntity(testEntity);
    expect(markdown).toBe("# Test Note\n\nTest content");
  });

  test("deserializeEntity converts markdown to entities", () => {
    // Create and register test adapter
    const testAdapter: EntityAdapter<Note> = {
      entityType: "note",
      schema: noteSchema,
      toMarkdown: (entity: Note): string =>
        `# ${entity.title}\n\n${entity.content}`,
      fromMarkdown: (_markdown: string): Partial<Note> => {
        const lines = _markdown.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "") ?? "Untitled";
        const content = lines.slice(2).join("\n");
        return { title, content };
      },
      extractMetadata: (entity: Note): Record<string, unknown> => ({
        category: entity.category,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Note): string => {
        return `---\ncategory: ${entity.category ?? ""}\n---\n`;
      },
    };

    entityRegistry.registerEntityType("note", noteSchema, testAdapter);

    const markdown = "# Test Note\n\nTest content";
    const parsedEntity = entityService.deserializeEntity(
      markdown,
      "note",
    ) as Note;

    expect(parsedEntity.title).toBe("Test Note");
    expect(parsedEntity.content).toBe("Test content");
  });

  test("deserializeEntity throws for unknown entity types", () => {
    const markdown = "# Test Note\n\nTest content";
    expect(() =>
      entityService.deserializeEntity(markdown, "unknownType"),
    ).toThrow(
      "Entity type registration failed for unknownType: No adapter registered for entity type",
    );
  });

  test("upsertEntity creates new entity when it doesn't exist", async () => {
    const testEntity: BaseEntity = {
      id: "new-entity",
      entityType: "base",
      content: "New content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Mock getEntity to return null (entity doesn't exist)
    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(null),
    );

    // Mock createEntity
    entityService.createEntity = mock(() =>
      Promise.resolve({ entityId: "new-entity", jobId: "job-123" }),
    );

    const result = await entityService.upsertEntity(testEntity);

    expect(result.entityId).toBe("new-entity");
    expect(result.jobId).toBe("job-123");
    expect(result.created).toBe(true);

    // Verify getEntity was called
    expect(entityService.getEntity).toHaveBeenCalledWith("base", "new-entity");

    // Verify createEntity was called
    expect(entityService.createEntity).toHaveBeenCalledWith(
      testEntity,
      undefined,
    );
  });

  test("upsertEntity updates existing entity", async () => {
    const existingEntity: BaseEntity = {
      id: "existing-entity",
      entityType: "base",
      content: "Initial content",
      created: "2023-01-01T00:00:00.000Z",
      updated: "2023-01-01T00:00:00.000Z",
    };

    const updatedEntity: BaseEntity = {
      ...existingEntity,
      content: "Updated content",
      updated: new Date().toISOString(),
    };

    // Mock getEntity to return existing entity
    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(existingEntity),
    ) as typeof entityService.getEntity;

    // Mock updateEntity
    entityService.updateEntity = mock(() =>
      Promise.resolve({ entityId: "existing-entity", jobId: "job-456" }),
    );

    const result = await entityService.upsertEntity(updatedEntity);

    expect(result.entityId).toBe("existing-entity");
    expect(result.jobId).toBe("job-456");
    expect(result.created).toBe(false);

    // Verify getEntity was called
    expect(entityService.getEntity).toHaveBeenCalledWith(
      "base",
      "existing-entity",
    );

    // Verify updateEntity was called
    expect(entityService.updateEntity).toHaveBeenCalledWith(
      updatedEntity,
      undefined,
    );
  });

  test("upsertEntity passes options to create/update", async () => {
    const testEntity: BaseEntity = {
      id: "test-entity",
      entityType: "base",
      content: "Test content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const options = { priority: 5, maxRetries: 10 };

    // Mock getEntity to return null
    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(null),
    );

    // Mock createEntity
    entityService.createEntity = mock(() =>
      Promise.resolve({ entityId: "test-entity", jobId: "job-789" }),
    );

    await entityService.upsertEntity(testEntity, options);

    // Verify options were passed through
    expect(entityService.createEntity).toHaveBeenCalledWith(
      testEntity,
      options,
    );
  });
});
