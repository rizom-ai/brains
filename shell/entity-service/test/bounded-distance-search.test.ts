import { afterEach, describe, expect, test } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import {
  postAdapter,
  postSchema,
  peerAdapter,
  peerSchema,
} from "./helpers/test-schemas";
import { createTestEntity } from "../src/test/index";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import { scopeEntityReads } from "../src/scoped-entity-reads";

describe("bounded distance retrieval", () => {
  let ctx: EntityServiceTestContext | undefined;
  afterEach(async () => {
    await ctx?.cleanup();
  });
  async function seed(): Promise<EntityServiceTestContext> {
    const result = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
      { name: "peer", schema: peerSchema, adapter: peerAdapter },
    ]);
    ctx = result;
    for (const row of [
      { id: "a-draft", status: "draft", visibility: "public" as const },
      {
        id: "b-restricted",
        status: "published",
        visibility: "restricted" as const,
      },
      { id: "c-shared", status: "published", visibility: "shared" as const },
      { id: "d-excluded", status: "published", visibility: "public" as const },
      { id: "e-first", status: "published", visibility: "public" as const },
      { id: "f-second", status: "published", visibility: "public" as const },
      { id: "g-far", status: "published", visibility: "public" as const },
    ]) {
      const entity = createTestEntity("post", {
        id: row.id,
        content: row.id,
        visibility: row.visibility,
        metadata: { status: row.status },
      });
      await result.entityService.createEntity({ entity });
      await result.entityService.storeEmbedding({
        entityType: "post",
        entityId: entity.id,
        contentHash: entity.contentHash,
        embedding: new Float32Array(MOCK_DIMENSIONS).map((_, index) =>
          row.id === "g-far" && index < MOCK_DIMENSIONS / 2 ? -0.1 : 0.1,
        ),
      });
    }
    const entity = createTestEntity("peer", {
      id: "a-other-type",
      metadata: { status: "approved" },
    });
    await result.entityService.createEntity({ entity });
    await result.entityService.storeEmbedding({
      entityType: "peer",
      entityId: entity.id,
      contentHash: entity.contentHash,
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
    });
    return result;
  }
  test("type, publication, exact visibility and exclusions precede LIMIT, with deterministic ties", async () => {
    const { entityService } = await seed();
    const request = {
      query: "test",
      types: ["post"],
      visibility: "public" as const,
      visibilityScope: "restricted" as const,
      publishedOnly: true,
      excludeIds: ["d-excluded"],
      maxDistance: 0.3,
      limit: 1,
    };
    expect(
      (await entityService.searchWithDistances(request)).map(
        (row) => row.entityId,
      ),
    ).toEqual(["e-first"]);
    expect(
      (await entityService.searchWithDistances({ ...request, limit: 100 })).map(
        (row) => row.entityId,
      ),
    ).toEqual(["e-first", "f-second"]);
    expect(
      (
        await entityService.searchWithDistances({
          ...request,
          visibility: "shared",
        })
      ).map((row) => row.entityId),
    ).toEqual(["c-shared"]);
    expect(
      await entityService.searchWithDistances({
        ...request,
        visibility: "restricted",
        visibilityScope: "public",
      }),
    ).toEqual([]);
  });
  test("scoped views cannot lower publication or widen visibility before limiting", async () => {
    const { entityService } = await seed();
    const view = scopeEntityReads(entityService, {
      visibilityScope: "public",
      publishedOnly: true,
    });
    expect(
      (
        await view.searchWithDistances({
          query: "test",
          types: ["post"],
          visibilityScope: "restricted",
          publishedOnly: false,
          limit: 1,
        })
      ).map((row) => row.entityId),
    ).toEqual(["d-excluded"]);
    expect(
      await view.searchWithDistances({
        query: "test",
        visibility: "restricted",
        visibilityScope: "restricted",
        limit: 1,
      }),
    ).toEqual([]);
    const preview = scopeEntityReads(entityService, {
      visibilityScope: "public",
    });
    expect(
      (
        await preview.searchWithDistances({
          query: "test",
          types: ["post"],
          limit: 1,
        })
      ).map((row) => row.entityId),
    ).toEqual(["a-draft"]);
    expect(
      await entityService.searchWithDistances({ query: "test" }),
    ).toHaveLength(8);
  });
});
