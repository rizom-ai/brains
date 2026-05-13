import { describe, it, expect } from "bun:test";
import {
  parseMarkdown,
  generateMarkdown,
  updateFrontmatterField,
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
});
