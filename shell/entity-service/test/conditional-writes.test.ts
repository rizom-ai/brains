import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { Client } from "@libsql/client";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { handleEntityRpcRequest } from "../src/entity-rpc";
import type { MarkProjectionDirtyInput } from "../src/projection-store";
import type { EntityTransaction } from "../src/projection-transaction-runner";
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
const createCondition = { expectedRevision: null };

describe("atomic conditional entity writes (owned Turso)", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
    await ctx.entityService.initialize();
    client = await ctx.entityService
      .getProjectionStore()
      .runDatabaseOperation(async (db) => db.$client);
  });
  afterEach(async () => {
    await ctx.entityService.waitForJobOutboxIdle();
    await ctx.entityService.closeAsync();
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

  test("creates once and rejects any later create-if-absent", async () => {
    await ctx.entityService.createEntity({
      entity: input,
      options: { conditionalWrite: createCondition },
    });
    const first = await snapshot();
    await assert.rejects(
      ctx.entityService.createEntity({
        entity: input,
        options: { conditionalWrite: createCondition },
      }),
      EntityWriteConflictError,
    );
    expect((await snapshot()).revision).toBe(first.revision);
  });

  test.each(["create", "replace"] as const)(
    "cancellation during %s validation leaves the entity unchanged",
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
        conditionalWrite: { expectedRevision: before?.revision ?? null },
      };
      const mutation = before
        ? ctx.entityService.updateEntity({
            entity: { ...before.entity, content: "Must not write" },
            options,
          })
        : ctx.entityService.createEntity({ entity: input, options });
      await assert.rejects(mutation, (error: unknown) => error === reason);
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
    await ctx.entityService.updateEntity({
      entity: { ...observed.entity, content: "Generated" },
      options: { conditionalWrite: { expectedRevision: observed.revision } },
    });
    const after = await snapshot();
    expect(after.entity.content).toBe("Generated");
    expect(after.revision).not.toBe(observed.revision);
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
      await assert.rejects(
        ctx.entityService.updateEntity({
          entity: { ...observed.entity, content: "Stale generation" },
          options: {
            conditionalWrite: { expectedRevision: observed.revision },
          },
        }),
        EntityWriteConflictError,
      );
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
          conditionalWrite: { expectedRevision: observed.revision },
        },
      });
      expect((await snapshot()).entity.content).toBe("Generated");
    },
  );

  test("identical conditional writes are idempotent: both commit and the revision stays", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const observed = await snapshot();
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        ctx.entityService.updateEntity({
          entity: observed.entity,
          options: {
            conditionalWrite: { expectedRevision: observed.revision },
          },
        }),
      ),
    );
    // Writing the observed state back leaves the derived revision unchanged,
    // so a second identical writer still matches its precondition. Distinct
    // content is the case that must lose; see the independent-callers test.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await snapshot()).revision).toBe(observed.revision);
  });

  test("independent RPC callers cannot replace the same observed revision", async () => {
    await ctx.entityService.createEntity({ entity: input });
    const observed = await snapshot();
    // Both callers share the one database owner; neither opens a connection.
    const results = await Promise.allSettled(
      [0, 1].map((index) =>
        handleEntityRpcRequest(ctx.entityService, {
          operation: "updateEntity",
          request: {
            entity: { ...observed.entity, content: `writer-${index}` },
            options: {
              conditionalWrite: { expectedRevision: observed.revision },
            },
          },
        }),
      ),
    );
    const winner = results.findIndex((result) => result.status === "fulfilled");
    const loser = results.find((result) => result.status === "rejected");
    expect(winner).not.toBe(-1);
    expect(loser?.reason).toBeInstanceOf(EntityWriteConflictError);
    expect((await snapshot()).entity.content).toBe(`writer-${winner}`);
    // An explicit stale retry must conflict, never adopt the winner's revision.
    await assert.rejects(
      ctx.entityService.updateEntity({
        entity: { ...observed.entity, content: "Retry must not overwrite" },
        options: { conditionalWrite: { expectedRevision: observed.revision } },
      }),
      EntityWriteConflictError,
    );
  });

  test("concurrent create-if-absent attempts commit exactly one write", async () => {
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        ctx.entityService.createEntity({
          entity: input,
          options: { conditionalWrite: createCondition },
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(EntityWriteConflictError);
    expect(
      await ctx.entityService.getProjectionStore().listPendingInputs(),
    ).toHaveLength(1);
    await ctx.entityService.waitForJobOutboxIdle();
    expect(ctx.jobQueueService.enqueue).toHaveBeenCalledTimes(1);
  });

  test.each(["create", "replace"] as const)(
    "rolls back %s, its revision, search text, outbox and export on a late failure",
    async (mode) => {
      if (mode === "replace")
        await ctx.entityService.createEntity({ entity: input });
      const before = mode === "replace" ? await snapshot() : null;
      const exportsBefore = await ctx.entityService.listPendingEntityExports();
      const dirtyBefore = await ctx.entityService
        .getProjectionStore()
        .listPendingInputs();
      await ctx.entityService.waitForJobOutboxIdle();
      const searchBefore = await client.execute(
        "SELECT search_text FROM entities WHERE id = 'chapter'",
      );
      const outboxBefore = await ctx.entityService.getPendingJobOutboxCount();
      const store = ctx.entityService.getProjectionStore();
      const original = store.withDirtyInput.bind(store);
      const injected = spyOn(store, "withDirtyInput").mockImplementation(
        <T>(
          dirtyInput: MarkProjectionDirtyInput,
          mutation: (transaction: EntityTransaction) => Promise<T>,
        ): Promise<T> =>
          original(dirtyInput, async (transaction) => {
            const result = await mutation(transaction);
            // Real SQL failure after entity, embedding intent and export writes,
            // inside the SAME native transaction; no unsupported SQLite trigger.
            await transaction.run(sql`SELECT * FROM injected_failure`);
            return result;
          }),
      );
      const conditionalWrite = { expectedRevision: before?.revision ?? null };
      const mutation = before
        ? ctx.entityService.updateEntity({
            entity: { ...before.entity, content: "Rollback" },
            options: { conditionalWrite },
          })
        : ctx.entityService.createEntity({
            entity: input,
            options: { conditionalWrite },
          });
      await mutation
        .then(
          () => {
            throw new Error("Expected injected transaction failure");
          },
          (error: unknown) => {
            expect(error).not.toBeInstanceOf(EntityWriteConflictError);
            expect(error).toMatchObject({
              cause: { message: expect.stringContaining("injected_failure") },
            });
          },
        )
        .finally(() => injected.mockRestore());
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
      expect(
        (
          await client.execute(
            "SELECT search_text FROM entities WHERE id = 'chapter'",
          )
        ).rows,
      ).toEqual(searchBefore.rows);
      expect(await ctx.entityService.getPendingJobOutboxCount()).toBe(
        outboxBefore,
      );
    },
  );

  test("a retry after acknowledgement loss and restart conflicts instead of undoing a later edit", async () => {
    const enqueue = spyOn(ctx.jobQueueService, "enqueue");
    // Fault at the RPC acknowledgement boundary, not at asynchronous job delivery.
    // The owner commits normally; the caller never receives its successful reply.
    const lostReply = handleEntityRpcRequest(ctx.entityService, {
      operation: "createEntity",
      request: {
        entity: input,
        options: { conditionalWrite: createCondition },
      },
    }).then(() => {
      throw new Error("acknowledgement lost");
    });
    await assert.rejects(lostReply, /acknowledgement lost/);
    const saved = await snapshot();
    await ctx.entityService.updateEntity({
      entity: { ...saved.entity, content: "Editor wins" },
    });
    await ctx.entityService.waitForJobOutboxIdle();
    await ctx.entityService.closeAsync();
    ctx.entityService = EntityService.createFresh({
      dbConfig: ctx.dbConfig,
      entityRegistry: ctx.entityRegistry,
      embeddingService: mockEmbeddingService,
      jobQueueService: ctx.jobQueueService,
      logger: createSilentLogger(),
    });
    await ctx.entityService.initialize();
    await ctx.entityService.waitForJobOutboxIdle();
    enqueue.mockClear();
    await assert.rejects(
      ctx.entityService.createEntity({
        entity: input,
        options: { conditionalWrite: createCondition },
      }),
      EntityWriteConflictError,
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      (
        await ctx.entityService.getEntityRaw({
          entityType: "test",
          id: "chapter",
        })
      )?.content,
    ).toBe("Editor wins");
  });

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
    await assert.rejects(
      ctx.entityService.updateEntity({
        entity: { ...before.entity, content: "Stale generation" },
        options: { conditionalWrite: { expectedRevision: before.revision } },
      }),
      EntityWriteConflictError,
    );
  });

  test("the entities table carries no revision triggers or side tables", async () => {
    const triggers = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'entities'",
    );
    expect(triggers.rows).toEqual([]);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'entity_write_%'",
    );
    expect(tables.rows).toEqual([]);
  });

  test("rejects conditional deduplication", async () => {
    await assert.rejects(
      ctx.entityService.createEntity({
        entity: input,
        options: { conditionalWrite: createCondition, deduplicateId: true },
      }),
      /no deduplication/,
    );
  });
});
