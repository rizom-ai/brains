import { createTestEntity } from "../src/test/index";
import { rejects } from "node:assert/strict";
import { scopeEntityReads } from "../src/scoped-entity-reads";
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
    status?: string;
  }): Promise<void> {
    const entityType = options.entityType ?? "test";
    const entity = createTestEntity(entityType, {
      id: options.id,
      content: `Content for ${options.id}`,
      metadata: { status: options.status ?? "published" },
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

  test("enforces publication floors on origins and candidates before limiting", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "draft", values: [1, 0], status: "draft" });
    await seedEmbedding({ id: "published", values: [0.8, 0.6] });
    const reader = scopeEntityReads(ctx.entityService, {
      visibilityScope: "public",
      publishedOnly: true,
    });
    const request = {
      types: ["test"],
      origin: { entityType: "test", entityId: "origin" },
      publishedOnly: false,
      limit: 1,
    };
    expect(
      (await reader.nearestToEntity(request)).map((item) => item.entityId),
    ).toEqual(["published"]);
    expect(
      await reader.nearestToEntity({
        ...request,
        origin: { entityType: "test", entityId: "draft" },
      }),
    ).toEqual([]);
    const projection = await reader.projectSemanticSpace({
      types: ["test"],
      origin: { entityType: "test", entityId: "draft" },
      publishedOnly: false,
    });
    expect(projection.points.map((item) => item.entityId).sort()).toEqual([
      "origin",
      "published",
    ]);
    expect(projection.origin.kind).toBe("centroid");
  });

  test("preserves narrower requested visibility for semantic reads", async () => {
    await seedEmbedding({ id: "origin", values: [1, 0] });
    await seedEmbedding({ id: "public-neighbor", values: [0.8, 0.6] });
    await seedEmbedding({
      id: "private-neighbor",
      values: [1, 0],
      visibility: "restricted",
    });
    const reader = scopeEntityReads(ctx.entityService, {
      visibilityScope: "restricted",
    });
    expect(
      (
        await reader.nearestToEntity({
          types: ["test"],
          origin: { entityType: "test", entityId: "origin" },
          visibilityScope: "public",
        })
      ).map((item) => item.entityId),
    ).toEqual(["public-neighbor"]);
    const projection = await reader.projectSemanticSpace({
      types: ["test"],
      visibilityScope: "public",
    });
    expect(projection.points.map((item) => item.entityId).sort()).toEqual([
      "origin",
      "public-neighbor",
    ]);
    const publicReader = scopeEntityReads(ctx.entityService, {
      visibilityScope: "public",
    });
    expect(
      (
        await publicReader.nearestToEntity({
          types: ["test"],
          origin: { entityType: "test", entityId: "origin" },
          visibilityScope: "restricted",
        })
      ).map((item) => item.entityId),
    ).toEqual(["public-neighbor"]);
    const deniedOrigin = await publicReader.projectSemanticSpace({
      types: ["test"],
      origin: { entityType: "test", entityId: "private-neighbor" },
      visibilityScope: "restricted",
    });
    expect(deniedOrigin.origin.kind).toBe("centroid");
    expect(deniedOrigin.points.map((item) => item.entityId).sort()).toEqual([
      "origin",
      "public-neighbor",
    ]);
  });

  test("validates requests even when semantic indexing is disabled", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService([], { embeddingsEnabled: false });
    await ctx.entityService.initialize();
    const request = {
      origin: { entityType: "test", entityId: "origin" },
      types: ["test"],
    };
    await rejects(ctx.entityService.nearestToEntity({ ...request, limit: 0 }), {
      name: "ZodError",
    });
    expect(ctx.entityService.nearestToEntity(request)).rejects.toThrow(
      "Semantic indexing is disabled for this Brain instance",
    );
  });

  test("rejects invalid cosine distance and result bounds", async () => {
    for (const maxDistance of [-1, 2.1, NaN, Infinity]) {
      await rejects(
        ctx.entityService.nearestToEntity({
          origin: { entityType: "test", entityId: "origin" },
          types: ["test"],
          maxDistance,
        }),
      );
    }
    for (const limit of [0, 2001, 1.5, NaN]) {
      await rejects(
        ctx.entityService.nearestToEntity({
          origin: { entityType: "test", entityId: "origin" },
          types: ["test"],
          limit,
        }),
      );
    }
    expect(
      await ctx.entityService.nearestToEntity({
        origin: { entityType: "test", entityId: "missing" },
        types: ["test"],
      }),
    ).toEqual([]);
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
