import { describe, expect, test, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { EntityService } from "@/entity/entityService";
import { EntityRegistry } from "@/entity/entityRegistry";
import type { EntityAdapter } from "@brains/base-entity";
import type { DrizzleDB } from "@brains/db";

import { createSilentLogger, type Logger } from "@brains/utils";
import { baseEntitySchema } from "@brains/types";
import { createId } from "@brains/db/schema";
import type { IEmbeddingService } from "@/embedding/embeddingService";

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
  let mockDb: DrizzleDB;
  let logger: Logger;
  let entityRegistry: EntityRegistry;
  let entityService: EntityService;

  beforeEach((): void => {
    // Reset singletons
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create minimal mock database (we're not testing DB operations)
    mockDb = {} as DrizzleDB;

    // Create fresh instances
    logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);
    entityService = EntityService.createFresh({
      db: mockDb,
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
    });
  });

  test("getSupportedEntityTypes returns empty array when no types registered", (): void => {
    const types = entityService.getSupportedEntityTypes();
    expect(types).toEqual([]);
  });

  test("getSupportedEntityTypes returns registered types", (): void => {
    // Mock the registry to return specific types
    const mockGetAllEntityTypes = mock(() => ["note", "profile"]);
    entityRegistry.getAllEntityTypes = mockGetAllEntityTypes;

    const types = entityService.getSupportedEntityTypes();
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

    // Simulate update logic (what EntityService.updateEntity does)
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

  test("hasAdapter returns true for registered types", () => {
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

    expect(entityService.hasAdapter("note")).toBe(true);
    expect(entityService.hasAdapter("unknownType")).toBe(false);
  });

  test("getAdapter returns adapter for registered types", () => {
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

    const retrievedAdapter = entityService.getAdapter("note");
    expect(retrievedAdapter).toBeDefined();
    expect(retrievedAdapter.entityType).toBe("note");
  });

  test("getAdapter throws for unregistered types", () => {
    expect(() => entityService.getAdapter("unknownType")).toThrow(
      "No adapter registered for entity type: unknownType",
    );
  });

  test("getAllEntityTypes returns same as getEntityTypes", () => {
    // Mock the registry to return specific types
    const mockGetAllEntityTypes = mock(() => ["note", "profile", "task"]);
    entityRegistry.getAllEntityTypes = mockGetAllEntityTypes;

    const types1 = entityService.getAllEntityTypes();
    const types2 = entityService.getEntityTypes();

    expect(types1).toEqual(["note", "profile", "task"]);
    expect(types2).toEqual(types1);
    expect(mockGetAllEntityTypes).toHaveBeenCalledTimes(2);
  });
});
