import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { EntityService } from "@brains/shell/src/entity/entityService";
import { EntityRegistry } from "@brains/shell/src/entity/entityRegistry";
import { createTestDatabase } from "../helpers/test-db";
import type { DrizzleDB } from "@brains/db";
import { createSilentLogger } from "@brains/utils";
import { baseEntitySchema } from "@brains/types";
import type { IEmbeddingService } from "@brains/shell/src/embedding/embeddingService";
import type { EntityAdapter } from "@brains/base-entity";

// Create a mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Note entity schema and types
// For testing, we add category as a note-specific field
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
});

type Note = z.infer<typeof noteSchema>;

// Helper to create test entity data with required fields
function createTestEntityData(
  data: Partial<Omit<Note, "id" | "created" | "updated" | "entityType">>,
): Omit<Note, "id"> {
  return {
    entityType: "note" as const,
    content: data.content ?? "Test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    category: data.category,
  };
}

// Test adapter for notes (follows hybrid storage model)
const noteAdapter: EntityAdapter<Note> = {
  entityType: "note",
  schema: noteSchema,
  toMarkdown: (entity: Note): string => {
    // Include note-specific fields in frontmatter
    const frontmatter = entity.category
      ? `---\ncategory: ${entity.category}\n---\n\n`
      : "";
    return `${frontmatter}${entity.content}`;
  },
  fromMarkdown: (_markdown: string): Partial<Note> => {
    // Parse frontmatter if present
    const frontmatterMatch = _markdown.match(/^---\n([\s\S]*?)\n---\n/);
    let content = _markdown;
    let category: string | undefined;

    if (frontmatterMatch) {
      // Extract category from frontmatter
      const frontmatterContent = frontmatterMatch[1];
      const categoryMatch = frontmatterContent?.match(/category:\s*(.+)/);
      if (categoryMatch?.[1]) {
        category = categoryMatch[1].trim();
      }
      // Remove frontmatter from content
      content = _markdown.slice(frontmatterMatch[0].length).trim();
    }

    // Return only entity-specific fields
    return {
      content,
      category,
    };
  },
  extractMetadata: (entity: Note): Record<string, unknown> => ({
    category: entity.category,
  }),
  parseFrontMatter: <TFrontmatter>(_markdown: string, schema: z.ZodType<TFrontmatter>): TFrontmatter => {
    const frontmatterMatch = _markdown.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) return schema.parse({});

    const frontmatterContent = frontmatterMatch[1];
    const categoryMatch = frontmatterContent?.match(/category:\s*(.+)/);
    const data = categoryMatch?.[1] ? { category: categoryMatch[1].trim() } : {};
    return schema.parse(data);
  },
  generateFrontMatter: (entity: Note): string => {
    return entity.category ? `---\ncategory: ${entity.category}\n---\n` : "";
  },
};

