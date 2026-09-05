import { createTestEntity } from "../src/test/index";
import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  extractMetadata,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  applyVisibilityToMarkdown,
  extractVisibilityFromMarkdown,
  hasVisibilityFrontmatter,
  type FrontmatterConfig,
} from "../src/frontmatter";
import type { BaseEntity } from "../src/types";

// Test entity type extending BaseEntity
interface TestNote extends BaseEntity {
  title: string;
  tags: string[];
  category?: string;
  priority?: number;
}

describe("Frontmatter Utilities", () => {
  const testEntity: TestNote = createTestEntity<TestNote>("note", {
    id: "test-123",
    title: "Test Note",
    content: "This is the content",
    tags: ["test", "important"],
    category: "work",
    priority: 1,
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-02T00:00:00Z",
  });

  describe("extractMetadata", () => {
    it("should exclude system fields by default", () => {
      const metadata = extractMetadata(testEntity);

      expect(metadata).toEqual({
        title: "Test Note",
        tags: ["test", "important"],
        category: "work",
        priority: 1,
        metadata: {},
      });

      // System fields should not be included
      expect(metadata).not.toHaveProperty("id");
      expect(metadata).not.toHaveProperty("entityType");
      expect(metadata).not.toHaveProperty("content");
      expect(metadata).not.toHaveProperty("contentHash");
      expect(metadata).not.toHaveProperty("created");
      expect(metadata).not.toHaveProperty("updated");
    });

    it("should respect includeFields config", () => {
      const config: FrontmatterConfig<TestNote> = {
        includeFields: ["title", "tags"],
      };

      const metadata = extractMetadata(testEntity, config);

      expect(metadata).toEqual({
        title: "Test Note",
        tags: ["test", "important"],
      });

      expect(metadata).not.toHaveProperty("category");
      expect(metadata).not.toHaveProperty("priority");
    });

    it("should respect excludeFields config", () => {
      const config: FrontmatterConfig<TestNote> = {
        excludeFields: [
          "id",
          "entityType",
          "content",
          "contentHash",
          "created",
          "updated",
          "tags",
        ],
      };

      const metadata = extractMetadata(testEntity, config);

      expect(metadata).toEqual({
        title: "Test Note",
        category: "work",
        priority: 1,
        metadata: {},
      });
    });

    it("should use custom serializers", () => {
      const config: FrontmatterConfig<TestNote> = {
        customSerializers: {
          tags: (tags) => tags.join(", "),
          priority: (p) => (p === 1 ? "high" : "normal"),
        },
      };

      const metadata = extractMetadata(testEntity, config);

      expect(metadata["tags"]).toBe("test, important");
      expect(metadata["priority"]).toBe("high");
    });

    it("should skip undefined values", () => {
      // Create entity without optional category field
      const { category: _category, ...entityWithoutCategory } = testEntity;
      const entityWithUndefined: TestNote = entityWithoutCategory;

      const metadata = extractMetadata(entityWithUndefined);

      expect(metadata).not.toHaveProperty("category");
    });
  });

  describe("generateMarkdownWithFrontmatter", () => {
    it("should generate markdown with frontmatter", () => {
      const metadata = {
        title: "Test Note",
        tags: ["test", "important"],
      };

      const markdown = generateMarkdownWithFrontmatter(
        "This is content",
        metadata,
      );

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Note");
      expect(markdown).toContain("tags:");
      expect(markdown).toContain("  - test");
      expect(markdown).toContain("  - important");
      expect(markdown).toContain("This is content");
    });

    it("should return content only when no metadata", () => {
      const markdown = generateMarkdownWithFrontmatter("Just content", {});

      expect(markdown).toBe("Just content");
      expect(markdown).not.toContain("---");
    });

    // Schemas model absence as `.nullable().default(null)` so section content
    // stays JSON-serializable, which means parsing turns an omitted key into an
    // explicit null. Writing that back would add `key: null` lines to files an
    // author wrote by hand, so absence has to round-trip as absence.
    it("omits null values so absence round-trips as absence", () => {
      const markdown = generateMarkdownWithFrontmatter("Body text.", {
        title: "Getting Started",
        description: null,
        slug: null,
      });

      expect(markdown).toContain("title: Getting Started");
      expect(markdown).not.toContain("description");
      expect(markdown).not.toContain("slug");
      expect(markdown).not.toContain("null");
    });

    it("returns content only when every metadata value is absent", () => {
      const markdown = generateMarkdownWithFrontmatter("Just content", {
        description: null,
        slug: undefined,
      });

      expect(markdown).toBe("Just content");
      expect(markdown).not.toContain("---");
    });
  });

  describe("parseMarkdownWithFrontmatter", () => {
    it("should parse markdown with frontmatter", () => {
      const markdown = `---
title: Test Note
tags:
  - test
  - important
category: work
---

This is the content`;

      const schema = z.object({
        title: z.string(),
        tags: z.array(z.string()),
        category: z.string().optional(),
      });
      const result = parseMarkdownWithFrontmatter(markdown, schema);

      expect(result.content).toBe("This is the content");
      expect(result.metadata).toEqual({
        title: "Test Note",
        tags: ["test", "important"],
        category: "work",
      });
    });

    it("should handle markdown without frontmatter", () => {
      const markdown = "Just content\n\nMore content";

      const schema = z.object({});
      const result = parseMarkdownWithFrontmatter(markdown, schema);

      expect(result.content).toBe("Just content\n\nMore content");
      expect(result.metadata).toEqual({});
    });

    it("should handle empty frontmatter", () => {
      const markdown = `---
---

Content here`;

      const schema = z.object({});
      const result = parseMarkdownWithFrontmatter(markdown, schema);

      expect(result.content).toBe("Content here");
      expect(result.metadata).toEqual({});
    });
  });

  describe("generateFrontmatter", () => {
    it("should generate frontmatter from metadata", () => {
      const metadata = {
        title: "Test Note",
        tags: ["test", "important"],
        category: "work",
      };

      const frontmatter = generateFrontmatter(metadata);

      expect(frontmatter).toContain("---");
      expect(frontmatter).toContain("title: Test Note");
      expect(frontmatter).toContain("tags:");
      expect(frontmatter).toContain("category: work");
      expect(frontmatter.endsWith("---")).toBe(true);
    });

    it("should return empty string for empty metadata", () => {
      const frontmatter = generateFrontmatter({});
      expect(frontmatter).toBe("");
    });
  });

  describe("roundtrip testing", () => {
    it("should maintain data through serialization roundtrip", () => {
      // Entity -> Markdown
      const metadata = extractMetadata(testEntity);
      const markdown = generateMarkdownWithFrontmatter(
        testEntity.content,
        metadata,
      );

      // Define schema for parsing
      const testNoteSchema = z.object({
        title: z.string(),
        tags: z.array(z.string()),
        category: z.string().optional(),
        priority: z.number().optional(),
      });

      // Markdown -> Parsed data
      const { content, metadata: parsed } = parseMarkdownWithFrontmatter(
        markdown,
        testNoteSchema,
      );

      // Check all non-system fields are preserved
      expect(parsed.title).toBe(testEntity.title);
      expect(parsed.tags).toEqual(testEntity.tags);
      expect(parsed.category).toBe("work");
      expect(parsed.priority).toBe(1);
      expect(content).toBe(testEntity.content);
    });

    it("should handle complex nested data", () => {
      interface ComplexEntity extends BaseEntity {
        metadata: {
          author: string;
          reviewers: string[];
          stats: {
            views: number;
            likes: number;
          };
        };
      }

      const complexEntity = createTestEntity<ComplexEntity>("complex", {
        id: "complex",
        content: "Complex content",
        created: "2024-01-01",
        updated: "2024-01-01",
        metadata: {
          author: "John Doe",
          reviewers: ["Jane", "Bob"],
          stats: {
            views: 100,
            likes: 10,
          },
        },
      });

      // Define schema for complex entity
      const complexSchema = z.object({
        metadata: z.object({
          author: z.string(),
          reviewers: z.array(z.string()),
          stats: z.object({
            views: z.number(),
            likes: z.number(),
          }),
        }),
      });

      const metadata = extractMetadata(complexEntity);
      const markdown = generateMarkdownWithFrontmatter(
        complexEntity.content,
        metadata,
      );
      const { metadata: parsed } = parseMarkdownWithFrontmatter(
        markdown,
        complexSchema,
      );

      expect(parsed.metadata).toEqual(complexEntity.metadata);
    });
  });
});

