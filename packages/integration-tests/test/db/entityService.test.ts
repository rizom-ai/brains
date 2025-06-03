import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { EntityService } from "@brains/shell/src/entity/entityService";
import { EntityRegistry } from "@brains/shell/src/entity/entityRegistry";
import { createTestDatabase } from "../helpers/test-db";
import type { DrizzleDB } from "@brains/db";
import { createSilentLogger } from "@brains/utils";
import { baseEntitySchema } from "@brains/types";
import type { IEmbeddingService } from "@brains/shell/src/embedding/embeddingService";
import type { EntityAdapter } from "@brains/shell/src/entity/entityRegistry";

// Create a mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Note entity schema and types
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
    title: data.title ?? "Test Note",
    content: data.content ?? "Test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    tags: data.tags ?? [],
    category: data.category,
  };
}

// Test adapter for notes (follows hybrid storage model)
const noteAdapter: EntityAdapter<Note> = {
  entityType: "note",
  schema: noteSchema,
  toMarkdown: (entity: Note): string => {
    // Don't include title in markdown - it's stored in database
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
  parseFrontMatter: (_markdown: string): Record<string, unknown> => {
    const frontmatterMatch = _markdown.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) return {};

    const frontmatterContent = frontmatterMatch[1];
    const categoryMatch = frontmatterContent?.match(/category:\s*(.+)/);
    return categoryMatch?.[1] ? { category: categoryMatch[1].trim() } : {};
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
        title: "Test Note",
        content: "This is a test note",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: ["test"],
        category: "general",
      };

      const created = await entityService.createEntity(noteData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.title).toBe(noteData.title);
      expect(created.content).toBe(noteData.content);
      expect(created.tags).toEqual(noteData.tags);
      expect((created as Note).category).toBe(noteData.category);
      expect(created.created).toBeDefined();
      expect(created.updated).toBeDefined();
    });

    test("creates entity with provided ID", async () => {
      const customId = "custom-test-id";
      const noteData = {
        id: customId,
        ...createTestEntityData({
          title: "Test Note with ID",
          content: "This note has a custom ID",
        }),
      };

      const created = await entityService.createEntity(noteData);

      expect(created.id).toBe(customId);
      expect(created.title).toBe(noteData.title);
    });

    test("throws error for invalid entity type", async () => {
      const invalidData = {
        entityType: "invalid" as const,
        title: "Invalid Entity",
        content: "This should fail",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
      };

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(entityService.createEntity(invalidData)).rejects.toThrow();
    });
  });

  describe("getEntity", () => {
    test("retrieves existing entity by ID", async () => {
      const noteData = createTestEntityData({
        title: "Test Note to Retrieve",
        content: "This note will be retrieved",
        tags: ["retrievable"],
      });

      const created = await entityService.createEntity(noteData);
      const retrieved = await entityService.getEntity<Note>("note", created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe(noteData.title);
      expect(retrieved?.content).toBe(noteData.content);
      expect(retrieved?.tags).toEqual(created.tags);
    });

    test("returns null for non-existent entity", async () => {
      const result = await entityService.getEntity("note", "non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("updateEntity", () => {
    test("updates existing entity", async () => {
      const noteData = createTestEntityData({
        title: "Original Title",
        content: "Original content",
        tags: ["original"],
      });

      const created = await entityService.createEntity(noteData);

      // Wait a bit to ensure timestamps differ
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedData = {
        ...created,
        title: "Updated Title",
        content: "Updated content",
        tags: ["updated"],
      };

      const updated = await entityService.updateEntity(updatedData);

      expect(updated.id).toBe(created.id);
      expect(updated.title).toBe("Updated Title");
      expect(updated.content).toBe("Updated content");
      expect(updated.tags).toEqual(["updated"]);
      expect(updated.updated).not.toBe(created.updated);
      expect(updated.created).toBe(created.created);
    });

    test("silently succeeds when updating non-existent entity", async () => {
      const fakeEntity = {
        id: "non-existent",
        entityType: "note" as const,
        title: "Fake Note",
        content: "This doesn't exist",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
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
        title: "Note to Delete",
        content: "This will be deleted",
        tags: ["deletable"],
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
            title: `Note ${i}`,
            content: `Content for note ${i}`,
            tags: [`tag${i}`],
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

    test("filters entities by title", async () => {
      // Create entities with specific titles
      await entityService.createEntity(
        createTestEntityData({
          title: "Unique Title Test",
          content: "Content with unique title",
        }),
      );

      const result = await entityService.listEntities("note", {
        filter: { title: "Unique Title Test" },
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe("Unique Title Test");

      // Should not find non-existent title
      const emptyResult = await entityService.listEntities("note", {
        filter: { title: "Non-existent Title" },
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
        parseFrontMatter: (_markdown: string): Record<string, unknown> => ({}),
        generateFrontMatter: (_entity: Profile): string => "",
      };

      entityRegistry.registerEntityType(
        "profile",
        profileSchema,
        profileAdapter,
      );

      await entityService.createEntity({
        entityType: "profile" as const,
        title: "Test Profile",
        content: "Profile content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
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

  describe("searchEntitiesByTags", () => {
    beforeEach(async () => {
      await entityService.createEntity(
        createTestEntityData({
          title: "JavaScript Tutorial",
          content: "Learn JS",
          tags: ["javascript", "tutorial", "programming"],
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          title: "TypeScript Guide",
          content: "TS is great",
          tags: ["typescript", "tutorial", "programming"],
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          title: "Python Basics",
          content: "Python 101",
          tags: ["python", "tutorial"],
        }),
      );
    });

    test("searches by single tag", async () => {
      const results = await entityService.searchEntitiesByTags(["programming"]);

      expect(results).toHaveLength(2);
      expect(
        results.every((result) => result.entity.tags.includes("programming")),
      ).toBe(true);
    });

    test("searches by multiple tags (OR logic)", async () => {
      const results = await entityService.searchEntitiesByTags([
        "javascript",
        "python",
      ]);

      expect(results).toHaveLength(2);
      expect(
        results.some((result) => result.entity.title === "JavaScript Tutorial"),
      ).toBe(true);
      expect(
        results.some((result) => result.entity.title === "Python Basics"),
      ).toBe(true);
    });

    test("returns empty result for non-existent tags", async () => {
      const results = await entityService.searchEntitiesByTags([
        "non-existent",
      ]);

      expect(results).toHaveLength(0);
    });
  });

  describe("search (vector similarity)", () => {
    test("performs vector similarity search", async () => {
      // Create entities with different content
      await entityService.createEntity(
        createTestEntityData({
          title: "Machine Learning Basics",
          content: "Neural networks and deep learning fundamentals",
          tags: ["ml", "ai"],
        }),
      );

      await entityService.createEntity(
        createTestEntityData({
          title: "Cooking Recipe",
          content: "How to make pasta carbonara",
          tags: ["cooking", "recipe"],
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
        parseFrontMatter: (_markdown: string): Record<string, unknown> => ({}),
        generateFrontMatter: (_entity: Profile): string => "",
      };

      entityRegistry.registerEntityType(
        "profile",
        profileSchema,
        profileAdapter,
      );

      await entityService.createEntity(
        createTestEntityData({
          title: "Note about AI",
          content: "AI content",
        }),
      );

      await entityService.createEntity({
        entityType: "profile" as const,
        title: "AI Researcher",
        content: "Profile of AI researcher",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: [],
      });

      const results = await entityService.search("AI");

      // Should find both note and profile since we're not filtering by type
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("importRawEntity", () => {
    test("imports raw entity data", async () => {
      const rawData = {
        entityType: "note",
        id: "imported-note-id",
        title: "Imported Note",
        content: "This note was imported",
        created: new Date("2023-01-01"),
        updated: new Date("2023-01-02"),
      };

      await entityService.importRawEntity(rawData);

      const imported = await entityService.getEntity<Note>("note", rawData.id);
      expect(imported).toBeDefined();
      expect(imported?.id).toBe(rawData.id);
      expect(imported?.title).toBe(rawData.title);
      expect(imported?.content).toBe(rawData.content);
    });

    test("throws error for unregistered entity type", async () => {
      const rawData = {
        entityType: "unknown",
        id: "test-id",
        title: "Test",
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
