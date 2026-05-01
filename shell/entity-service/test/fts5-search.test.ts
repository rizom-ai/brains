import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import { createTestEntity } from "@brains/test-utils";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("FTS5 full-text search", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("keyword search finds exact term in content", async () => {
    const entity = createTestEntity("test", {
      content: "A deep dive into TypeScript generics and type inference",
    });
    await ctx.entityService.createEntity(entity);

    // Store embedding so vector search works too
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    const results = await ctx.entityService.search("TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entity.id).toBe(entity.id);
  });

  test("FTS5 index is updated when entity content changes", async () => {
    const entity = createTestEntity("test", {
      content: "Introduction to Python programming",
    });
    await ctx.entityService.createEntity(entity);
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    // Update content
    await ctx.entityService.updateEntity({
      ...entity,
      content: "Advanced Rust memory management",
    });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.2),
      contentHash: "updated-hash",
    });

    // Old term should not get FTS boost (lower score)
    const oldResults = await ctx.entityService.search("Python");
    const oldScore =
      oldResults.find((r) => r.entity.id === entity.id)?.score ?? 0;

    // New term should get FTS boost (higher score)
    const newResults = await ctx.entityService.search("Rust");
    const newScore =
      newResults.find((r) => r.entity.id === entity.id)?.score ?? 0;

    expect(newScore).toBeGreaterThan(oldScore);
  });

  test("FTS5 index is cleaned up when entity is deleted", async () => {
    const entity = createTestEntity("test", {
      content: "Unique keyword: xylophone orchestration techniques",
    });
    await ctx.entityService.createEntity(entity);
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    await ctx.entityService.deleteEntity("test", entity.id);

    const results = await ctx.entityService.search("xylophone");
    expect(results).toHaveLength(0);
  });

  test("search handles queries with special FTS5 characters", async () => {
    const entity = createTestEntity("test", {
      content: "What topics does this brain cover?",
    });
    await ctx.entityService.createEntity(entity);
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    // These queries contain characters that break FTS5 if not escaped:
    // ? is a prefix operator, * is a glob, OR/AND are boolean operators
    const queries = [
      "What topics does this brain cover?",
      "search for something*",
      'query with "quotes" inside',
      "hello OR world",
      "test AND other",
    ];

    for (const q of queries) {
      // Should not throw
      const results = await ctx.entityService.search(q);
      expect(Array.isArray(results)).toBe(true);
    }
  });

  test("search parameterizes caller-provided weight keys", async () => {
    const entity = createTestEntity("test", {
      content: "Weighted search content",
    });
    await ctx.entityService.createEntity(entity);
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    const results = await ctx.entityService.search("weighted", {
      weight: { "test' THEN 999 ELSE 1 END --": 10 },
    });

    expect(Array.isArray(results)).toBe(true);
  });

  test("keyword search boosts exact matches over semantic similarity", async () => {
    // Entity with exact keyword
    const exact = createTestEntity("test", {
      id: "exact-match",
      content: "TypeScript is a typed superset of JavaScript",
    });
    // Entity that's semantically similar but no exact keyword
    const similar = createTestEntity("test", {
      id: "similar",
      content: "Strongly typed programming languages improve code quality",
    });

    await ctx.entityService.createEntity(exact);
    await ctx.entityService.createEntity(similar);

    // Give both similar vector embeddings
    await ctx.entityService.storeEmbedding({
      entityId: "exact-match",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: exact.contentHash,
    });
    await ctx.entityService.storeEmbedding({
      entityId: "similar",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: similar.contentHash,
    });

    const results = await ctx.entityService.search("TypeScript");
    expect(results.length).toBe(2);
    // Exact keyword match should rank first
    expect(results[0]?.entity.id).toBe("exact-match");
  });
});
