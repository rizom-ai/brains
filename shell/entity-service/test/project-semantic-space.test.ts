import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestEntity } from "@brains/test-utils";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import {
  imageAdapter,
  imageSchema,
  minimalTestAdapter,
  minimalTestSchema,
} from "./helpers/test-schemas";

describe("projectSemanticSpace", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
      { name: "image", schema: imageSchema, adapter: imageAdapter },
    ]);
    await ctx.entityService.initialize();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function seedEmbedding(options: {
    id: string;
    entityType?: "test" | "image";
    visibility?: "public" | "shared" | "restricted";
    values: number[];
  }): Promise<void> {
    const entityType = options.entityType ?? "test";
    const entity = createTestEntity(entityType, {
      id: options.id,
      content: `Content for ${options.id}`,
      visibility: options.visibility ?? "public",
    });
    const embedding = new Float32Array(MOCK_DIMENSIONS);
    embedding.set(options.values);

    await ctx.entityService.createEntity({ entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType,
      embedding,
      contentHash: entity.contentHash,
    });
  }

  test("projects visible entities without exposing vectors", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "near", values: [1, 0] });
    await seedEmbedding({ id: "far", values: [0, 1] });

    const result = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
      origin: { entityId: "origin", entityType: "test" },
    });

    expect(result.origin).toEqual({
      kind: "entity",
      entityId: "origin",
      entityType: "test",
    });
    expect(result.points.map(({ entityId }) => entityId)).toEqual([
      "far",
      "near",
    ]);
    expect(result.points[0]?.coordinates).toHaveLength(2);
    expect(result.points[0]?.coordinates.every(Number.isFinite)).toBe(true);
    expect(result.points[0]).not.toHaveProperty("embedding");
    expect(
      result.points.find(({ entityId }) => entityId === "near")
        ?.distanceToOrigin,
    ).toBeCloseTo(0);
    expect(
      result.points.find(({ entityId }) => entityId === "far")
        ?.distanceToOrigin,
    ).toBeCloseTo(1);
    expect(result.distanceRange).toEqual({ min: 0, max: 1 });
  });

  test("filters projected points by entity type", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "test-entity", values: [1, 0] });
    await seedEmbedding({
      id: "image-entity",
      entityType: "image",
      values: [0, 1],
    });

    const result = await ctx.entityService.projectSemanticSpace({
      types: ["image"],
      origin: { entityId: "origin", entityType: "test" },
    });

    expect(result.points.map(({ entityId }) => entityId)).toEqual([
      "image-entity",
    ]);
  });

  test("fails closed to public visibility and allows explicit scope widening", async () => {
    await seedEmbedding({ id: "public-entity", values: [1, 0] });
    await seedEmbedding({
      id: "shared-entity",
      visibility: "shared",
      values: [0, 1],
    });
    await seedEmbedding({
      id: "restricted-entity",
      visibility: "restricted",
      values: [-1, 0],
    });

    const defaultResult = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
    });
    const sharedResult = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
      visibilityScope: "shared",
    });
    const restrictedResult = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
      visibilityScope: "restricted",
    });

    expect(defaultResult.points.map(({ entityId }) => entityId)).toEqual([
      "public-entity",
    ]);
    expect(sharedResult.points.map(({ entityId }) => entityId)).toEqual([
      "public-entity",
      "shared-entity",
    ]);
    expect(restrictedResult.points.map(({ entityId }) => entityId)).toEqual([
      "public-entity",
      "restricted-entity",
      "shared-entity",
    ]);
  });

  test("falls back to the visible point centroid when the origin is unavailable", async () => {
    await seedEmbedding({ id: "one", values: [1, 0] });
    await seedEmbedding({ id: "two", values: [0, 1] });

    const result = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
      origin: { entityId: "missing", entityType: "test" },
    });

    expect(result.origin).toEqual({ kind: "centroid" });
    expect(result.points[0]?.distanceToOrigin).toBeCloseTo(1 - Math.SQRT1_2);
    expect(result.points[1]?.distanceToOrigin).toBeCloseTo(1 - Math.SQRT1_2);
  });

  test("returns semantic neighbor relationships below the requested distance", async () => {
    await seedEmbedding({ id: "one", values: [1, 0] });
    await seedEmbedding({ id: "two", values: [0.99, 0.01] });
    await seedEmbedding({ id: "three", values: [0, 1] });

    const result = await ctx.entityService.projectSemanticSpace({
      types: ["test"],
      maxNeighborDistance: 0.1,
    });

    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]).toMatchObject({
      source: { entityId: "one", entityType: "test" },
      target: { entityId: "two", entityType: "test" },
    });
    expect(result.neighbors[0]?.distance).toBeLessThan(0.1);
  });
});
