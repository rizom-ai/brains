import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { createSilentLogger } from "@brains/test-utils";
import { EntityService } from "../src/entityService";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import type { EntityWriteSnapshot } from "../src/types";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { mockEmbeddingService } from "./helpers/mock-services";

const input = {
  id: "chapter",
  entityType: "test",
  content: "Original",
  metadata: { clientId: "a" },
};
const createCondition = {
  operationId: "create-chapter",
  expectedRevision: null,
};

describe("atomic entity writes and receipts (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
    await ctx.entityService.initialize();
    client = createClient({ url: ctx.dbConfig.url });
  });
  afterEach(async () => {
    client.close();
    ctx.entityService.close();
    await ctx.cleanup();
  });

  async function snapshot(): Promise<EntityWriteSnapshot> {
    const result = await ctx.entityService.getEntityWriteSnapshot({
      entityType: "test",
      id: "chapter",
      visibilityScope: "restricted",
    });
    if (!result) throw new Error("Missing test entity");
    return result;
  }

  test("creates once, records its receipt, and rejects a competing create", async () => {
    await ctx.entityService.createEntity({
      entity: input,
      options: { conditionalWrite: createCondition },
    });
    const first = await snapshot();
    expect(
      await ctx.entityService.getEntityWriteReceipt(
        createCondition.operationId,
      ),
    ).toEqual({ ...createCondition, entityType: "test", entityId: "chapter" });
    const replay = await ctx.entityService.createEntity({
      entity: input,
      options: { conditionalWrite: createCondition },
    });
    expect(replay.skipped).toBe(true);
    expect((await snapshot()).revision).toBe(first.revision);
    expect(
      ctx.entityService.createEntity({
        entity: input,
        options: {
          conditionalWrite: { ...createCondition, operationId: "competitor" },
        },
      }),
    ).rejects.toBeInstanceOf(EntityWriteConflictError);
    expect(
      await ctx.entityService.getEntityWriteReceipt("competitor"),
    ).toBeNull();
  });

  test.each(["create", "replace"] as const)(
    "cancellation during %s validation leaves entity and receipt unchanged",
    async (mode) => {
      if (mode === "replace")
        await ctx.entityService.createEntity({ entity: input });
      const before = mode === "replace" ? await snapshot() : null;
      const controller = new AbortController();
      const reason = new Error("cancelled validation");
      ctx.entityRegistry.registerPersistValidator("test", async () => {
        controller.abort(reason);
      });
      const options = {
        signal: controller.signal,
        conditionalWrite: {
          operationId: "cancelled",
          expectedRevision: before?.revision ?? null,
        },
      };
      const mutation = before
        ? ctx.entityService.updateEntity({
            entity: { ...before.entity, content: "Must not write" },
            options,
          })
        : ctx.entityService.createEntity({ entity: input, options });
      expect(mutation).rejects.toBe(reason);
      expect(
        await ctx.entityService.getEntityWriteReceipt("cancelled"),
      ).toBeNull();
      expect(
        await ctx.entityService.getEntityWriteSnapshot({
          entityType: "test",
          id: "chapter",
        }),
      ).toEqual(before);
    },
  );

  test("replaces exactly the observed revision and changes the token", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const observed = await snapshot();
    const condition = {
      operationId: "replace",
      expectedRevision: observed.revision,
    };
    await ctx.entityService.updateEntity({
      entity: { ...observed.entity, content: "Generated" },
      options: { conditionalWrite: condition },
    });
    const after = await snapshot();
    expect(after.entity.content).toBe("Generated");
    expect(after.revision).not.toBe(observed.revision);
    expect(await ctx.entityService.getEntityWriteReceipt("replace")).toEqual({
      ...condition,
      entityType: "test",
      entityId: "chapter",
    });
  });

  test.each(["body", "metadata", "visibility", "delete"] as const)(
    "rejects intervening %s changes",
    async (change) => {
      await ctx.entityService.createEntity({ entity: input });
      const observed = await snapshot();
      if (change === "body") {
        await ctx.entityService.updateEntity({
          entity: { ...observed.entity, content: "Editor" },
        });
      } else if (change === "metadata") {
        await ctx.entityService.updateEntity({
          entity: { ...observed.entity, metadata: { clientId: "b" } },
        });
        expect((await snapshot()).entity.contentHash).toBe(
          observed.entity.contentHash,
        );
      } else if (change === "visibility") {
        await ctx.entityService.updateEntity({
          entity: { ...observed.entity, visibility: "restricted" },
        });
      } else {
        await ctx.entityService.deleteEntity({
          entityType: "test",
          id: "chapter",
        });
      }
      const before = await ctx.entityService.getEntityWriteSnapshot({
        entityType: "test",
        id: "chapter",
        visibilityScope: "restricted",
      });
      expect(
        ctx.entityService.updateEntity({
          entity: { ...observed.entity, content: "Stale generation" },
          options: {
            conditionalWrite: {
              operationId: "stale",
              expectedRevision: observed.revision,
            },
          },
        }),
      ).rejects.toBeInstanceOf(EntityWriteConflictError);
      expect(await ctx.entityService.getEntityWriteReceipt("stale")).toBeNull();
      expect(
        await ctx.entityService.getEntityWriteSnapshot({
          entityType: "test",
          id: "chapter",
          visibilityScope: "restricted",
        }),
      ).toEqual(before);
    },
  );

  test.each(["revert", "recreate"] as const)(
    "a %s to the observed state keeps its revision and admits the replacement",
    async (change) => {
      await ctx.entityService.createEntity({ entity: input });
      const observed = await snapshot();
      if (change === "revert") {
        await ctx.entityService.updateEntity({
          entity: { ...observed.entity, content: "Editor" },
        });
        await ctx.entityService.updateEntity({ entity: observed.entity });
      } else {
        await ctx.entityService.deleteEntity({
          entityType: "test",
          id: "chapter",
        });
        await ctx.entityService.createEntity({ entity: observed.entity });
      }
      // The revision is derived from content, metadata, and visibility, so an
      // identical state is the state that was authorized for replacement.
      expect((await snapshot()).revision).toBe(observed.revision);
      await ctx.entityService.updateEntity({
        entity: { ...observed.entity, content: "Generated" },
        options: {
          conditionalWrite: {
            operationId: `after-${change}`,
            expectedRevision: observed.revision,
          },
        },
      });
      expect((await snapshot()).entity.content).toBe("Generated");
    },
  );

  test("identical conditional writes are idempotent: both commit receipts and the revision stays", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const observed = await snapshot();
    const results = await Promise.allSettled(
      ["one", "two"].map((operationId) =>
        ctx.entityService.updateEntity({
          entity: observed.entity,
          options: {
            conditionalWrite: {
              operationId,
              expectedRevision: observed.revision,
            },
          },
        }),
      ),
    );
    // Writing the observed state back leaves the derived revision unchanged,
    // so a second identical writer still matches its precondition. Distinct
    // content is the case that must lose; see the independent-connections test.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const receipts = await Promise.all(
      ["one", "two"].map((id) => ctx.entityService.getEntityWriteReceipt(id)),
    );
    expect(receipts.filter(Boolean)).toHaveLength(2);
    expect((await snapshot()).revision).toBe(observed.revision);
  });

  test("independent connections cannot replace the same observed revision", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const observed = await snapshot();
    const other = EntityService.createFresh({
      dbConfig: ctx.dbConfig,
      embeddingDbConfig: ctx.embeddingDbConfig,
      entityRegistry: ctx.entityRegistry,
      embeddingService: mockEmbeddingService,
      jobQueueService: ctx.jobQueueService,
      logger: createSilentLogger(),
    });
    try {
      await other.initialize();
      const results = await Promise.allSettled(
        [ctx.entityService, other].map((service, index) =>
          service.updateEntity({
            entity: { ...observed.entity, content: `writer-${index}` },
            options: {
              conditionalWrite: {
                operationId: `writer-${index}`,
                expectedRevision: observed.revision,
              },
            },
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const receipts = await Promise.all(
        ["writer-0", "writer-1"].map((id) =>
          ctx.entityService.getEntityWriteReceipt(id),
        ),
      );
      expect(receipts.filter(Boolean)).toHaveLength(1);
      const winner = receipts.find((receipt) => receipt !== null);
      if (!winner) throw new Error("Expected exactly one committed writer");
      expect((await snapshot()).entity.content).toBe(winner.operationId);
      // A connection may first lose with SQLITE_BUSY; retrying must conflict,
      // not adopt the winner's revision and overwrite it.
      const loser = results.findIndex((result) => result.status === "rejected");
      expect(
        ctx.entityService.updateEntity({
          entity: { ...observed.entity, content: "Retry must not overwrite" },
          options: {
            conditionalWrite: {
              operationId: `writer-${loser}`,
              expectedRevision: observed.revision,
            },
          },
        }),
      ).rejects.toBeInstanceOf(EntityWriteConflictError);
    } finally {
      other.close();
    }
    // Two local libsql connections can wait out SQLite's 5s busy timeout.
  }, 15_000);

  test("concurrent retries commit one write and one receipt", async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        ctx.entityService.createEntity({
          entity: input,
          options: { conditionalWrite: createCondition },
        }),
      ),
    );
    expect(results.filter((result) => !result.skipped)).toHaveLength(1);
    expect(
      await ctx.entityService.getProjectionStore().listPendingInputs(),
    ).toHaveLength(1);
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledTimes(1);
  });

  test.each(["create", "replace"] as const)(
    "rolls back %s, its revision, receipt, FTS and export on a late failure",
    async (mode) => {
      if (mode === "replace")
        await ctx.entityService.createEntity({ entity: input });
      const before = mode === "replace" ? await snapshot() : null;
      const exportsBefore = await ctx.entityService.listPendingEntityExports();
      const dirtyBefore = await ctx.entityService
        .getProjectionStore()
        .listPendingInputs();
      await client.execute(
        `CREATE TRIGGER reject_receipt_test BEFORE INSERT ON entity_export_intents BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
      );
      const conditionalWrite = {
        operationId: "rollback",
        expectedRevision: before?.revision ?? null,
      };
      const mutation = before
        ? ctx.entityService.updateEntity({
            entity: { ...before.entity, content: "Rollback" },
            options: { conditionalWrite },
          })
        : ctx.entityService.createEntity({
            entity: input,
            options: { conditionalWrite },
          });
      await mutation.then(
        () => {
          throw new Error("Expected injected transaction failure");
        },
        (error: unknown) => {
          expect(error).not.toBeInstanceOf(EntityWriteConflictError);
          expect(error).toMatchObject({
            cause: { message: expect.stringContaining("injected failure") },
          });
        },
      );
      expect(
        await ctx.entityService.getEntityWriteReceipt("rollback"),
      ).toBeNull();
      expect(
        await ctx.entityService.getEntityWriteSnapshot({
          entityType: "test",
          id: "chapter",
        }),
      ).toEqual(before);
      expect(await ctx.entityService.listPendingEntityExports()).toEqual(
        exportsBefore,
      );
      expect(
        await ctx.entityService.getProjectionStore().listPendingInputs(),
      ).toEqual(dirtyBefore);
      const fts = await client.execute(
        "SELECT content FROM entity_fts WHERE entity_id = 'chapter'",
      );
      expect(fts.rows.map((row) => row["content"])).toEqual(
        before ? ["Original"] : [],
      );
    },
  );

  test.each(["edit", "delete"] as const)(
    "recovers after acknowledgement loss and restart without undoing a later %s",
    async (change) => {
      const enqueue = spyOn(
        ctx.jobQueueService,
        "enqueue",
      ).mockRejectedValueOnce(new Error("acknowledgement lost"));
      expect(
        ctx.entityService.createEntity({
          entity: input,
          options: { conditionalWrite: createCondition },
        }),
      ).rejects.toThrow("acknowledgement lost");
      expect(
        await ctx.entityService.getEntityWriteReceipt(
          createCondition.operationId,
        ),
      ).not.toBeNull();
      if (change === "edit") {
        const saved = await snapshot();
        await ctx.entityService.updateEntity({
          entity: { ...saved.entity, content: "Editor wins" },
        });
      } else {
        await ctx.entityService.deleteEntity({
          entityType: "test",
          id: "chapter",
        });
      }
      ctx.entityService.close();
      ctx.entityService = EntityService.createFresh({
        dbConfig: ctx.dbConfig,
        embeddingDbConfig: ctx.embeddingDbConfig,
        entityRegistry: ctx.entityRegistry,
        embeddingService: mockEmbeddingService,
        jobQueueService: ctx.jobQueueService,
        logger: createSilentLogger(),
      });
      enqueue.mockClear();
      expect(
        (
          await ctx.entityService.createEntity({
            entity: input,
            options: { conditionalWrite: createCondition },
          })
        ).skipped,
      ).toBe(true);
      expect(enqueue).not.toHaveBeenCalled();
      expect(
        (
          await ctx.entityService.getEntityRaw({
            entityType: "test",
            id: "chapter",
          })
        )?.content ?? null,
      ).toBe(change === "edit" ? "Editor wins" : null);
    },
  );

  test("revisions derive from the stored row, so direct SQL writers are detected and snapshots stay visibility scoped", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const before = await snapshot();
    await client.execute(
      "UPDATE entities SET metadata = '{\"clientId\":\"sql\"}' WHERE id = 'chapter'",
    );
    expect((await snapshot()).revision).not.toBe(before.revision);
    await client.execute(
      "UPDATE entities SET visibility = 'restricted' WHERE id = 'chapter'",
    );
    expect(
      await ctx.entityService.getEntityWriteSnapshot({
        entityType: "test",
        id: "chapter",
      }),
    ).toBeNull();
    expect(
      await ctx.entityService.getEntityWriteSnapshot({
        entityType: "test",
        id: "chapter",
        visibilityScope: "shared",
      }),
    ).toBeNull();
    expect(
      ctx.entityService.updateEntity({
        entity: { ...before.entity, content: "Stale generation" },
        options: {
          conditionalWrite: {
            operationId: "after-sql-edit",
            expectedRevision: before.revision,
          },
        },
      }),
    ).rejects.toBeInstanceOf(EntityWriteConflictError);
  });

  test("the entities table carries no revision triggers or side tables", async () => {
    const triggers = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'entities'",
    );
    expect(triggers.rows).toEqual([]);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'entity_write_%'",
    );
    expect(tables.rows.map((row) => row["name"])).toEqual([
      "entity_write_receipts",
    ]);
  });

  test("rejects operation ID reuse and conditional deduplication", async () => {
    await ctx.entityService.createEntity({
      entity: input,
      options: { conditionalWrite: createCondition },
    });
    expect(
      ctx.entityService.createEntity({
        entity: { ...input, id: "different" },
        options: { conditionalWrite: createCondition },
      }),
    ).rejects.toThrow("reused");
    expect(
      ctx.entityService.createEntity({
        entity: input,
        options: { conditionalWrite: createCondition, deduplicateId: true },
      }),
    ).rejects.toThrow("no deduplication");
  });
});