describe("visibility frontmatter", () => {
  describe("extractVisibilityFromMarkdown", () => {
    // Absence has to stay distinguishable from an explicit "public": callers
    // that merge over an existing entity need to know the file said nothing,
    // otherwise a file without the key silently demotes a restricted entity.
    it("returns undefined when frontmatter omits visibility", () => {
      expect(
        extractVisibilityFromMarkdown("---\ntitle: Note\n---\n\nBody"),
      ).toBeUndefined();
    });

    it("returns undefined when there is no frontmatter at all", () => {
      expect(extractVisibilityFromMarkdown("# Note\n\nBody")).toBeUndefined();
    });

    it("distinguishes an explicit public from an absent key", () => {
      expect(
        extractVisibilityFromMarkdown("---\nvisibility: public\n---\n\nBody"),
      ).toBe("public");
    });

    it("reads an explicit non-public visibility", () => {
      expect(
        extractVisibilityFromMarkdown("---\nvisibility: shared\n---\n\nBody"),
      ).toBe("shared");
    });

    it("normalizes the private synonym to restricted", () => {
      expect(
        extractVisibilityFromMarkdown("---\nvisibility: private\n---\n\nBody"),
      ).toBe("restricted");
    });
  });

  describe("applyVisibilityToMarkdown", () => {
    it("round-trips a non-public visibility", () => {
      const markdown = applyVisibilityToMarkdown(
        "# Note\n\nBody",
        "restricted",
      );

      expect(hasVisibilityFrontmatter(markdown)).toBe(true);
      expect(extractVisibilityFromMarkdown(markdown)).toBe("restricted");
    });

    // Export deliberately omits the key for public, so a public entity's file
    // reads back as "absent" rather than "explicitly public". Readers must
    // therefore treat absence as "no opinion", not as a demotion request.
    it("writes no visibility key for public, which reads back as absent", () => {
      const markdown = applyVisibilityToMarkdown("# Note\n\nBody", "public");

      expect(hasVisibilityFrontmatter(markdown)).toBe(false);
      expect(extractVisibilityFromMarkdown(markdown)).toBeUndefined();
    });

    it("drops a stale visibility key when demoting to public", () => {
      const restricted = applyVisibilityToMarkdown(
        "# Note\n\nBody",
        "restricted",
      );
      const demoted = applyVisibilityToMarkdown(restricted, "public");

      expect(hasVisibilityFrontmatter(demoted)).toBe(false);
    });
  });
});
