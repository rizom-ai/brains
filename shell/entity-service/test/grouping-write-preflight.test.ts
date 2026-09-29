import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { setupEntityService } from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

async function fixture(): ReturnType<typeof setupEntityService> {
  return setupEntityService(
    [{ name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter }],
    { embeddingsEnabled: false },
  );
}

test("database-backed grouping refresh completes before native create/update transactions", async () => {
  const ctx = await fixture();
  const { entityService: service, entityRegistry: registry } = ctx;
  let reads = 0;
  registry.registerGroupingSource({
    entityType: "test",
    ensureCurrent: async () => {
      await service.getEntityRaw({ entityType: "test", id: "definitions" });
      reads++;
    },
  });
  try {
    await service.createEntity({
      entity: {
        entityType: "test",
        id: "entry",
        content: "Original",
        metadata: {},
      },
    });
    const original = await service.getEntityRaw({
      entityType: "test",
      id: "entry",
    });
    if (!original) throw new Error("Missing original entity");
    await service.updateEntity({ entity: { ...original, content: "Updated" } });
    // The no-op authority-transfer transaction has the same preflight contract.
    const updated = await service.getEntityRaw({
      entityType: "test",
      id: "entry",
    });
    if (!updated) throw new Error("Missing updated entity");
    await service.updateEntity({ entity: updated });
    expect(updated.content).toBe("Updated");
    expect(reads).toBeGreaterThanOrEqual(3);
  } finally {
    await ctx.cleanup();
  }
});

test("grouping refresh retains writer admission through transaction completion", async () => {
  const ctx = await fixture();
  const { entityService: service, entityRegistry: registry } = ctx;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const events: string[] = [];
  let prepared = false;
  registry.registerPersistValidator("test", async () => {
    prepared = true;
  });
  registry.registerGroupingSource({
    entityType: "test",
    ensureCurrent: async () => {
      await service.getEntityRaw({ entityType: "test", id: "definitions" });
      if (prepared) {
        prepared = false;
        events.push("preflight");
        started.resolve();
        await release.promise;
      }
    },
  });
  const write = service.createEntity({
    entity: { entityType: "test", id: "entry", content: "Body", metadata: {} },
    options: {
      beforeWrite: async () => {
        events.push("write");
      },
    },
  });
  let competitor: Promise<void> | undefined;
  try {
    await started.promise;
    competitor = service
      .getProjectionStore()
      .runDatabaseOperation(async (db) => {
        await db.$client.execute("SELECT 1");
        events.push("competitor");
      });
    expect(events).toEqual(["preflight"]);
    release.resolve();
    await Promise.all([write, competitor]);
    expect(events).toEqual(["preflight", "write", "competitor"]);
  } finally {
    release.resolve();
    await Promise.allSettled([write, competitor]);
    await ctx.cleanup();
  }
});

test.each(["changed", "unavailable"] as const)(
  "grouping policy %s after preparation refuses persistence without poisoning writer admission",
  async (failure) => {
    const ctx = await fixture();
    const { entityService: service, entityRegistry: registry } = ctx;
    let pending = false;
    let invalidate = true;
    registry.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        await service.getEntityRaw({ entityType: "test", id: "definitions" });
        if (!pending) return;
        pending = false;
        if (failure === "unavailable")
          throw new Error("Policy read unavailable");
        registry.replaceGroupings([]);
      },
    });
    registry.registerPersistValidator("test", async () => {
      if (invalidate) {
        pending = true;
        invalidate = false;
      }
    });
    const request = {
      entity: {
        entityType: "test",
        id: "entry",
        content: "Body",
        metadata: {},
      },
    };
    try {
      await rejects(
        service.createEntity(request),
        failure === "changed"
          ? /Grouping definitions changed/
          : /Policy read unavailable/,
      );
      expect(
        await service.getEntityRaw({ entityType: "test", id: "entry" }),
      ).toBeNull();
      expect(await service.listPendingEntityExports()).toEqual([]);
      expect(await service.getProjectionStore().listPendingInputs()).toEqual(
        [],
      );
      // A known refusal is not an uncertain acknowledgement: a new request
      // can prepare against the now-current policy and use the same owner.
      await service.createEntity(request);
      expect(
        await service.getEntityRaw({ entityType: "test", id: "entry" }),
      ).not.toBeNull();
    } finally {
      await ctx.cleanup();
    }
  },
);
