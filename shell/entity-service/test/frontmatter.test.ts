import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  extractMetadata,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  shouldIncludeInFrontmatter,
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
  const testEntity: TestNote = {
    id: "test-123",
    entityType: "note",
    title: "Test Note",
    content: "This is the content",
    tags: ["test", "important"],
    category: "work",
    priority: 1,
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-02T00:00:00Z",
  };

  describe("extractMetadata", () => {
    it("should exclude system fields by default", () => {
      const metadata = extractMetadata(testEntity);

      expect(metadata).toEqual({
        title: "Test Note",
        tags: ["test", "important"],
        category: "work",
        priority: 1,
      });

      // System fields should not be included
      expect(metadata).not.toHaveProperty("id");
      expect(metadata).not.toHaveProperty("entityType");
      expect(metadata).not.toHaveProperty("content");
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

  describe("shouldIncludeInFrontmatter", () => {
    it("should exclude null and undefined", () => {
      expect(shouldIncludeInFrontmatter(null)).toBe(false);
      expect(shouldIncludeInFrontmatter(undefined)).toBe(false);
    });

    it("should exclude empty arrays", () => {
      expect(shouldIncludeInFrontmatter([])).toBe(false);
    });

    it("should exclude empty objects", () => {
      expect(shouldIncludeInFrontmatter({})).toBe(false);
    });

    it("should include valid values", () => {
      expect(shouldIncludeInFrontmatter("string")).toBe(true);
      expect(shouldIncludeInFrontmatter(0)).toBe(true);
      expect(shouldIncludeInFrontmatter(false)).toBe(true);
      expect(shouldIncludeInFrontmatter(["item"])).toBe(true);
      expect(shouldIncludeInFrontmatter({ key: "value" })).toBe(true);
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

      const complexEntity: ComplexEntity = {
        id: "complex",
        entityType: "complex",
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
      };

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
