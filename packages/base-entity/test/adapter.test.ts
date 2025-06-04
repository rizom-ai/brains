import { describe, test, expect } from "bun:test";
import { BaseEntityAdapter } from "../src/adapter";
import { parseMarkdown } from "@brains/utils";
import type { BaseEntity } from "@brains/types";

describe("BaseEntityAdapter", () => {
  const adapter = new BaseEntityAdapter();

  const testEntity: BaseEntity = {
    id: "test-id-123",
    entityType: "base",
    content: "This is test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  test("toMarkdown should convert entity to markdown with frontmatter", () => {
    const markdown = adapter.toMarkdown(testEntity);

    // Should contain YAML frontmatter
    expect(markdown).toContain("---");
    expect(markdown).toContain("id: test-id-123");
    expect(markdown).toContain("entityType: base");

    // Should contain content
    expect(markdown).toContain("This is test content");
  });

  test("fromMarkdown should extract entity fields from markdown", () => {
    const markdown = adapter.toMarkdown(testEntity);
    const extracted = adapter.fromMarkdown(markdown);

    // Should extract content
    expect(extracted.content).toBe("This is test content");

    // Should extract frontmatter fields
    expect(extracted.id).toBe("test-id-123");
    expect(extracted.entityType).toBe("base");
  });

  test("parseFrontMatter should extract metadata from markdown", () => {
    const markdown = adapter.toMarkdown(testEntity);
    const metadata = adapter.parseFrontMatter(markdown);

    expect(metadata.id).toBe("test-id-123");
    expect(metadata.entityType).toBe("base");
  });

  test("generateFrontMatter should create YAML frontmatter", () => {
    const frontmatter = adapter.generateFrontMatter(testEntity);

    expect(frontmatter).toContain("---");
    expect(frontmatter).toContain("id: test-id-123");
    expect(frontmatter).toContain("entityType: base");
  });

  test("extractMetadata should return searchable metadata", () => {
    const metadata = adapter.extractMetadata(testEntity);

    // BaseEntity only has timestamps in metadata now
    expect(metadata.created).toBe(testEntity.created);
    expect(metadata.updated).toBe(testEntity.updated);
  });
});
