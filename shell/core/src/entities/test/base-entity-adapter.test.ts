import { describe, test, expect } from "bun:test";
import { BaseEntityAdapter } from "../base-entity-adapter";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils";

describe("BaseEntityAdapter", () => {
  const adapter = new BaseEntityAdapter();

  const testEntity: BaseEntity = {
    id: "test-id-123",
    entityType: "base",
    content: "This is test content",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  test("toMarkdown should convert entity to markdown without frontmatter", () => {
    const markdown = adapter.toMarkdown(testEntity);

    // BaseEntity has no entity-specific fields, so no frontmatter
    expect(markdown).toBe("This is test content");
    expect(markdown).not.toContain("---");
    expect(markdown).not.toContain("id:");
    expect(markdown).not.toContain("entityType:");
  });

  test("fromMarkdown should return entire markdown as content", () => {
    // Test with plain content (no frontmatter)
    const plainMarkdown = "This is test content";
    const extracted = adapter.fromMarkdown(plainMarkdown);

    // Should return entire markdown as content
    expect(extracted.content).toBe("This is test content");

    // Should not have system fields
    expect(extracted.id).toBeUndefined();
    expect(extracted.entityType).toBeUndefined();
  });

  test("parseFrontMatter should return empty object for base entities", () => {
    const markdown = "This is test content";
    const schema = z.object({});
    const metadata = adapter.parseFrontMatter(markdown, schema);

    expect(metadata).toEqual({});
  });

  test("generateFrontMatter should return empty string for base entities", () => {
    const frontmatter = adapter.generateFrontMatter(testEntity);

    // BaseEntity has no entity-specific fields, so no frontmatter
    expect(frontmatter).toBe("");
  });

  test("extractMetadata should return empty object for base entities", () => {
    const metadata = adapter.extractMetadata(testEntity);

    // BaseEntity has no entity-specific fields for metadata
    expect(metadata).toEqual({});
  });

  test("should preserve markdown with frontmatter exactly as-is", () => {
    // BaseEntity adapter preserves the entire markdown including frontmatter
    const markdownWithFrontmatter = `---
title: Some Title
customField: value
---

This is test content`;

    const extracted = adapter.fromMarkdown(markdownWithFrontmatter);

    // Should preserve entire markdown including frontmatter
    expect(extracted.content).toBe(markdownWithFrontmatter);

    // BaseEntity adapter does not extract frontmatter fields
    expect((extracted as Record<string, unknown>)["title"]).toBeUndefined();
    expect(
      (extracted as Record<string, unknown>)["customField"],
    ).toBeUndefined();
  });
});
