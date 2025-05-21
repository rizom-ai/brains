import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import type { EntityAdapter } from "../../src/entity/entityRegistry";
import { EntityRegistry } from "../../src/entity/entityRegistry";
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
function createTestNote(options: Partial<Note> = {}): Note {
  return {
    id: options.id ?? "123e4567-e89b-12d3-a456-426614174000",
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
      id: (parsedData.id as string) ?? crypto.randomUUID(),
      entityType: "note",
      title: title ?? "Untitled Note",
      content: noteContent,
      created: created,
      updated: updated,
      tags: (parsedData.tags as string[]) ?? [],

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

describe("EntityRegistry", (): void => {
  let registry: EntityRegistry;
  let logger: Logger;
  let adapter: NoteAdapter;

  beforeEach((): void => {
    // Reset singletons and create fresh instances
    EntityRegistry.resetInstance();
    Logger.resetInstance();

    logger = Logger.createFresh({ level: LogLevel.ERROR });
    registry = EntityRegistry.createFresh(logger);
    adapter = new NoteAdapter();

    // Register the test entity type
    registry.registerEntityType("note", noteSchema, adapter);
  });

  test("entity lifecycle - register, validate, and retrieve entities", (): void => {
    // Verify registration works
    expect(registry.hasEntityType("note")).toBe(true);
    expect(registry.getAllEntityTypes()).toContain("note");

    // Create and validate an entity
    const testNote = createTestNote();
    const validatedNote = registry.validateEntity("note", testNote);
    expect(validatedNote.id).toBe(testNote.id);

    // Verify error handling for invalid entities
    const invalidNote = {
      id: "test-id",
      entityType: "note",
      // Missing required fields
    };
    expect(() => registry.validateEntity("note", invalidNote)).toThrow();

    // Verify error handling for unregistered types
    expect(() => registry.getAdapter("nonexistent")).toThrow();
    expect(() => registry.validateEntity("nonexistent", {})).toThrow();
  });

  test("markdown serialization - round-trip conversion", (): void => {
    // Create a test entity with distinctive values
    const originalNote = createTestNote({
      title: "Markdown Test",
      content: "Testing markdown round-trip conversion",
      tags: ["markdown", "test"],
    });

    // Convert to markdown
    const markdown = registry.entityToMarkdown(originalNote);

    // Verify markdown format (contains both frontmatter and content)
    expect(markdown).toContain("---"); // Has frontmatter
    expect(markdown).toContain("id: " + originalNote.id);
    expect(markdown).toContain("# Markdown Test"); // Has content

    // Convert back to entity
    const restoredNote = registry.markdownToEntity<Note>("note", markdown);

    // Verify core properties survived the round trip
    expect(restoredNote.id).toBe(originalNote.id);
    expect(restoredNote.title).toBe(originalNote.title);
    expect(restoredNote.content).toContain(originalNote.content);
    expect(restoredNote.tags).toEqual(originalNote.tags);
  });
});
