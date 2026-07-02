import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  noteSchema,
  noteAdapter,
  imageSchema,
  imageAdapter,
  type ImageEntity,
  createNoteInput,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

describe("EntityTypeConfig embeddable flag", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
      {
        name: "image",
        schema: imageSchema,
        adapter: imageAdapter,
        config: { embeddable: false },
      },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("createEntity queues embedding job for embeddable entity types", async () => {
    const noteData = {
      entityType: "note" as const,
      title: "Test Note",
      content: "Some text content",
      tags: [],
      metadata: {},
    };

    await ctx.entityService.createEntity({ entity: noteData });

    expect(ctx.jobQueueService.enqueue).toHaveBeenCalled();
  });

  test("embedding jobs use stable deduplication keys", async () => {
    const noteData = {
      id: "dedupe-note",
      entityType: "note" as const,
      title: "Test Note",
      content: "Some text content",
      tags: [],
      metadata: {},
    };

    await ctx.entityService.createEntity({ entity: noteData });

    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shell:embedding",
        options: expect.objectContaining({
          deduplication: "coalesce",
          deduplicationKey: expect.stringMatching(
            /^embedding:note:dedupe-note:[a-f0-9]{64}$/,
          ),
        }),
      }),
    );
  });

  test("embedding jobs are silent and carry no fake rootJobId", async () => {
    const noteData = {
      id: "silent-note",
      entityType: "note" as const,
      title: "Test Note",
      content: "Some text content",
      tags: [],
      metadata: {},
    };

    await ctx.entityService.createEntity({ entity: noteData });

    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shell:embedding",
        options: expect.objectContaining({
          metadata: expect.objectContaining({ silent: true }),
        }),
      }),
    );
    // No synthetic rootJobId — that would make the monitor treat the job as
    // a batch child and do guaranteed-miss batch lookups
    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ rootJobId: expect.anything() }),
      }),
    );
  });

  test("createEntity skips embedding job when embeddable is false", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await ctx.entityService.createEntity({ entity: imageData });

    const entity = await ctx.entityService.getEntity<ImageEntity>({
      entityType: "image",
      id: result.entityId,
    });
    expect(entity).not.toBeNull();

    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("updateEntity skips embedding job when embeddable is false", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const { entityId } = await ctx.entityService.createEntity({
      entity: imageData,
    });

    const entity = await ctx.entityService.getEntity<ImageEntity>({
      entityType: "image",
      id: entityId,
    });
    expect(entity).not.toBeNull();
    if (!entity) throw new Error("Entity should exist");

    await ctx.entityService.updateEntity({
      entity: {
        ...entity,
        content: "data:image/png;base64,UPDATED",
      },
    });

    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("createEntity returns empty jobId when embedding is skipped", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await ctx.entityService.createEntity({ entity: imageData });

    expect(result.entityId).toBeDefined();
    expect(result.jobId).toBe("");
  });

  test("backfillMissingEmbeddings queues missing embeddable entity embeddings", async () => {
    await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Missing Embedding Note",
          content: "Needs an embedding",
          tags: [],
        },
        "missing-embedding-note",
      ),
    });

    const result = await ctx.entityService.backfillMissingEmbeddings();

    expect(result.queued).toBe(1);
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledTimes(2);
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shell:embedding",
        data: expect.objectContaining({
          id: "missing-embedding-note",
          entityType: "note",
          operation: "update",
        }),
        options: expect.objectContaining({
          deduplication: "coalesce",
          deduplicationKey: expect.stringMatching(
            /^embedding:note:missing-embedding-note:[a-f0-9]{64}$/,
          ),
        }),
      }),
    );
  });

  test("backfillMissingEmbeddings queues stale embeddings and skips current ones", async () => {
    await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Stale Embedding Note",
          content: "Needs a fresh embedding",
          tags: [],
        },
        "stale-embedding-note",
      ),
    });
    const staleEntity = await ctx.entityService.getEntity({
      entityType: "note",
      id: "stale-embedding-note",
    });
    if (!staleEntity) throw new Error("Expected stale test entity");
    await ctx.entityService.storeEmbedding({
      entityId: "stale-embedding-note",
      entityType: "note",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: "stale-hash",
    });

    await ctx.entityService.createEntity({
      entity: createNoteInput(
        {
          title: "Current Embedding Note",
          content: "Already has a current embedding",
          tags: [],
        },
        "current-embedding-note",
      ),
    });
    const currentEntity = await ctx.entityService.getEntity({
      entityType: "note",
      id: "current-embedding-note",
    });
    if (!currentEntity) throw new Error("Expected current test entity");
    await ctx.entityService.storeEmbedding({
      entityId: "current-embedding-note",
      entityType: "note",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: currentEntity.contentHash,
    });

    const result = await ctx.entityService.backfillMissingEmbeddings();

    expect(result.queued).toBe(1);
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledTimes(3);
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "stale-embedding-note",
          operation: "update",
        }),
      }),
    );
  });

  test("backfillMissingEmbeddings skips non-embeddable entity types", async () => {
    await ctx.entityService.createEntity({
      entity: {
        id: "non-embeddable-image",
        entityType: "image" as const,
        content:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        metadata: {},
      },
    });

    const result = await ctx.entityService.backfillMissingEmbeddings();

    expect(result.queued).toBe(0);
    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalled();
  });
});
