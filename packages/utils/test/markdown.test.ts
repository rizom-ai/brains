import { describe, it, expect } from "bun:test";
import {
  parseMarkdown,
  extractTitle,
  extractIndexedFields,
  generateMarkdown,
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
});