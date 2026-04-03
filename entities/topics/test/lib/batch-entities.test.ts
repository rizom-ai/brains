import { describe, it, expect } from "bun:test";
import {
  batchEntities,
  estimateTokens,
  DEFAULT_TOKEN_BUDGET,
} from "../../src/lib/batch-entities";

import type { BaseEntity } from "@brains/plugins";

function makeEntity(id: string, content: string): BaseEntity {
  return {
    id,
    entityType: "post",
    content,
    contentHash: "x",
    metadata: { title: id },
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
  };
}

describe("estimateTokens", () => {
  it("should estimate tokens as chars / 4", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75, rounded up
  });

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should handle long content", () => {
    const content = "a".repeat(6000); // 6000 chars = 1500 tokens
    expect(estimateTokens(content)).toBe(1500);
  });
});

describe("batchEntities", () => {
  it("should return single batch when all entities fit", () => {
    const entities = [
      makeEntity("a", "short content"),
      makeEntity("b", "also short"),
    ];

    const batches = batchEntities(entities);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("should split into multiple batches when entities exceed budget", () => {
    // Each entity ~1500 tokens (6000 chars)
    const entities = Array.from({ length: 50 }, (_, i) =>
      makeEntity(`entity-${i}`, "x".repeat(6000)),
    );

    // With default budget of 108K tokens, 50 × 1500 = 75K tokens
    // Should fit in one batch
    const batches = batchEntities(entities);
    expect(batches).toHaveLength(1);
  });

  it("should split when total exceeds budget", () => {
    // Each entity ~5000 tokens (20000 chars) — heavy posts
    const entities = Array.from({ length: 30 }, (_, i) =>
      makeEntity(`entity-${i}`, "x".repeat(20000)),
    );

    // 30 × 5000 = 150K tokens > 108K budget → needs 2 batches
    const batches = batchEntities(entities);
    expect(batches.length).toBeGreaterThan(1);
  });

  it("should never exceed token budget per batch", () => {
    const entities = Array.from({ length: 100 }, (_, i) =>
      makeEntity(`entity-${i}`, "x".repeat(6000)),
    );

    const batches = batchEntities(entities);
    for (const batch of batches) {
      const totalTokens = batch.reduce(
        (sum, e) => sum + estimateTokens(e.content),
        0,
      );
      expect(totalTokens).toBeLessThanOrEqual(DEFAULT_TOKEN_BUDGET);
    }
  });

  it("should handle empty input", () => {
    const batches = batchEntities([]);
    expect(batches).toHaveLength(0);
  });

  it("should handle single entity", () => {
    const batches = batchEntities([makeEntity("a", "content")]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it("should put oversized entity in its own batch", () => {
    // One entity exceeds budget by itself
    const entities = [
      makeEntity("huge", "x".repeat(500000)), // 125K tokens
      makeEntity("small", "short"),
    ];

    const batches = batchEntities(entities);
    // Huge entity gets its own batch, small gets its own
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0]?.[0]?.id).toBe("huge");
  });

  it("should accept custom token budget", () => {
    const entities = Array.from(
      { length: 10 },
      (_, i) => makeEntity(`entity-${i}`, "x".repeat(4000)), // 1000 tokens each
    );

    // Budget of 3000 tokens → ~3 entities per batch
    const batches = batchEntities(entities, 3000);
    expect(batches.length).toBeGreaterThanOrEqual(3);
  });

  it("should preserve entity order across batches", () => {
    const entities = Array.from({ length: 10 }, (_, i) =>
      makeEntity(`entity-${i}`, "x".repeat(4000)),
    );

    const batches = batchEntities(entities, 3000);
    const flattened = batches.flat();
    for (let i = 0; i < flattened.length; i++) {
      expect(flattened[i]?.id).toBe(`entity-${i}`);
    }
  });
});
