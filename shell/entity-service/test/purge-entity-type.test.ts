import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { EntityRegistry } from "../src/entityRegistry";
import { EntityService } from "../src/entityService";
import { MOCK_DIMENSIONS, mockEmbeddingService } from "./helpers/mock-services";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import {
  createNoteInput,
  noteAdapter,
  noteSchema,
  peerAdapter,
  peerSchema,
} from "./helpers/test-schemas";

// A type a brain no longer registers still has its rows, search index,
// embeddings and files from before. Purging deletes all of it.
describe("purging an entity type the brain no longer registers", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
      { name: "peer", schema: peerSchema, adapter: peerAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  /** The same databases, opened by a brain that registers notes only. */
  function reopenWithoutPeers(): EntityService {
    const logger = createSilentLogger();
    const entityRegistry = EntityRegistry.createFresh(logger);
    entityRegistry.registerEntityType("note", noteSchema, noteAdapter);
    return EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: createMockJobQueueService(),
      dbConfig: ctx.dbConfig,
      embeddingDbConfig: ctx.embeddingDbConfig,
    });
  }

  function indexedTypes(): unknown[] {
    const path = ctx.dbConfig.url.replace(/^file:/, "");
    const db = new Database(path, { readonly: true });
    const rows = db
      .query("SELECT entity_type FROM entity_fts ORDER BY entity_type")
      .all();
    db.close();
    return rows;
  }

  test("deletes its rows, index, embeddings and files, nothing else", async () => {
    for (const id of ["peer-a", "peer-b"]) {
      await ctx.entityService.createEntity({
        entity: {
          id,
          entityType: "peer",
          content: `Another brain's ${id}`,
          metadata: {},
        },
      });
      await ctx.entityService.storeEmbedding({
        entityId: id,
        entityType: "peer",
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        contentHash: "hash",
      });
    }
    await ctx.entityService.createEntity({
      entity: createNoteInput({ title: "Mine", content: "Own note", tags: [] }),
    });
    await ctx.entityService.acknowledgeEntityExports({
      intents: await ctx.entityService.listPendingEntityExports(),
    });

    const service = reopenWithoutPeers();
    expect(await service.purgeEntityType("peer")).toBe(2);

    expect(await service.getEntityCounts("restricted")).toEqual([
      { entityType: "note", count: 1 },
    ]);
    expect(indexedTypes()).toEqual([{ entity_type: "note" }]);
    expect(await service.countEmbeddings()).toBe(0);
    const pending = await service.listPendingEntityExports();
    expect(
      pending
        .map(({ entityType, entityId, operation }) => ({
          entityType,
          entityId,
          operation,
        }))
        .sort((a, b) => a.entityId.localeCompare(b.entityId)),
    ).toEqual([
      { entityType: "peer", entityId: "peer-a", operation: "delete" },
      { entityType: "peer", entityId: "peer-b", operation: "delete" },
    ]);
  });

  test("finds nothing when no rows of the type remain", async () => {
    expect(await reopenWithoutPeers().purgeEntityType("peer")).toBe(0);
  });

  test("refuses a type the brain still registers", async () => {
    expect(ctx.entityService.purgeEntityType("note")).rejects.toThrow(
      "note is a registered entity type",
    );
  });
});
