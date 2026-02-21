import { describe, expect, test, beforeEach } from "bun:test";
import { z } from "@brains/utils";
import { EntityRegistry } from "../src/entityRegistry";
import type { EntityAdapter } from "../src/types";
import { baseEntitySchema } from "../src/types";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";
import { type Logger, createId } from "@brains/utils";
import matter from "gray-matter";

const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
});

type Note = z.infer<typeof noteSchema>;

type CreateNoteInput = Omit<
  z.input<typeof noteSchema>,
  "id" | "created" | "updated" | "entityType" | "metadata" | "contentHash"
> & {
  id?: string;
  created?: string;
  updated?: string;
  metadata?: Record<string, unknown>;
};

function createNote(input: CreateNoteInput): Note {
  return createTestEntity<Note>("note", {
    ...input,
    metadata: input.metadata ?? {},
  });
}

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
  .default({
    category: "",
    tags: [],
  });

class NoteAdapter implements EntityAdapter<Note> {
  entityType = "note";
  schema = noteSchema;

  fromMarkdown(markdown: string): Partial<Note> {
    const { data, content } = matter(markdown);
    const frontmatter = markdownParseSchema.parse(data);

    let title = frontmatter.title;
    let noteContent = content.trim();

    if (!title && content.trim().startsWith("# ")) {
      const lines = content.trim().split("\n");
      const titleLine = lines[0];
      if (titleLine) {
        const titleMatch = titleLine.match(/^#\s+(.+?)(?:\s+\[.*\])?\s*$/);
        title = titleMatch?.[1] ?? titleLine.substring(2).trim();
      }

      const contentStartIndex = lines.findIndex(
        (line, i) => i > 0 && line.trim() !== "",
      );
      noteContent =
        contentStartIndex > 0
          ? lines.slice(contentStartIndex).join("\n").trim()
          : "";
    }

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

    let category: string = frontmatter.category;
    if (category === "general" && title) {
      const categoryMatch = title.match(/\[([^\]]+)\]$/);
      if (categoryMatch) {
        category = categoryMatch[1] ?? "general";
        title = title.replace(/\s*\[([^\]]+)\]$/, "").trim();
      }
    }

    const result: Partial<Note> = { content: noteContent };

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
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { data } = matter(markdown);
    return schema.parse(data);
  }

  generateFrontMatter(entity: Note): string {
    const metadata = this.extractMetadata(entity);
    const yamlOutput = matter.stringify("", metadata);
    return yamlOutput.split("\n\n")[0] ?? "---\n---";
  }

  toMarkdown(entity: Note): string {
    const frontmatter = {
      title: entity.title,
      tags: entity.tags,
      category: entity.category,
    };
    return matter.stringify(entity.content, frontmatter);
  }
}

