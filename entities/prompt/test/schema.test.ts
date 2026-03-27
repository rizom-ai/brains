import { describe, it, expect } from "bun:test";
import {
  promptSchema,
  promptFrontmatterSchema,
  promptMetadataSchema,
} from "../src/schemas/prompt";

describe("Prompt Schema", () => {
  it("should validate a valid prompt entity", () => {
    const result = promptSchema.safeParse({
      id: "blog-generation",
      entityType: "prompt",
      content:
        "---\ntitle: Blog Generation\ntarget: blog:generation\n---\nYou write blog posts.",
      metadata: {
        title: "Blog Generation",
        target: "blog:generation",
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      contentHash: "abc123",
    });

    expect(result.success).toBe(true);
  });

  it("should require entityType to be prompt", () => {
    const result = promptSchema.safeParse({
      id: "test",
      entityType: "note",
      content: "test",
      metadata: { title: "Test", target: "test:target" },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      contentHash: "abc",
    });

    expect(result.success).toBe(false);
  });

  it("should require target in metadata", () => {
    const result = promptMetadataSchema.safeParse({
      title: "Blog Generation",
    });

    expect(result.success).toBe(false);
  });

  it("should validate frontmatter schema", () => {
    const result = promptFrontmatterSchema.safeParse({
      title: "Blog Generation",
      target: "blog:generation",
    });

    expect(result.success).toBe(true);
  });

  it("should require target in frontmatter", () => {
    const result = promptFrontmatterSchema.safeParse({
      title: "Blog Generation",
    });

    expect(result.success).toBe(false);
  });
});
