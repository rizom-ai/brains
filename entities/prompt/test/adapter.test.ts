import { describe, it, expect } from "bun:test";
import type { Prompt } from "../src";
import { promptPlugin } from "./prompt-plugin";

// The adapter the prompt package registers for its type.
const promptAdapter = promptPlugin().adapter;

function prompt(content: string, metadata: Prompt["metadata"]): Prompt {
  return {
    id: "blog-generation",
    entityType: "prompt",
    content,
    visibility: "public",
    metadata,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    contentHash: "abc",
  };
}

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

      expect(result.metadata?.["title"]).toBe("Blog Generation");
      expect(result.metadata?.["target"]).toBe("blog:generation");
      // A declared type's record carries its body; the frontmatter is its
      // metadata.
      expect(result.content).toBe(
        "You are writing blog posts in a distinctive voice.",
      );
    });

    it("should generate slug from target as id hint", () => {
      const markdown = `---
title: Blog Generation
target: blog:generation
---
Write blog posts.`;

      const result = promptAdapter.fromMarkdown(markdown);

      expect(result.metadata?.["slug"]).toBe("blog-generation");
    });

    it("carries the default hash a copy was written from into metadata", () => {
      const markdown = `---
title: Blog Generation
target: blog:generation
defaultHash: abc123
---
Write blog posts.`;

      const result = promptAdapter.fromMarkdown(markdown);

      expect(result.metadata?.["defaultHash"]).toBe("abc123");
    });
  });

  describe("toMarkdown", () => {
    it("should preserve content as-is", () => {
      const result = promptAdapter.toMarkdown(
        prompt("You are writing blog posts.", {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
        }),
      );
      expect(result).toContain("title: Blog Generation");
      expect(result).toContain("blog:generation");
      expect(result).toContain("You are writing blog posts.");
      // The slug is derived from the target, never written to the file.
      expect(result).not.toContain("slug");
    });

    it("keeps the default hash in exported frontmatter", () => {
      const result = promptAdapter.toMarkdown(
        prompt("Prompt text.", {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
          defaultHash: "abc123",
        }),
      );

      expect(result).toContain("defaultHash: abc123");
    });
  });

  describe("extractMetadata", () => {
    it("should extract title and target from entity", () => {
      const metadata = promptAdapter.extractMetadata(
        prompt("Prompt text.", {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
        }),
      );
      expect(metadata["title"]).toBe("Blog Generation");
      expect(metadata["target"]).toBe("blog:generation");
    });
  });
});
