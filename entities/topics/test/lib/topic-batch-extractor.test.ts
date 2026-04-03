import { describe, it, expect } from "bun:test";
import { buildBatchPrompt } from "../../src/lib/topic-batch-extractor";
import type { BaseEntity } from "@brains/plugins";

function makeEntity(
  id: string,
  entityType: string,
  title: string,
  content: string,
): BaseEntity {
  return {
    id,
    entityType,
    content,
    contentHash: "x",
    metadata: { title },
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
  };
}

describe("buildBatchPrompt", () => {
  it("should include all entities with index, type, and title", () => {
    const entities = [
      makeEntity("p1", "post", "Institutional Design", "Content about DAOs"),
      makeEntity("p2", "post", "Token Engineering", "Content about tokens"),
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("[1] Post: Institutional Design");
    expect(prompt).toContain("[2] Post: Token Engineering");
  });

  it("should include entity content", () => {
    const entities = [
      makeEntity("p1", "post", "My Post", "This is the full post content."),
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("This is the full post content.");
  });

  it("should separate entities with dividers", () => {
    const entities = [
      makeEntity("a", "post", "A", "Content A"),
      makeEntity("b", "note", "B", "Content B"),
    ];

    const prompt = buildBatchPrompt(entities);

    // Should have --- dividers between entities
    expect(prompt).toContain("---");
  });

  it("should capitalize entity type in header", () => {
    const entities = [makeEntity("p1", "social-post", "My Post", "content")];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("Social-post: My Post");
  });

  it("should use entity id as title fallback", () => {
    const entities = [
      {
        id: "my-entity",
        entityType: "post",
        content: "content",
        contentHash: "x",
        metadata: {},
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
      },
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("my-entity");
  });

  it("should handle empty batch", () => {
    const prompt = buildBatchPrompt([]);
    expect(prompt).toBe("");
  });
});
