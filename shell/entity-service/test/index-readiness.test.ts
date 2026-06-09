import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  noteSchema,
  noteAdapter,
  createNoteInput,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

async function createCurrentEmbeddedNote(
  ctx: EntityServiceTestContext,
  id: string,
): Promise<void> {
  const result = await ctx.entityService.createEntity({
    entity: createNoteInput(
      {
        title: id,
        content: `Content for ${id}`,
        tags: [],
      },
      id,
    ),
  });
  const entity = await ctx.entityService.getEntity({ entityType: "note", id });
  if (!entity) throw new Error(`Expected entity ${id}`);
  await ctx.entityService.storeEmbedding({
    entityId: id,
    entityType: "note",
    embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
    contentHash: entity.contentHash,
  });
  await ctx.jobQueueService.complete(result.jobId, { entityId: id });
}

describe("EntityService index readiness", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("isIndexReady is false until awaitIndexReady observes a complete index", async () => {
    await createCurrentEmbeddedNote(ctx, "ready-note");

    expect(ctx.entityService.isIndexReady()).toBe(false);

    const status = await ctx.entityService.awaitIndexReady({
      timeoutMs: 50,
      intervalMs: 5,
    });

    expect(status.ready).toBe(true);
    expect(status.degraded).toBe(false);
    expect(status.missingEmbeddings).toBe(0);
    expect(status.staleEmbeddings).toBe(0);
    expect(ctx.entityService.isIndexReady()).toBe(true);
  });

  test("awaitIndexReady times out with diagnostics when embeddings are missing", async () => {
    await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Missing Embedding",
          content: "This entity has no embedding yet",
          tags: [],
        },
        "missing-index-note",
      ),
    });

    const status = await ctx.entityService.awaitIndexReady({
      timeoutMs: 10,
      intervalMs: 1,
    });

    expect(status.ready).toBe(false);
    expect(status.degraded).toBe(false);
    expect(status.missingEmbeddings).toBe(1);
    expect(status.staleEmbeddings).toBe(0);
    expect(ctx.entityService.isIndexReady()).toBe(false);
  });

  test("awaitIndexReady treats terminal embedding failures as ready-degraded", async () => {
    const result = await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Poison Embedding",
          content: "This entity failed embedding permanently",
          tags: [],
        },
        "poison-index-note",
      ),
      options: { maxRetries: 0 },
    });
    await ctx.jobQueueService.fail(
      result.jobId,
      new Error("embedding provider rejected content"),
    );

    const status = await ctx.entityService.awaitIndexReady({
      timeoutMs: 10,
      intervalMs: 1,
    });

    expect(status.ready).toBe(true);
    expect(status.degraded).toBe(true);
    expect(status.missingEmbeddings).toBe(0);
    expect(status.staleEmbeddings).toBe(0);
    expect(status.failedEmbeddings).toBe(1);
    expect(ctx.entityService.isIndexReady()).toBe(true);
  });

  test("awaitIndexReady reports stale embeddings separately from missing ones", async () => {
    await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Stale Embedding",
          content: "This entity has an old embedding",
          tags: [],
        },
        "stale-index-note",
      ),
    });
    await ctx.entityService.storeEmbedding({
      entityId: "stale-index-note",
      entityType: "note",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: "stale-hash",
    });

    const status = await ctx.entityService.awaitIndexReady({
      timeoutMs: 10,
      intervalMs: 1,
    });

    expect(status.ready).toBe(false);
    expect(status.missingEmbeddings).toBe(0);
    expect(status.staleEmbeddings).toBe(1);
  });
});
