import { describe, test, expect } from "bun:test";
import { BaseEntityFormatter } from "../src/formatter";
import type { BaseEntity } from "@brains/types";

describe("BaseEntityFormatter", () => {
  const formatter = new BaseEntityFormatter();
  
  const testEntity: BaseEntity = {
    id: "test-id-123",
    entityType: "base",
    title: "Test Entity",
    content: "This is test content",
    tags: ["test", "entity"],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  
  test("canFormat should identify BaseEntity objects", () => {
    expect(formatter.canFormat(testEntity)).toBe(true);
    expect(formatter.canFormat({ some: "other object" })).toBe(false);
    expect(formatter.canFormat(null)).toBe(false);
    expect(formatter.canFormat(undefined)).toBe(false);
    expect(formatter.canFormat("string")).toBe(false);
  });
  
  test("format should return formatted markdown", () => {
    const formatted = formatter.format(testEntity);
    
    // Should contain title
    expect(formatted).toContain("# Test Entity");
    
    // Should contain database fields section
    expect(formatted).toContain("## Database Fields");
    expect(formatted).toContain("**ID**: test-id-123");
    expect(formatted).toContain("**Type**: base");
    expect(formatted).toContain("**Tags**: test, entity");
    
    // Should contain content section
    expect(formatted).toContain("## Content");
    expect(formatted).toContain("This is test content");
  });
  
  test("format should handle entities with frontmatter in content", () => {
    const entityWithFrontmatter: BaseEntity = {
      ...testEntity,
      content: `---
custom: value
priority: high
---
# Custom Content

This content has frontmatter.`
    };
    
    const formatted = formatter.format(entityWithFrontmatter);
    
    // Should contain frontmatter section
    expect(formatted).toContain("## Frontmatter");
    expect(formatted).toContain("```json");
    expect(formatted).toContain(`"custom": "value"`);
    expect(formatted).toContain(`"priority": "high"`);
    
    // Should still contain content
    expect(formatted).toContain("# Custom Content");
    expect(formatted).toContain("This content has frontmatter");
  });
  
  test("format should handle non-entity data gracefully", () => {
    const result = formatter.format("not an entity");
    expect(result).toBe("not an entity");
  });
});