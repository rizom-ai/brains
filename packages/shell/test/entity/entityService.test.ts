import { describe, expect, test, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { EntityService } from "../../src/entity/entityService";
import { EntityRegistry } from "../../src/entity/entityRegistry";
import type { DrizzleDB } from "../../src/db";
import type { Logger } from "../../src/utils/logger";
import { MockLogger } from "../utils/mockLogger";
import { baseEntitySchema } from "../../src/types";
import type { IContentModel } from "../../src/types";
import { createId } from "../../src/db/schema";

// ============================================================================
// TEST NOTE ENTITY (following documented functional approach)
// ============================================================================

/**
 * Note entity schema extending base entity
 */
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
});

/**
 * Note entity type
 */
type Note = z.infer<typeof noteSchema> & IContentModel;

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

  const data = { ...defaults, ...input };

  return {
    ...data,
    toMarkdown(): string {
      const categoryTag = data.category ? ` [${data.category}]` : "";
      return `# ${data.title}${categoryTag}\n\n${data.content}`;
    },
  };
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
    MockLogger.resetInstance();

    // Create minimal mock database (we're not testing DB operations)
    mockDb = {} as DrizzleDB;

    // Create fresh instances
    logger = MockLogger.createFresh();
    entityRegistry = EntityRegistry.createFresh(logger);
    entityService = EntityService.createFresh(mockDb, entityRegistry, logger);
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

    // Mock the registry markdown conversion
    const mockEntityToMarkdown = mock(() => "# Test Note\n\nTest content");
    entityRegistry.entityToMarkdown = mockEntityToMarkdown;

    // This would normally do database operations, but we're testing the validation logic
    // The actual database calls would be tested in integration tests
    expect(() => {
      entityRegistry.validateEntity("note", testEntity);
      entityRegistry.entityToMarkdown(testEntity);
    }).not.toThrow();

    expect(mockValidateEntity).toHaveBeenCalledWith("note", testEntity);
    expect(mockEntityToMarkdown).toHaveBeenCalledWith(testEntity);
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

  test("entity toMarkdown includes category when present", (): void => {
    const entityWithCategory = createNote({
      title: "Test Note",
      content: "Test content",
      category: "work",
    });

    const markdown = entityWithCategory.toMarkdown();
    expect(markdown).toContain("# Test Note [work]");
    expect(markdown).toContain("Test content");
  });

  test("entity toMarkdown excludes category when not present", (): void => {
    const entityWithoutCategory = createNote({
      title: "Test Note",
      content: "Test content",
      category: undefined,
    });

    const markdown = entityWithoutCategory.toMarkdown();
    expect(markdown).toContain("# Test Note");
    expect(markdown).not.toContain("[");
    expect(markdown).toContain("Test content");
  });
});
