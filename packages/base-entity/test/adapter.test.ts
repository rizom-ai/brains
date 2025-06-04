import { describe, test, expect } from "bun:test";
import { BaseEntityAdapter } from "../src/adapter";
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

  test("toMarkdown should convert entity to markdown without frontmatter", () => {
    const markdown = adapter.toMarkdown(testEntity);

    // BaseEntity has no entity-specific fields, so no frontmatter
    expect(markdown).toBe("This is test content");
    expect(markdown).not.toContain("---");
    expect(markdown).not.toContain("id:");
    expect(markdown).not.toContain("entityType:");
  });

  test("fromMarkdown should extract entity fields from markdown", () => {
    // Test with plain content (no frontmatter)
    const plainMarkdown = "This is test content";
    const extracted = adapter.fromMarkdown(plainMarkdown);

    // Should extract content
    expect(extracted.content).toBe("This is test content");

    // Should not have system fields
    expect(extracted.id).toBeUndefined();
    expect(extracted.entityType).toBeUndefined();
  });

  test("parseFrontMatter should return empty object for base entities", () => {
    const markdown = "This is test content";
    const metadata = adapter.parseFrontMatter(markdown);

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

  test("should handle markdown with frontmatter from other sources", () => {
    // If a base entity markdown has frontmatter (e.g., from manual editing),
    // it should be parsed but not include system fields
    const markdownWithFrontmatter = `---
title: Some Title
customField: value
---

This is test content`;

    const extracted = adapter.fromMarkdown(markdownWithFrontmatter);

    expect(extracted.content).toBe("This is test content");
    // Entity-specific fields from frontmatter should be included
    expect((extracted as any).title).toBe("Some Title");
    expect((extracted as any).customField).toBe("value");
  });
});