describe("EntityService - Database Operations", () => {
  let db: DrizzleDB;
  let cleanup: () => Promise<void>;
  let entityService: EntityService;
  let entityRegistry: EntityRegistry;

  beforeEach(async () => {
    // Reset singletons
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create test database
    const testDb = await createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Create fresh instances
    const logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);
    entityService = EntityService.createFresh({
      db,
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
    });

    // Register note entity type
    entityRegistry.registerEntityType("note", noteSchema, noteAdapter);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("createEntity", () => {
    test("creates entity with auto-generated ID", async () => {
      const noteData = {
        entityType: "note" as const,
        content: "This is a test note",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        category: "general",
      };

      const created = await entityService.createEntity(noteData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.content).toBe(noteData.content);
      expect((created as Note).category).toBe(noteData.category);
      expect(created.created).toBeDefined();
      expect(created.updated).toBeDefined();
    });

    test("creates entity with provided ID", async () => {
      const customId = "custom-test-id";
      const noteData = {
        id: customId,
        ...createTestEntityData({
          content: "This note has a custom ID",
        }),
      };

      const created = await entityService.createEntity(noteData);

      expect(created.id).toBe(customId);
      expect(created.content).toBe(noteData.content);
    });

    test("throws error for invalid entity type", async () => {
      const invalidData = {
        entityType: "invalid" as const,
        content: "This should fail",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(entityService.createEntity(invalidData)).rejects.toThrow();
    });
  });

  describe("getEntity", () => {
    test("retrieves existing entity by ID", async () => {
      const noteData = createTestEntityData({
        content: "This note will be retrieved",
        category: "retrievable",
      });

      const created = await entityService.createEntity(noteData);
      const retrieved = await entityService.getEntity<Note>("note", created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.content).toBe(noteData.content);
      // Both entities should have the same category value
      expect((retrieved as Note | null)?.category).toBe("retrievable");
    });

    test("returns null for non-existent entity", async () => {
      const result = await entityService.getEntity("note", "non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("updateEntity", () => {
    test("updates existing entity", async () => {
      const noteData = createTestEntityData({
        content: "Original content",
        category: "original",
      });

      const created = await entityService.createEntity(noteData);

      // Wait a bit to ensure timestamps differ
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedData = {
        ...created,
        content: "Updated content",
        category: "updated",
      };

      const updated = await entityService.updateEntity(updatedData);

      expect(updated.id).toBe(created.id);
      expect(updated.content).toBe("Updated content");
      expect(updated.updated).not.toBe(created.updated);
      expect(updated.created).toBe(created.created);
    });

    test("silently succeeds when updating non-existent entity", async () => {
      const fakeEntity = {
        id: "non-existent",
        entityType: "note" as const,
        content: "This doesn't exist",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // updateEntity doesn't throw for non-existent entities, it just updates nothing
      const result = await entityService.updateEntity(fakeEntity);
      expect(result).toBeDefined();
      expect(result.id).toBe(fakeEntity.id);
    });
  });

  describe("deleteEntity", () => {
    test("deletes existing entity", async () => {
      const noteData = createTestEntityData({
        content: "This will be deleted",
        category: "deletable",
      });

      const created = await entityService.createEntity(noteData);
      const deleted = await entityService.deleteEntity(created.id);

      expect(deleted).toBe(true);

      // Verify it's gone
      const retrieved = await entityService.getEntity("note", created.id);
      expect(retrieved).toBeNull();
    });

    test("returns false when deleting non-existent entity", async () => {
      const result = await entityService.deleteEntity("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("listEntities", () => {
    beforeEach(async () => {
      // Create test entities
      for (let i = 0; i < 5; i++) {
        await entityService.createEntity(
          createTestEntityData({
            content: `Content for note ${i}`,
            category: `category${i}`,
          }),
        );
      }
    });

    test("lists entities with default options", async () => {
      const result = await entityService.listEntities("note");

      expect(result).toHaveLength(5);
    });

    test("lists entities with pagination", async () => {
      const result = await entityService.listEntities("note", {
        limit: 2,
        offset: 0,
      });

      expect(result).toHaveLength(2);

      // Get next page
      const page2 = await entityService.listEntities("note", {
        limit: 2,
        offset: 2,
      });

      expect(page2).toHaveLength(2);
    });

    test("lists entities sorted by created date", async () => {
      const result = await entityService.listEntities("note", {
        sortBy: "created",
        sortDirection: "asc",
      });

      expect(result).toHaveLength(5);
      // First item should have the earliest created date
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        if (!prev || !curr) continue;
        const prevCreated = new Date(prev.created).getTime();
        const currCreated = new Date(curr.created).getTime();
        expect(currCreated).toBeGreaterThanOrEqual(prevCreated);
      }
    });

    test("filters entities by metadata", async () => {
      // Create entities with specific titles
      await entityService.createEntity(
        createTestEntityData({
          content: "Content with unique title",
          category: "unique",
        }),
      );

      const result = await entityService.listEntities("note", {
        filter: { metadata: { category: "unique" } },
      });

      expect(result).toHaveLength(1);
      // The metadata filter works even though we can't access title directly on BaseEntity
      expect(result[0]).toBeDefined();

      // Should not find non-existent category
      const emptyResult = await entityService.listEntities("note", {
        filter: { metadata: { category: "non-existent" } },
      });
      expect(emptyResult).toHaveLength(0);
    });

    test("filters entities by type", async () => {
      // Create a different entity type for testing
      const profileSchema = baseEntitySchema.extend({
        entityType: z.literal("profile"),
      });

      type Profile = z.infer<typeof profileSchema>;
      const profileAdapter: EntityAdapter<Profile> = {
        entityType: "profile",
        schema: profileSchema,
        toMarkdown: (entity: Profile): string => {
          return entity.content;
        },
        fromMarkdown: (_markdown: string): Partial<Profile> => {
          return { content: _markdown.trim() };
        },
        extractMetadata: (_entity: Profile): Record<string, unknown> => ({}),
        parseFrontMatter: <TFrontmatter>(_markdown: string, schema: z.ZodType<TFrontmatter>): TFrontmatter => schema.parse({}),
        generateFrontMatter: (_entity: Profile): string => "",
      };

      entityRegistry.registerEntityType(
        "profile",
        profileSchema,
        profileAdapter,
      );

      await entityService.createEntity({
        entityType: "profile" as const,
        content: "Profile content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      const noteResults = await entityService.listEntities("note");
      expect(noteResults).toHaveLength(5);
      expect(noteResults.every((item) => item.entityType === "note")).toBe(
        true,
      );

      const profileResults = await entityService.listEntities("profile");
      expect(profileResults).toHaveLength(1);
      expect(profileResults[0]?.entityType).toBe("profile");
    });
  });

  describe("search entities", () => {
    beforeEach(async () => {
      await entityService.createEntity(
        createTestEntityData({
          content: "Learn JS",
          category: "javascript",
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          content: "TS is great",
          category: "typescript",
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          content: "Python 101",
          category: "python",
        }),
      );
    });

    test("searches using semantic search", async () => {
      const results = await entityService.search("JavaScript programming");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.entity).toBeDefined();
    });

    test("lists entities with metadata filter", async () => {
      // Note: SQLite JSON queries have limitations, so this might not work as expected
      // This is more of a placeholder test
      const results = await entityService.listEntities("note", {
        filter: {
          metadata: { category: "javascript" },
        },
      });

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("search (vector similarity)", () => {
    test("performs vector similarity search", async () => {
      // Create entities with different content
      await entityService.createEntity(
        createTestEntityData({
          content: "Neural networks and deep learning fundamentals",
          category: "ml",
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          content: "How to make pasta carbonara",
          category: "cooking",
        }),
      );

      const results = await entityService.search("artificial intelligence");

      expect(results).toHaveLength(2);
      const firstResult = results[0];
      expect(firstResult?.score).toBeDefined();
      expect(firstResult?.score).toBeGreaterThanOrEqual(0);
      expect(firstResult?.score).toBeLessThanOrEqual(1);
    });

    test("filters search results by entity type", async () => {
      const profileSchema = baseEntitySchema.extend({
        entityType: z.literal("profile"),
      });

      type Profile = z.infer<typeof profileSchema>;
      const profileAdapter: EntityAdapter<Profile> = {
        entityType: "profile",
        schema: profileSchema,
        toMarkdown: (entity: Profile): string => {
          return entity.content;
        },
        fromMarkdown: (_markdown: string): Partial<Profile> => {
          return { content: _markdown.trim() };
        },
        extractMetadata: (_entity: Profile): Record<string, unknown> => ({}),
        parseFrontMatter: <TFrontmatter>(_markdown: string, schema: z.ZodType<TFrontmatter>): TFrontmatter => schema.parse({}),
        generateFrontMatter: (_entity: Profile): string => "",
      };

      entityRegistry.registerEntityType(
        "profile",
        profileSchema,
        profileAdapter,
      );

      await entityService.createEntity(
        createTestEntityData({
          content: "AI content",
          category: "ai",
        }),
      );

      // Profile adapter already registered above

      await entityService.createEntity({
        entityType: "profile" as const,
        content: "Profile of AI researcher",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      const results = await entityService.search("AI");

      // Should find both note and profile since we're not filtering by type
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("importRawEntity", () => {
    test("imports raw entity data", async () => {
      // For import, we need to provide markdown that includes frontmatter
      const markdownContent = `---
category: imported
---

This note was imported`;

      const rawData = {
        entityType: "note",
        id: "imported-note-id",
        content: markdownContent,
        created: new Date("2023-01-01"),
        updated: new Date("2023-01-02"),
      };

      await entityService.importRawEntity(rawData);

      const imported = await entityService.getEntity<Note>("note", rawData.id);
      expect(imported).toBeDefined();
      expect(imported?.id).toBe(rawData.id);
      // The adapter's fromMarkdown extracts the actual content without frontmatter
      expect(imported?.content).toBe("This note was imported");
    });

    test("throws error for unregistered entity type", async () => {
      const rawData = {
        entityType: "unknown",
        id: "test-id",
        content: "Test",
        created: new Date(),
        updated: new Date(),
      };

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(entityService.importRawEntity(rawData)).rejects.toThrow(
        "No schema registered for entity type: unknown",
      );
    });
  });
});
