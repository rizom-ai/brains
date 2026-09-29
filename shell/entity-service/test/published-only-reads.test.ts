import { describe, expect, test, afterEach } from "bun:test";
import {
  postSchema,
  postAdapter,
  peerSchema,
  peerAdapter,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { createTestEntity } from "../src/test/index";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import { scopeEntityReads } from "../src/scoped-entity-reads";

// Reads for people who may only see published work (a site's visitors)
// apply the same publish gate as a published-only listing: each type's
// declared statuses, or the default lifecycle for a type that declares none.
describe("publishedOnly reads", () => {
  let ctx: EntityServiceTestContext | undefined;

  afterEach(async () => {
    await ctx?.cleanup();
    ctx = undefined;
  });

  const rows = [
    { id: "post-published", entityType: "post", status: "published" },
    { id: "post-draft", entityType: "post", status: "draft" },
    { id: "post-statusless", entityType: "post", status: undefined },
    { id: "peer-approved", entityType: "peer", status: "approved" },
    { id: "peer-discovered", entityType: "peer", status: "discovered" },
    { id: "peer-statusless", entityType: "peer", status: undefined },
  ];

  async function seed(
    embeddingsEnabled: boolean,
  ): Promise<EntityServiceTestContext> {
    const seeded = await setupEntityService(
      [
        { name: "post", schema: postSchema, adapter: postAdapter },
        // Declares publishedStatuses: ["approved"].
        { name: "peer", schema: peerSchema, adapter: peerAdapter },
      ],
      { embeddingsEnabled },
    );
    for (const row of rows) {
      const entity = createTestEntity(row.entityType, {
        id: row.id,
        content: `Institutional memory ${row.id}`,
        metadata: row.status ? { status: row.status } : {},
      });
      await seeded.entityService.createEntity({ entity });
      if (embeddingsEnabled) {
        await seeded.entityService.storeEmbedding({
          entityId: entity.id,
          entityType: row.entityType,
          embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
          contentHash: entity.contentHash,
        });
      }
    }
    return seeded;
  }

  for (const embeddingsEnabled of [true, false]) {
    const mode = embeddingsEnabled ? "semantic" : "lexical";

    test(`${mode}: returns only what each type counts as published`, async () => {
      ctx = await seed(embeddingsEnabled);
      const results = await ctx.entityService.search({
        query: "Institutional memory",
        options: { publishedOnly: true },
      });
      expect(results.map((result) => result.entity.id).sort()).toEqual([
        "peer-approved",
        "post-published",
        "post-statusless",
      ]);
    });

    test(`${mode}: without publishedOnly, drafts are found`, async () => {
      ctx = await seed(embeddingsEnabled);
      const results = await ctx.entityService.search({
        query: "Institutional memory",
      });
      expect(results.map((result) => result.entity.id)).toContain("post-draft");
    });
  }

  test("a published-only view intersects explicit status filters for lists and counts", async () => {
    ctx = await seed(false);
    const published = scopeEntityReads(ctx.entityService, {
      publishedOnly: true,
      visibilityScope: "public",
    });
    const preview = scopeEntityReads(ctx.entityService, {
      publishedOnly: false,
      visibilityScope: "public",
    });
    for (const row of rows.filter((row) => row.status !== undefined)) {
      const request = {
        entityType: row.entityType,
        options: {
          publishedOnly: false,
          filter: { metadata: { status: row.status } },
        },
      };
      const expected =
        row.status === "published" || row.status === "approved" ? [row.id] : [];
      expect(
        (await published.listEntities(request)).map((entity) => entity.id),
      ).toEqual(expected);
      expect(await published.countEntities(request)).toBe(expected.length);
      // An unbounded preview retains explicit lifecycle filtering.
      expect(
        (await preview.listEntities(request)).map((entity) => entity.id),
      ).toEqual([row.id]);
      expect(await preview.countEntities(request)).toBe(1);
      expect(request.options.publishedOnly).toBe(false);
    }
  });

  test("get: finds a published entity and hides a draft", async () => {
    const seeded = await seed(true);
    ctx = seeded;
    const read = (entityType: string, id: string): Promise<unknown> =>
      seeded.entityService.getEntity({ entityType, id, publishedOnly: true });
    expect(await read("post", "post-published")).not.toBeNull();
    expect(await read("post", "post-statusless")).not.toBeNull();
    expect(await read("post", "post-draft")).toBeNull();
    expect(await read("peer", "peer-approved")).not.toBeNull();
    expect(await read("peer", "peer-statusless")).toBeNull();
    // Without the flag a draft is still readable, as for the owner.
    expect(
      await seeded.entityService.getEntity({
        entityType: "post",
        id: "post-draft",
      }),
    ).not.toBeNull();
  });
});