describe("EntityRegistry", (): void => {
  let logger: Logger;
  let registry: EntityRegistry;
  let adapter: EntityAdapter<Note>;

  beforeEach((): void => {
    EntityRegistry.resetInstance();

    logger = createSilentLogger();
    registry = EntityRegistry.createFresh(logger);
    adapter = new NoteAdapter();

    registry.registerEntityType("note", noteSchema, adapter);
  });

  test("entity lifecycle - register, validate, and retrieve entities", (): void => {
    expect(registry.hasEntityType("note")).toBe(true);
    expect(registry.getAllEntityTypes()).toContain("note");

    const entityData = createTestEntity<Note>("note", {
      title: "Test Note",
      content: "This is a test note content.",
      tags: ["test", "registry"],
      category: "testing",
    });

    const validatedEntity = registry.validateEntity<Note>("note", entityData);
    expect(validatedEntity.id).toBe(entityData.id);
    expect(validatedEntity.title).toBe("Test Note");
    expect(validatedEntity.entityType).toBe("note");
    expect(validatedEntity.category).toBe("testing");

    const completeNote = createNote({
      id: entityData.id,
      title: entityData.title,
      content: entityData.content,
      created: entityData.created,
      updated: entityData.updated,
      tags: entityData.tags,
      category: entityData.category,
    });

    const retrievedAdapter = registry.getAdapter<Note>("note");
    const markdown = retrievedAdapter.toMarkdown(completeNote);
    expect(markdown).toContain("title: Test Note");
    expect(markdown).toContain("category: testing");
    expect(markdown).toContain("This is a test note content.");

    const parsedContent = retrievedAdapter.fromMarkdown(markdown);
    expect(parsedContent.content).toBe("This is a test note content.");
  });

  test("validation with missing required fields should throw", (): void => {
    const invalidEntity = {
      id: createId(),
      entityType: "note",
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
      registry.registerEntityType("note", noteSchema, adapter);
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

    const retrievedAdapter = registry.getAdapter<Note>("note");
    const parsedContent = retrievedAdapter.fromMarkdown(
      markdownWithFrontmatter,
    );

    expect(parsedContent.content).toBe("This note has frontmatter metadata.");
    expect(parsedContent.category).toBe("testing");
  });

  describe("entity type config", () => {
    test("registerEntityType with config stores weight", (): void => {
      const freshRegistry = EntityRegistry.createFresh(logger);
      freshRegistry.registerEntityType("note", noteSchema, adapter, {
        weight: 2.0,
      });

      const config = freshRegistry.getEntityTypeConfig("note");
      expect(config.weight).toBe(2.0);
    });

    test("registerEntityType without config uses default", (): void => {
      const config = registry.getEntityTypeConfig("note");
      expect(config.weight).toBeUndefined();
    });

    test("getEntityTypeConfig for unregistered type returns empty config", (): void => {
      const config = registry.getEntityTypeConfig("unknown");
      expect(config).toEqual({});
    });

    test("getWeightMap returns weights for all types with non-default weights", (): void => {
      const freshRegistry = EntityRegistry.createFresh(logger);
      freshRegistry.registerEntityType("note", noteSchema, adapter, {
        weight: 2.0,
      });

      const anotherAdapter = new NoteAdapter();
      anotherAdapter.entityType = "post";
      const postSchema = noteSchema.extend({
        entityType: z.literal("post"),
      });

      freshRegistry.registerEntityType("post", postSchema, anotherAdapter, {
        weight: 1.5,
      });

      const weightMap = freshRegistry.getWeightMap();
      expect(weightMap).toEqual({ note: 2.0, post: 1.5 });
    });

    test("getWeightMap excludes types without weight config", (): void => {
      const freshRegistry = EntityRegistry.createFresh(logger);
      freshRegistry.registerEntityType("note", noteSchema, adapter);

      const anotherAdapter = new NoteAdapter();
      anotherAdapter.entityType = "post";
      const postSchema = noteSchema.extend({
        entityType: z.literal("post"),
      });

      freshRegistry.registerEntityType("post", postSchema, anotherAdapter, {
        weight: 1.5,
      });

      const weightMap = freshRegistry.getWeightMap();
      expect(weightMap).toEqual({ post: 1.5 });
      expect(weightMap["note"]).toBeUndefined();
    });

    test("getWeightMap returns empty object when no weights configured", (): void => {
      const weightMap = registry.getWeightMap();
      expect(weightMap).toEqual({});
    });
  });

  describe("extendFrontmatterSchema", () => {
    const baseFrontmatterSchema = z.object({
      name: z.string(),
      description: z.string().optional(),
    });

    class AdapterWithFrontmatter implements EntityAdapter<Note> {
      entityType = "profile";
      schema = noteSchema;
      frontmatterSchema = baseFrontmatterSchema;
      isSingleton = true;
      hasBody = false;

      fromMarkdown(markdown: string): Partial<Note> {
        return { content: markdown };
      }
      extractMetadata(_entity: Note): Record<string, unknown> {
        return {};
      }
      parseFrontMatter<TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter {
        return schema.parse({});
      }
      generateFrontMatter(_entity: Note): string {
        return "---\n---";
      }
      toMarkdown(entity: Note): string {
        return entity.content;
      }
    }

    function createProfileRegistry(): {
      registry: EntityRegistry;
      adapter: AdapterWithFrontmatter;
    } {
      const freshRegistry = EntityRegistry.createFresh(logger);
      const adapterWithSchema = new AdapterWithFrontmatter();
      freshRegistry.registerEntityType(
        "profile",
        noteSchema,
        adapterWithSchema,
      );
      return { registry: freshRegistry, adapter: adapterWithSchema };
    }

    test("should merge extension fields into effective schema", () => {
      const { registry: profileRegistry } = createProfileRegistry();

      profileRegistry.extendFrontmatterSchema(
        "profile",
        z.object({
          tagline: z.string().optional(),
          expertise: z.array(z.string()).optional(),
        }),
      );

      const effective =
        profileRegistry.getEffectiveFrontmatterSchema("profile");
      expect(effective).toBeDefined();
      if (!effective) return;

      const shape = effective.shape;
      expect(shape).toHaveProperty("name");
      expect(shape).toHaveProperty("description");
      expect(shape).toHaveProperty("tagline");
      expect(shape).toHaveProperty("expertise");
    });

    test("should handle multiple extensions", () => {
      const { registry: profileRegistry } = createProfileRegistry();

      profileRegistry.extendFrontmatterSchema(
        "profile",
        z.object({ tagline: z.string().optional() }),
      );
      profileRegistry.extendFrontmatterSchema(
        "profile",
        z.object({ expertise: z.array(z.string()).optional() }),
      );

      const effective =
        profileRegistry.getEffectiveFrontmatterSchema("profile");
      expect(effective).toBeDefined();
      if (!effective) return;
      const shape = effective.shape;
      expect(shape).toHaveProperty("name");
      expect(shape).toHaveProperty("tagline");
      expect(shape).toHaveProperty("expertise");
    });

    test("should throw when extending non-existent entity type", () => {
      const freshRegistry = EntityRegistry.createFresh(logger);
      expect(() => {
        freshRegistry.extendFrontmatterSchema(
          "nonexistent",
          z.object({ extra: z.string() }),
        );
      }).toThrow();
    });

    test("should throw when extending entity type without frontmatterSchema", () => {
      expect(() => {
        registry.extendFrontmatterSchema(
          "note",
          z.object({ extra: z.string() }),
        );
      }).toThrow();
    });

    test("should not mutate original adapter's frontmatterSchema", () => {
      const { registry: profileRegistry, adapter: adapterWithSchema } =
        createProfileRegistry();

      profileRegistry.extendFrontmatterSchema(
        "profile",
        z.object({ tagline: z.string().optional() }),
      );

      expect(adapterWithSchema.frontmatterSchema.shape).not.toHaveProperty(
        "tagline",
      );

      const effective =
        profileRegistry.getEffectiveFrontmatterSchema("profile");
      expect(effective).toBeDefined();
      expect(effective?.shape).toHaveProperty("tagline");
    });

    test("effective schema should validate data with extension fields", () => {
      const { registry: profileRegistry } = createProfileRegistry();

      profileRegistry.extendFrontmatterSchema(
        "profile",
        z.object({ tagline: z.string().optional() }),
      );

      const effective =
        profileRegistry.getEffectiveFrontmatterSchema("profile");
      expect(effective).toBeDefined();
      if (!effective) return;
      const result = effective.safeParse({
        name: "Test",
        tagline: "Building what comes next",
      });
      expect(result.success).toBe(true);
    });

    test("should return base schema when no extensions registered", () => {
      const { registry: profileRegistry, adapter: adapterWithSchema } =
        createProfileRegistry();

      const effective =
        profileRegistry.getEffectiveFrontmatterSchema("profile");
      expect(effective).toBe(adapterWithSchema.frontmatterSchema);
    });

    test("should return undefined for type without frontmatterSchema", () => {
      const effective = registry.getEffectiveFrontmatterSchema("note");
      expect(effective).toBeUndefined();
    });
  });
});
