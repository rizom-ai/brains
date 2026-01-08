import { describe, it, expect } from "bun:test";
import {
  parseMarkdown,
  extractTitle,
  extractIndexedFields,
  generateMarkdown,
  updateFrontmatterField,
  getCoverImageId,
  setCoverImageId,
} from "../src/markdown";

describe("Markdown Utilities", () => {
  describe("parseMarkdown", () => {
    it("should parse markdown with frontmatter", () => {
      const markdown = `---
title: Test Note
tags: [test, example]
---

# Test Note

This is the content.`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toEqual({
        title: "Test Note",
        tags: ["test", "example"],
      });
      expect(result.content).toBe("# Test Note\n\nThis is the content.");
    });

    it("should handle markdown without frontmatter", () => {
      const markdown = `# Just Content

No frontmatter here.`;

      const result = parseMarkdown(markdown);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe("# Just Content\n\nNo frontmatter here.");
    });

    it("should handle empty markdown", () => {
      const result = parseMarkdown("");

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe("");
    });
  });

  describe("extractTitle", () => {
    it("should extract title from frontmatter first", () => {
      const markdown = `---
title: Frontmatter Title
---

# Different Heading

First line of content`;

      const title = extractTitle(markdown, "entity_123");
      expect(title).toBe("Frontmatter Title");
    });

    it("should extract title from first heading if no frontmatter title", () => {
      const markdown = `---
tags: [test]
---

# Heading Title

Content here`;

      const title = extractTitle(markdown, "entity_123");
      expect(title).toBe("Heading Title");
    });

    it("should extract title from first non-empty line if no heading", () => {
      const markdown = `---
tags: [test]
---

This is the first line of content that will become the title.

More content here.`;

      const title = extractTitle(markdown, "entity_123");
      expect(title).toBe("This is the first line of content that will bec...");
    });

    it("should use entity ID as fallback", () => {
      const markdown = `---
tags: [test]
---

`;

      const title = extractTitle(markdown, "entity_123");
      expect(title).toBe("entity_123");
    });

    it("should remove markdown formatting from extracted title", () => {
      const markdown = `**Bold** and *italic* and \`code\` and [link](url)`;

      const title = extractTitle(markdown, "entity_123");
      expect(title).toBe("Bold and italic and code and link");
    });
  });

  describe("extractIndexedFields", () => {
    it("should extract all indexed fields", () => {
      const markdown = `---
title: Test Entity
tags: [one, two, three]
contentWeight: 0.8
---

Content here`;

      const fields = extractIndexedFields(markdown, "entity_123");

      expect(fields).toEqual({
        title: "Test Entity",
        tags: ["one", "two", "three"],
        contentWeight: 0.8,
      });
    });

    it("should use defaults when fields are missing", () => {
      const markdown = `Just some content`;

      const fields = extractIndexedFields(markdown, "entity_123");

      expect(fields).toEqual({
        title: "Just some content",
        tags: [],
        contentWeight: 1.0,
      });
    });

    it("should filter invalid tags", () => {
      const markdown = `---
tags: [valid, 123, "", "  ", another]
---`;

      const fields = extractIndexedFields(markdown, "entity_123");

      expect(fields.tags).toEqual(["valid", "another"]);
    });

    it("should clamp contentWeight between 0 and 1", () => {
      const markdown1 = `---
contentWeight: 1.5
---`;

      const fields1 = extractIndexedFields(markdown1, "entity_123");
      expect(fields1.contentWeight).toBe(1.0);

      const markdown2 = `---
contentWeight: -0.5
---`;

      const fields2 = extractIndexedFields(markdown2, "entity_123");
      expect(fields2.contentWeight).toBe(0.0);
    });
  });

  describe("generateMarkdown", () => {
    it("should generate markdown with frontmatter", () => {
      const frontmatter = {
        title: "Generated Note",
        tags: ["test"],
        created: "2024-01-01T00:00:00Z",
      };
      const content = "This is the content.";

      const markdown = generateMarkdown(frontmatter, content);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Generated Note");
      expect(markdown).toContain("tags:");
      expect(markdown).toContain("  - test");
      expect(markdown).toContain("This is the content.");
    });

    it("should handle empty frontmatter", () => {
      const markdown = generateMarkdown({}, "Just content");

      expect(markdown.trim()).toBe("Just content");
    });
  });

  describe("updateFrontmatterField", () => {
    it("should add a new field to frontmatter", () => {
      const markdown = `---
title: Test
---

Content here`;

      const result = updateFrontmatterField(
        markdown,
        "coverImageId",
        "my-image",
      );
      const parsed = parseMarkdown(result);

      expect(parsed.frontmatter["coverImageId"]).toBe("my-image");
      expect(parsed.frontmatter["title"]).toBe("Test");
      expect(parsed.content).toBe("Content here");
    });

    it("should update an existing field", () => {
      const markdown = `---
title: Test
coverImageId: old-image
---

Content here`;

      const result = updateFrontmatterField(
        markdown,
        "coverImageId",
        "new-image",
      );
      const parsed = parseMarkdown(result);

      expect(parsed.frontmatter["coverImageId"]).toBe("new-image");
    });

    it("should remove field when value is null", () => {
      const markdown = `---
title: Test
coverImageId: some-image
---

Content here`;

      const result = updateFrontmatterField(markdown, "coverImageId", null);
      const parsed = parseMarkdown(result);

      expect(parsed.frontmatter["coverImageId"]).toBeUndefined();
      expect(parsed.frontmatter["title"]).toBe("Test");
    });

    it("should remove field when value is undefined", () => {
      const markdown = `---
title: Test
coverImageId: some-image
---

Content here`;

      const result = updateFrontmatterField(
        markdown,
        "coverImageId",
        undefined,
      );
      const parsed = parseMarkdown(result);

      expect(parsed.frontmatter["coverImageId"]).toBeUndefined();
    });

    it("should handle markdown without frontmatter", () => {
      const markdown = "Just content, no frontmatter";

      const result = updateFrontmatterField(
        markdown,
        "coverImageId",
        "my-image",
      );
      const parsed = parseMarkdown(result);

      expect(parsed.frontmatter["coverImageId"]).toBe("my-image");
      expect(parsed.content).toBe("Just content, no frontmatter");
    });
  });

  describe("getCoverImageId", () => {
    it("should get cover image ID from frontmatter", () => {
      const entity = {
        content: `---
title: Test Post
coverImageId: hero-image-123
---

Content here`,
      };

      const result = getCoverImageId(entity);
      expect(result).toBe("hero-image-123");
    });

    it("should return null when no cover image", () => {
      const entity = {
        content: `---
title: Test Post
---

Content here`,
      };

      const result = getCoverImageId(entity);
      expect(result).toBeNull();
    });

    it("should return null for empty content", () => {
      const entity = { content: "" };

      const result = getCoverImageId(entity);
      expect(result).toBeNull();
    });
  });

  describe("setCoverImageId", () => {
    it("should set cover image ID on entity", () => {
      const entity = {
        id: "test-123",
        content: `---
title: Test Post
---

Content here`,
      };

      const result = setCoverImageId(entity, "new-cover-image");

      expect(result.id).toBe("test-123");
      expect(getCoverImageId(result)).toBe("new-cover-image");
    });

    it("should remove cover image when null", () => {
      const entity = {
        id: "test-123",
        content: `---
title: Test Post
coverImageId: old-image
---

Content here`,
      };

      const result = setCoverImageId(entity, null);

      expect(getCoverImageId(result)).toBeNull();
    });

    it("should preserve other entity properties", () => {
      const entity = {
        id: "test-123",
        entityType: "blog",
        content: `---
title: Test
---

Content`,
        metadata: { slug: "test-post" },
      };

      const result = setCoverImageId(entity, "cover-img");

      expect(result.id).toBe("test-123");
      expect(result.entityType).toBe("blog");
      expect(result.metadata).toEqual({ slug: "test-post" });
    });
  });
});
