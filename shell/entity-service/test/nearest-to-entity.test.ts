import { createTestEntity } from "../src/test/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

describe("nearestToEntity", () => {
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

  test("lists the entries of the given types nearest the origin, closest first", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "close", entityType: "image", values: [1, 0.2] });
    await seedEmbedding({ id: "mid", entityType: "image", values: [1, 1] });
    await seedEmbedding({ id: "far", entityType: "image", values: [0, 1] });
    await seedEmbedding({ id: "same-type", values: [1, 0] });

    const nearest = await ctx.entityService.nearestToEntity({
      origin: { entityType: "test", entityId: "origin" },
      types: ["image"],
    });

    expect(nearest.map(({ entityId }) => entityId)).toEqual([
      "close",
      "mid",
      "far",
    ]);
    expect(nearest[0]?.entityType).toBe("image");
    expect(nearest[2]?.distance).toBeCloseTo(1);
  });

  test("keeps within the distance and the limit, and never returns the origin", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "twin", values: [1, 0] });
    await seedEmbedding({ id: "close", values: [1, 0.2] });
    await seedEmbedding({ id: "far", values: [0, 1] });

    const nearest = await ctx.entityService.nearestToEntity({
      origin: { entityType: "test", entityId: "origin" },
      types: ["test"],
      maxDistance: 0.5,
      limit: 1,
    });

    expect(nearest.map(({ entityId }) => entityId)).toEqual(["twin"]);
  });

  test("fails closed to public entries and origins", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({
      id: "hidden-origin",
      visibility: "restricted",
      values: [1, 0],
    });
    await seedEmbedding({ id: "public", values: [1, 0.1] });
    await seedEmbedding({
      id: "restricted",
      visibility: "restricted",
      values: [1, 0],
    });

    const publicOnly = await ctx.entityService.nearestToEntity({
      origin: { entityType: "test", entityId: "origin" },
      types: ["test"],
    });
    const fromHidden = await ctx.entityService.nearestToEntity({
      origin: { entityType: "test", entityId: "hidden-origin" },
      types: ["test"],
    });
    const widened = await ctx.entityService.nearestToEntity({
      origin: { entityType: "test", entityId: "origin" },
      types: ["test"],
      visibilityScope: "restricted",
    });

    expect(publicOnly.map(({ entityId }) => entityId)).toEqual(["public"]);
    expect(fromHidden).toEqual([]);
    expect(widened.map(({ entityId }) => entityId)).toContain("restricted");
  });
});
