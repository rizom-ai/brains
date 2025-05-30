import { describe, test, expect } from "bun:test";
import { BaseEntityAdapter } from "../src/adapter";
import { parseMarkdown } from "@brains/utils";
import type { BaseEntity } from "@brains/types";

describe("BaseEntityAdapter", () => {
  const adapter = new BaseEntityAdapter();

  const testEntity: BaseEntity = {
    id: "test-id-123",
    entityType: "base",
    title: "Test Entity",
    content: "This is test content",
    tags: ["test", "entity"],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  test("toMarkdown should convert entity to markdown with frontmatter", () => {
    const markdown = adapter.toMarkdown(testEntity);

    // Should contain YAML frontmatter
    expect(markdown).toContain("---");
    expect(markdown).toContain("id: test-id-123");
    expect(markdown).toContain("entityType: base");
    expect(markdown).toContain("title: Test Entity");

    // Should contain content
    expect(markdown).toContain("This is test content");

    // Tags should be in frontmatter
    expect(markdown).toContain("tags:");
    expect(markdown).toContain("- test");
    expect(markdown).toContain("- entity");
  });

  test("fromMarkdown should extract entity fields from markdown", () => {
    const markdown = adapter.toMarkdown(testEntity);
    const extracted = adapter.fromMarkdown(markdown);

    // Should extract content
    expect(extracted.content).toBe("This is test content");

    // Should extract frontmatter fields
    expect(extracted.id).toBe("test-id-123");
    expect(extracted.entityType).toBe("base");
    expect(extracted.title).toBe("Test Entity");
    expect(extracted.tags).toEqual(["test", "entity"]);
  });

  test("parseFrontMatter should extract metadata from markdown", () => {
    const markdown = adapter.toMarkdown(testEntity);
    const metadata = adapter.parseFrontMatter(markdown);

    expect(metadata.id).toBe("test-id-123");
    expect(metadata.entityType).toBe("base");
    expect(metadata.title).toBe("Test Entity");
    expect(metadata.tags).toEqual(["test", "entity"]);
  });

  test("generateFrontMatter should create YAML frontmatter", () => {
    const frontmatter = adapter.generateFrontMatter(testEntity);

    expect(frontmatter).toContain("---");
    expect(frontmatter).toContain("id: test-id-123");
    expect(frontmatter).toContain("entityType: base");
    expect(frontmatter).toContain("title: Test Entity");
    expect(frontmatter).toContain("tags:");
    expect(frontmatter).toContain("- test");
    expect(frontmatter).toContain("- entity");
  });

  test("extractMetadata should return searchable metadata", () => {
    const metadata = adapter.extractMetadata(testEntity);

    expect(metadata.title).toBe("Test Entity");
    expect(metadata.tags).toEqual(["test", "entity"]);
    expect(metadata.created).toBe(testEntity.created);
    expect(metadata.updated).toBe(testEntity.updated);
  });
});
