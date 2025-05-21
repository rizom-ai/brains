import { describe, expect, test, beforeEach, mock } from "bun:test";
import { z } from "zod";
import type { createDatabase } from "../../src/db";
import {
  EntityRegistry,
  type EntityAdapter,
} from "../../src/entity/entityRegistry";
import { EntityService } from "../../src/entity/entityService";
import { Logger, LogLevel } from "../../src/utils/logger";
import { baseEntitySchema } from "../../src/types";
import type { BaseEntity, IContentModel } from "../../src/types";
import matter from "gray-matter";

// Test entity schema
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  content: z.string(),
});

// Test entity type
interface Note extends BaseEntity, IContentModel {
  title: string;
  content: string;
}

// Factory function to create a test note
function createTestNote(
  options: Partial<Note> = {},
): Omit<Note, "id"> & { id?: string } {
  return {
    id: options.id,
    entityType: "note",
    title: options.title ?? "Test Note",
    content: options.content ?? "This is a test note content.",
    created: options.created ?? new Date().toISOString(),
    updated: options.updated ?? new Date().toISOString(),
    tags: options.tags ?? ["test", "note"],

    toMarkdown(): string {
      return `# ${this.title}\n\n${this.content}`;
    },
  };
}

// Test adapter implementation
class NoteAdapter implements EntityAdapter<Note> {
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): Note {
    const { data, content } = matter(markdown);
    const parsedData = metadata ?? data;

    let title = parsedData.title as string;
    let noteContent = content.trim();

    if (!title && content.startsWith("# ")) {
      const lines = content.split("\n");
      title = lines[0].substring(2).trim();
      noteContent = lines.slice(1).join("\n").trim();
    }

    let created = parsedData.created as string;
    if (typeof created !== "string") {
      created = new Date().toISOString();
    }

    let updated = parsedData.updated as string;
    if (typeof updated !== "string") {
      updated = new Date().toISOString();
    }

    return {
      id: (parsedData.id as string) || crypto.randomUUID(),
      entityType: "note",
      title: title || "Untitled Note",
      content: noteContent,
      created: created,
      updated: updated,
      tags: (parsedData.tags as string[]) || [],

      toMarkdown(): string {
        return `# ${this.title}\n\n${this.content}`;
      },
    };
  }

  parseFrontMatter(markdown: string): Record<string, unknown> {
    const { data } = matter(markdown);
    return data;
  }

  generateFrontMatter(entity: Note): string {
    const frontmatterData = {
      id: entity.id,
      entityType: entity.entityType,
      title: entity.title,
      created: entity.created,
      updated: entity.updated,
      tags: entity.tags,
    };

    const yamlLines = ["---"];

    Object.entries(frontmatterData).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        yamlLines.push(`${key}:`);
        value.forEach((item) => yamlLines.push(`  - ${item}`));
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    });

    yamlLines.push("---");
    return yamlLines.join("\n");
  }

  extractMetadata(entity: Note): Record<string, unknown> {
    return {
      title: entity.title,
      tags: entity.tags,
      created: entity.created,
      updated: entity.updated,
    };
  }
}

describe("EntityService", (): void => {
  let entityRegistry: EntityRegistry;
  let logger: Logger;
  let db: ReturnType<typeof createDatabase>;

  beforeEach((): void => {
    // Reset singletons
    EntityRegistry.resetInstance();
    Logger.resetInstance();
    EntityService.resetInstance();

    // Create fresh instances
    logger = Logger.createFresh({ level: LogLevel.ERROR });
    entityRegistry = EntityRegistry.createFresh(logger);

    // Create mock database instead of using real one
    // This avoids conflicts with Drizzle ORM in tests
    db = {
      insert: mock(() => ({ values: mock(() => Promise.resolve()) })),
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => ({
              offset: mock(() => ({
                orderBy: mock(() => Promise.resolve([])),
              })),
            })),
            limit: mock(() => Promise.resolve([])),
          })),
          limit: mock(() => ({
            offset: mock(() => ({
              orderBy: mock(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve({ count: 1 })),
        })),
      })),
      delete: mock(() => ({
        where: mock(() => Promise.resolve({ count: 1 })),
      })),
    } as unknown as ReturnType<typeof createDatabase>;

    // Register note entity type
    const adapter = new NoteAdapter();
    entityRegistry.registerEntityType("note", noteSchema, adapter);

    // No need to create an instance here as each test creates its own
  });

  test("entity service interactions", async (): Promise<void> => {
    const validateEntityMock = mock(() => true);
    const entityToMarkdownMock = mock(() => "mocked-markdown");
    const getAllEntityTypesMock = mock(() => ["note"]);

    // Create test entity
    const noteData = createTestNote({
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Test Note",
      content: "This is a test",
    }) as Note;

    // Setup mocked entity registry
    const mockedRegistry = {
      validateEntity: validateEntityMock,
      entityToMarkdown: entityToMarkdownMock,
      markdownToEntity: mock(() => noteData),
      getAllEntityTypes: getAllEntityTypesMock,
    } as unknown as EntityRegistry;

    // Create service with mocked dependencies
    const service = EntityService.createFresh(db, mockedRegistry, logger);

    // Test creating entity
    await service.createEntity(noteData);
    expect(validateEntityMock).toHaveBeenCalled();
    expect(entityToMarkdownMock).toHaveBeenCalled();

    // Test getting supported entity types
    service.getSupportedEntityTypes();
    expect(getAllEntityTypesMock).toHaveBeenCalled();
  });

  test("CRUD operations use correct database methods", async (): Promise<void> => {
    // Override entityRegistry to avoid toMarkdown errors
    const mockRegistry = {
      validateEntity: mock(() => ({
        id: "123e4567-e89b-12d3-a456-426614174000",
        entityType: "note",
        title: "Test Note",
        content: "Test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: ["test"],
        toMarkdown: () => "# Test Note\n\nTest content",
      })),
      entityToMarkdown: mock(() => "mocked-markdown"),
      markdownToEntity: mock(() => ({
        id: "123e4567-e89b-12d3-a456-426614174000",
        entityType: "note",
        title: "Test Note",
        content: "Test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: ["test"],
        toMarkdown: () => "# Test Note\n\nTest content",
      })),
      getAllEntityTypes: mock(() => ["note"]),
    } as unknown as EntityRegistry;

    // Create service with mocked dependencies
    const service = EntityService.createFresh(db, mockRegistry, logger);

    // Test insert is called for createEntity
    const insertMock = db.insert as unknown as Mock;
    await service.createEntity({
      entityType: "note",
      title: "Test",
      content: "Test",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
      toMarkdown: () => "Test",
    });
    expect(insertMock).toHaveBeenCalled();

    // Test select is called for getEntity
    const selectMock = db.select as unknown as Mock;
    await service.getEntity("note", "123");
    expect(selectMock).toHaveBeenCalled();

    // Test update is called for updateEntity
    const updateMock = db.update as unknown as Mock;
    await service.updateEntity({
      id: "123e4567-e89b-12d3-a456-426614174000",
      entityType: "note",
      title: "Test",
      content: "Test",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
      toMarkdown: () => "Test",
    });
    expect(updateMock).toHaveBeenCalled();

    // Test delete is called for deleteEntity
    const deleteMock = db.delete as unknown as Mock;
    const result = await service.deleteEntity("123");
    expect(deleteMock).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
