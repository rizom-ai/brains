import { describe, it, expect } from "bun:test";
import { promptAdapter } from "../src/adapters/prompt-adapter";

describe("PromptAdapter", () => {
  it("should have correct entity type", () => {
    expect(promptAdapter.entityType).toBe("prompt");
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter and extract metadata", () => {
      const markdown = `---
title: Blog Generation
target: blog:generation
---
You are writing blog posts in a distinctive voice.`;

      const result = promptAdapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("prompt");
      expect(result.metadata?.title).toBe("Blog Generation");
      expect(result.metadata?.target).toBe("blog:generation");
      expect(result.content).toBe(markdown);
    });

    it("should generate slug from target as id hint", () => {
      const markdown = `---
title: Blog Generation
target: blog:generation
---
Write blog posts.`;

      const result = promptAdapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).toBe("blog-generation");
    });
  });

  describe("toMarkdown", () => {
    it("should preserve content as-is", () => {
      const content = `---
title: Blog Generation
target: blog:generation
---
You are writing blog posts.`;

      const entity = {
        id: "blog-generation",
        entityType: "prompt" as const,
        content,
        metadata: {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "abc",
      };

      const result = promptAdapter.toMarkdown(entity);
      expect(result).toContain("title: Blog Generation");
      expect(result).toContain("blog:generation");
      expect(result).toContain("You are writing blog posts.");
    });
  });

  describe("extractMetadata", () => {
    it("should extract title and target from entity", () => {
      const entity = {
        id: "blog-generation",
        entityType: "prompt" as const,
        content:
          "---\ntitle: Blog Generation\ntarget: blog:generation\n---\nPrompt text.",
        metadata: {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "abc",
      };

      const metadata = promptAdapter.extractMetadata(entity);
      expect(metadata.title).toBe("Blog Generation");
      expect(metadata.target).toBe("blog:generation");
    });
  });
});
