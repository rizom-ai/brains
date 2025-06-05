import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import { EntityRegistry } from "@/entity/entityRegistry";
import type { EntityAdapter } from "@brains/base-entity";

import { createSilentLogger, type Logger } from "@brains/utils";
import { baseEntitySchema } from "@brains/types";
import { createId } from "@brains/db/schema";
import matter from "gray-matter";

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
  category: z.string(),
});

/**
 * Note entity type
 */
type Note = z.infer<typeof noteSchema>;

/**
 * Input type for creating notes (id, created, updated are optional/generated)
 */
type CreateNoteInput = Omit<
  z.input<typeof noteSchema>,
  "id" | "created" | "updated" | "entityType"
> & {
  id?: string;
  created?: string;
  updated?: string;
};

/**
 * Factory function to create a Note entity (for testing)
 */
function createNote(input: CreateNoteInput): Note {
  const validated = noteSchema.parse({
    id: input.id ?? createId(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    entityType: "note",
    ...input,
  });

  return validated;
}

/**
 * Schema for registry registration
 * For testing purposes, we use a schema that validates the data structure
 * The actual entity methods are added by the adapter during fromMarkdown
 */
const registryNoteSchema = noteSchema;

// ============================================================================
// TEST ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * Schema for parsing markdown frontmatter and content
 */
const markdownParseSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    category: z.string().default("general"),
    tags: z.array(z.string()).default([]),
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    entityType: z.literal("note").optional(),
  })
  .default({});

/**
 * Test adapter implementation for Note entities
 */
class NoteAdapter implements EntityAdapter<Note> {
  entityType = "note";
  schema = noteSchema;
  fromMarkdown(markdown: string): Partial<Note> {
    const { data, content } = matter(markdown);
    const parsedData = data;

    // Parse frontmatter with Zod for type safety
    const frontmatter = markdownParseSchema.parse(parsedData);

    let title = frontmatter.title;
    let noteContent = content.trim();

    // Extract title and content from markdown if not in frontmatter
    if (!title && content.trim().startsWith("# ")) {
      const lines = content.trim().split("\n");
      const titleLine = lines[0];
      // Handle category tags like "# Test Note [testing]"
      if (titleLine) {
        const titleMatch = titleLine.match(/^#\s+(.+?)(?:\s+\[.*\])?\s*$/);
        title = titleMatch?.[1] ?? titleLine.substring(2).trim();
      }

      // Get content after title
      const contentStartIndex = lines.findIndex(
        (line, i) => i > 0 && line.trim() !== "",
      );
      noteContent =
        contentStartIndex > 0
          ? lines.slice(contentStartIndex).join("\n").trim()
          : "";
    }

    // If frontmatter has title, extract just body content (skip markdown title)
    if (frontmatter.title && content.trim().startsWith("# ")) {
      const lines = content.trim().split("\n");
      const contentStartIndex = lines.findIndex(
        (line, i) => i > 0 && line.trim() !== "",
      );
      noteContent =
        contentStartIndex > 0
          ? lines.slice(contentStartIndex).join("\n").trim()
          : "";
    }

    // Extract category from title if present (like "# Test Note [testing]")
    let category: string = frontmatter.category;
    if (category === "general" && title) {
      const categoryMatch = title.match(/\[([^\]]+)\]$/);
      if (categoryMatch) {
        category = categoryMatch[1] ?? "general";
        title = title.replace(/\s*\[([^\]]+)\]$/, "").trim();
      }
    }

    // Return only entity-specific fields
    const result: Partial<Note> = {
      content: noteContent,
    };

    if (category && category !== "general") {
      result.category = category;
    }

