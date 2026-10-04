import { afterEach, beforeEach, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import type { EntityWriteSnapshot } from "../src/types";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

let ctx: EntityServiceTestContext;
let client: Client;
let admitDelete: (() => Promise<void>) | undefined;
beforeEach(async () => {
  admitDelete = undefined;
  ctx = await setupEntityService(
    [{ name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter }],
    {
      mutationAdmission: {
        assertMutationAdmission: async (target) => {
          if (target.operation === "delete") await admitDelete?.();
        },
      },
    },
  );
  await ctx.entityService.createEntity({
    entity: {
      entityType: "test",
      id: "target",
      content: "Original",
      metadata: { clientId: "a" },
      visibility: "restricted",
    },
  });
  client = createClient({ url: ctx.dbConfig.url });
  const snapshot = await read();
  await ctx.entityService.storeEmbedding({
    entityType: "test",
    entityId: "target",
    contentHash: snapshot.entity.contentHash,
    embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
  });
});
afterEach(async () => {
  client.close();
  ctx.entityService.close();
  await ctx.cleanup();
});
async function read(): Promise<EntityWriteSnapshot> {
  const snapshot = await ctx.entityService.getEntityWriteSnapshot({
    entityType: "test",
    id: "target",
    visibilityScope: "restricted",
  });
  if (!snapshot) throw new Error("Missing fixture");
  return snapshot;
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return error;
  }
}
async function effects(): Promise<unknown> {
  return {
    exports: await ctx.entityService.listPendingEntityExports(),
    dirty: await ctx.entityService.getProjectionStore().listPendingInputs(),
    fts: (
      await client.execute(
        "SELECT content FROM entity_fts WHERE entity_id = 'target'",
      )
    ).rows,
    embeddings: await ctx.entityService.countEmbeddings(),
  };
}

test("full-revision deletion commits row, FTS and journals before removing its embedding", async () => {
  const snapshot = await read();
  const controller = new AbortController();
  expect(await ctx.entityService.countEmbeddings()).toBe(1);
  expect(
    await ctx.entityService.deleteEntity({
      entityType: "test",
      id: "target",
      options: {
        conditionalWrite: { expectedRevision: snapshot.revision },
        signal: controller.signal,
        beforeWrite: async (entity) => {
          expect(entity).toEqual(snapshot.entity);
          expect(await ctx.entityService.countEmbeddings()).toBe(1);
        },
      },
    }),
  ).toBe(true);
  expect(
    await ctx.entityService.getEntityWriteSnapshot({
      entityType: "test",
      id: "target",
      visibilityScope: "restricted",
    }),
  ).toBeNull();
  expect(await ctx.entityService.countEmbeddings()).toBe(0);
  expect(
    (
      await client.execute(
        "SELECT * FROM entity_fts WHERE entity_id = 'target'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await ctx.entityService.listPendingEntityExports()).some(
      (entry) => entry.operation === "delete",
    ),
  ).toBe(true);
  expect(
    await failure(
      ctx.entityService.deleteEntity({
        entityType: "test",
        id: "target",
        options: { conditionalWrite: { expectedRevision: snapshot.revision } },
      }),
    ),
  ).toBeInstanceOf(EntityWriteConflictError);
});

for (const change of ["metadata", "visibility"] as const)
  test(`a ${change}-only change blocks deletion without losing indexes or journals`, async () => {
    const snapshot = await read();
    await client.execute(
      change === "metadata"
        ? `UPDATE entities SET metadata = '{"clientId":"changed"}' WHERE id = 'target'`
        : `UPDATE entities SET visibility = 'public' WHERE id = 'target'`,
    );
    const before = await effects();
    expect((await read()).entity.contentHash).toBe(snapshot.entity.contentHash);
    expect(
      await failure(
        ctx.entityService.deleteEntity({
          entityType: "test",
          id: "target",
          options: {
            conditionalWrite: { expectedRevision: snapshot.revision },
          },
        }),
      ),
    ).toBeInstanceOf(EntityWriteConflictError);
    expect(await effects()).toEqual(before);
    expect(await read()).not.toBeNull();
  });

test("rechecks the full revision inside the transaction after admission yields", async () => {
  const snapshot = await read();
  const before = await effects();
  let guards = 0;
  admitDelete = async (): Promise<void> => {
    await client.execute(
      `UPDATE entities SET metadata = '{"clientId":"concurrent"}' WHERE id = 'target'`,
    );
  };
  const error = await failure(
    ctx.entityService.deleteEntity({
      entityType: "test",
      id: "target",
      options: {
        conditionalWrite: { expectedRevision: snapshot.revision },
        beforeWrite: async () => {
          guards++;
        },
      },
    }),
  );
  expect(error).toBeInstanceOf(EntityWriteConflictError);
  expect(guards).toBe(0);
  expect((await read()).entity.metadata["clientId"]).toBe("concurrent");
  expect(await effects()).toEqual(before);
});

for (const failure of ["guard", "cancel", "late-export"] as const)
  test(`${failure} failure rolls back deletion and leaves its embedding`, async () => {
    const snapshot = await read();
    const before = await effects();
    const controller = new AbortController();
    if (failure === "late-export")
      await client.execute(
        "CREATE TRIGGER reject_delete_export BEFORE INSERT ON entity_export_intents BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END",
      );
    let failed = false;
    try {
      await ctx.entityService.deleteEntity({
        entityType: "test",
        id: "target",
        options: {
          conditionalWrite: { expectedRevision: snapshot.revision },
          signal: controller.signal,
          beforeWrite: async () => {
            if (failure === "guard") throw new Error("Policy changed");
            if (failure === "cancel") controller.abort();
          },
        },
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await read()).toEqual(snapshot);
    expect(await effects()).toEqual(before);
  });
