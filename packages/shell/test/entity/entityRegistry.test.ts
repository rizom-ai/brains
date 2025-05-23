import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "zod";
import type { EntityAdapter } from "@/entity/entityRegistry";
import { EntityRegistry } from "@/entity/entityRegistry";

import { createSilentLogger, type Logger } from "@personal-brain/utils";
import { baseEntitySchema } from "@/types";
import type { IContentModel } from "@/types";
import { createId } from "@/db/schema";
import matter from "gray-matter";

// ============================================================================
// TEST NOTE ENTITY (following documented functional approach)
// ============================================================================

/**
 * Note entity schema extending base entity
 */
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string(),
});

/**
 * Note entity type
 */
type Note = z.infer<typeof noteSchema> & IContentModel;

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

  return {
    ...validated,
    toMarkdown(): string {
      const categoryTag = this.category ? ` [${this.category}]` : "";
      return `# ${this.title}${categoryTag}\n\n${this.content}`;
    },
  };
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
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): Note {
    const { data, content } = matter(markdown);
    const parsedData = metadata ?? data;

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

    return createNote({
      id: frontmatter.id ?? createId(),
      title: title ?? "Untitled Note",
      content: noteContent,
      tags: frontmatter.tags,
      category: category,
      created: frontmatter.created ?? new Date().toISOString(),
      updated: frontmatter.updated ?? new Date().toISOString(),
    });
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

  parseFrontMatter(markdown: string): Record<string, unknown> {
    const { data } = matter(markdown);
    return data;
  }

  generateFrontMatter(entity: Note): string {
    const metadata = this.extractMetadata(entity);
    // Generate proper YAML frontmatter with delimiters
    const yamlOutput = matter.stringify("", metadata);
    return yamlOutput.split("\n\n")[0] ?? "---\n---";
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

    // Test markdown conversion with complete entity
    const markdown = registry.entityToMarkdown(completeNote);
    expect(markdown).toContain("# Test Note [testing]");
    expect(markdown).toContain("This is a test note content.");

    // Test round-trip: entity -> markdown -> entity
    const reconstructedEntity = registry.markdownToEntity<Note>(
      "note",
      markdown,
    );
    expect(reconstructedEntity.title).toBe(completeNote.title);
    expect(reconstructedEntity.content).toBe(completeNote.content);
    expect(reconstructedEntity.category).toBe(completeNote.category);
    expect(reconstructedEntity.entityType).toBe("note");
    expect(typeof reconstructedEntity.toMarkdown).toBe("function");
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

    expect(() => {
      registry.markdownToEntity("unknown", "# Test");
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

  test("markdown with frontmatter should be parsed correctly", (): void => {
    const markdownWithFrontmatter = `---
id: test-123
title: "Frontmatter Note"
tags:
  - test
  - frontmatter
category: "testing"
created: "2023-01-01T00:00:00.000Z"
updated: "2023-01-01T00:00:00.000Z"
entityType: "note"
---

# Frontmatter Note [testing]

This note has frontmatter metadata.`;

    const entity = registry.markdownToEntity<Note>(
      "note",
      markdownWithFrontmatter,
    );
    expect(entity.title).toBe("Frontmatter Note");
    expect(entity.content).toBe("This note has frontmatter metadata.");
    expect(entity.category).toBe("testing");
    expect(entity.tags).toEqual(["test", "frontmatter"]);
  });
});
