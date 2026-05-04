import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import { createTestEntity } from "@brains/test-utils";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("search diagnostics", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("searchWithDistances returns distances for all results", async () => {
    // Create entities with embeddings
    const testData = [
      { id: "e1", content: "TypeScript programming guide" },
      { id: "e2", content: "JavaScript fundamentals" },
      { id: "e3", content: "Cooking Italian pasta" },
    ];
    for (const { id, content } of testData) {
      const entity = createTestEntity("test", { id, content });
      await ctx.entityService.createEntity({ entity: entity });
      await ctx.entityService.storeEmbedding({
        entityId: id,
        entityType: "test",
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        contentHash: entity.contentHash,
      });
    }

    const results = await ctx.entityService.searchWithDistances({
      query: "TypeScript",
    });
    expect(results.length).toBe(3);
    // Each result has a distance
    for (const r of results) {
      expect(typeof r.distance).toBe("number");
      // Cosine distance can be very slightly negative due to floating point
      expect(r.distance).toBeGreaterThanOrEqual(-0.001);
    }
  });

  test("searchWithDistances returns results sorted by distance ascending", async () => {
    const e1 = createTestEntity("test", {
      id: "close",
      content: "Very close content",
    });
    const e2 = createTestEntity("test", {
      id: "far",
      content: "Very far content",
    });

    await ctx.entityService.createEntity({ entity: e1 });
    await ctx.entityService.createEntity({ entity: e2 });

    // Give different embeddings to simulate distance variation
    await ctx.entityService.storeEmbedding({
      entityId: "close",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: e1.contentHash,
    });
    await ctx.entityService.storeEmbedding({
      entityId: "far",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.9),
      contentHash: e2.contentHash,
    });

    const results = await ctx.entityService.searchWithDistances({
      query: "test query",
    });
    expect(results.length).toBe(2);
    // Sorted by distance ascending
    const first = results[0];
    const second = results[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first && second) {
      expect(first.distance).toBeLessThanOrEqual(second.distance);
    }
  });

  test("searchWithDistances returns no results when no embeddings exist", async () => {
    const entity = createTestEntity("test", { content: "No embedding" });
    await ctx.entityService.createEntity({ entity: entity });

    const results = await ctx.entityService.searchWithDistances({
      query: "anything",
    });
    expect(results).toHaveLength(0);
  });
});
