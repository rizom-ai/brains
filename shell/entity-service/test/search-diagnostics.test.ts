import { createTestEntity } from "../src/test/index";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import {
  createNoteInput,
  minimalTestAdapter,
  minimalTestSchema,
  noteAdapter,
  noteSchema,
} from "./helpers/test-schemas";
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

  describe("filters", () => {
    const near = new Float32Array(MOCK_DIMENSIONS).fill(0.1);
    // Orthogonal to the mock query embedding: cosine distance 1.
    const far = new Float32Array(MOCK_DIMENSIONS).map((_, index) =>
      index < MOCK_DIMENSIONS / 2 ? 0.1 : -0.1,
    );
    let nearNoteId: string;

    beforeEach(async () => {
      await ctx.cleanup();
      ctx = await setupEntityService([
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
        { name: "note", schema: noteSchema, adapter: noteAdapter },
      ]);
      for (const [id, embedding] of [
        ["near-test", near],
        ["far-test", far],
      ] as const) {
        const entity = createTestEntity("test", { id, content: id });
        await ctx.entityService.createEntity({ entity });
        await ctx.entityService.storeEmbedding({
          entityId: id,
          entityType: "test",
          embedding,
          contentHash: entity.contentHash,
        });
      }
      const { entityId } = await ctx.entityService.createEntity({
        entity: createNoteInput({
          title: "Near note",
          content: "Body",
          tags: [],
        }),
      });
      const note = await ctx.entityService.getEntity(
        { entityType: "note", id: entityId },
        noteSchema,
      );
      if (!note) throw new Error("Note should exist");
      nearNoteId = note.id;
      await ctx.entityService.storeEmbedding({
        entityId: note.id,
        entityType: "note",
        embedding: near,
        contentHash: note.contentHash,
      });
    });

    test("keeps only the requested types", async () => {
      const results = await ctx.entityService.searchWithDistances({
        query: "anything",
        types: ["test"],
      });

      expect(results.map((result) => result.entityId).sort()).toEqual([
        "far-test",
        "near-test",
      ]);
    });

    test("keeps only results within maxDistance", async () => {
      const results = await ctx.entityService.searchWithDistances({
        query: "anything",
        maxDistance: 0.5,
      });

      expect(results.map((result) => result.entityId).sort()).toEqual(
        [nearNoteId, "near-test"].sort(),
      );
    });
  });
});