    return result;
  }

  extractMetadata(entity: Note): Record<string, unknown> {
    return {
      id: entity.id,
      title: entity.title,
      tags: entity.tags,
      category: entity.category,
      created: entity.created,
      updated: entity.updated,
      entityType: entity.entityType,
    };
  }

  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>
  ): TFrontmatter {
    const { data } = matter(markdown);
    return schema.parse(data);
  }

  generateFrontMatter(entity: Note): string {
    const metadata = this.extractMetadata(entity);
    // Generate proper YAML frontmatter with delimiters
    const yamlOutput = matter.stringify("", metadata);
    return yamlOutput.split("\n\n")[0] ?? "---\n---";
  }

  toMarkdown(entity: Note): string {
    // Include frontmatter for note-specific fields
    const frontmatter = {
      title: entity.title,
      tags: entity.tags,
      category: entity.category,
    };
    return matter.stringify(entity.content, frontmatter);
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe("EntityRegistry", (): void => {
  let logger: Logger;
  let registry: EntityRegistry;
  let adapter: EntityAdapter<Note>;

  beforeEach((): void => {
    // Reset singletons
    EntityRegistry.resetInstance();

    // Create fresh instances with mock logger
    logger = createSilentLogger();
    registry = EntityRegistry.createFresh(logger);
    adapter = new NoteAdapter();

    // Register the test entity type
    registry.registerEntityType("note", registryNoteSchema, adapter);
  });

  test("entity lifecycle - register, validate, and retrieve entities", (): void => {
    // Verify registration works
    expect(registry.hasEntityType("note")).toBe(true);
    expect(registry.getAllEntityTypes()).toContain("note");

    // Test data validation (without methods)
    const entityData = {
      id: createId(),
      entityType: "note" as const,
      title: "Test Note",
      content: "This is a test note content.",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: ["test", "registry"],
      category: "testing",
    };

    // Test validation - registry validates data structure
    const validatedEntity = registry.validateEntity<Note>("note", entityData);
    expect(validatedEntity.id).toBe(entityData.id);
    expect(validatedEntity.title).toBe("Test Note");
    expect(validatedEntity.entityType).toBe("note");
    expect(validatedEntity.category).toBe("testing");

    // Test complete entity with adapter - this creates the full entity with methods
    const completeNote = createNote({
      id: entityData.id,
      title: entityData.title,
      content: entityData.content,
      created: entityData.created,
      updated: entityData.updated,
      tags: entityData.tags,
      category: entityData.category,
    });

    // Test markdown conversion with adapter directly
    const adapter = registry.getAdapter<Note>("note");
    const markdown = adapter.toMarkdown(completeNote);
    expect(markdown).toContain("title: Test Note");
    expect(markdown).toContain("category: testing");
    expect(markdown).toContain("This is a test note content.");

    // Test adapter's fromMarkdown (returns partial data)
    // Note: Since fromMarkdown returns partial data and doesn't parse title,
    // it won't extract category from the title tag
    const parsedContent = adapter.fromMarkdown(markdown);
    expect(parsedContent.content).toBe("This is a test note content.");
  });

  test("validation with missing required fields should throw", (): void => {
    const invalidEntity = {
      id: createId(),
      entityType: "note",
      // missing required fields: title, content, etc.
    };

    expect(() => {
      registry.validateEntity<Note>("note", invalidEntity);
    }).toThrow();
  });

  test("unregistered entity type should throw", (): void => {
    expect(() => {
      registry.validateEntity("unknown", {});
    }).toThrow();
  });

  test("duplicate entity type registration should throw", (): void => {
    expect(() => {
      registry.registerEntityType("note", registryNoteSchema, adapter);
    }).toThrow();
  });

  test("get schema and adapter for registered type", (): void => {
    const schema = registry.getSchema("note");
    expect(schema).toBeDefined();

    const retrievedAdapter = registry.getAdapter("note");
    expect(retrievedAdapter).toBe(adapter);
  });

  test("adapter fromMarkdown should parse frontmatter correctly", (): void => {
    const markdownWithFrontmatter = `---
category: "testing"
---

This note has frontmatter metadata.`;

    const adapter = registry.getAdapter<Note>("note");
    const parsedContent = adapter.fromMarkdown(markdownWithFrontmatter);

    expect(parsedContent.content).toBe("This note has frontmatter metadata.");
    expect(parsedContent.category).toBe("testing");
  });
});
