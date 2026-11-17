import { afterEach, describe, expect, it } from "bun:test";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import {
  LegacyBinaryLedger,
  legacyBinaryStore,
} from "../src/legacy-binary-ledger";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A runtime-state database two processes would share. */
async function sharedState(): Promise<() => RuntimeStateService> {
  const directory = await createTestDirectory();
  cleanups.push(() => directory.cleanup());
  const url = `file:${directory.dir}/runtime-state.db`;
  await migrateRuntimeState({ url });
  return () => {
    const service = RuntimeStateService.createFresh(
      { url },
      createSilentLogger(),
    );
    cleanups.push(() => service.close());
    return service;
  };
}

function ledger(
  store: ReturnType<typeof legacyBinaryStore>,
  now: () => Date = () => new Date("2026-11-15T03:00:00.000Z"),
): LegacyBinaryLedger {
  const created = new LegacyBinaryLedger({
    store,
    logger: createSilentLogger(),
    flushDelayMs: 60_000,
    now,
  });
  cleanups.push(() => created.dispose());
  return created;
}

describe("LegacyBinaryLedger", () => {
  it("counts uses by surface and type, with when they were first and last seen", async () => {
    const open = await sharedState();
    let now = new Date("2026-11-15T03:00:00.000Z");
    const counter = ledger(legacyBinaryStore(open()), () => now);

    counter.record({ method: "listEntities", entityType: "image" });
    now = new Date("2026-11-15T04:00:00.000Z");
    counter.record({ method: "listEntities", entityType: "image" });
    counter.record({ method: "getEntityRaw", entityType: "image" });

    expect(await counter.list()).toEqual([
      {
        method: "getEntityRaw",
        entityType: "image",
        count: 1,
        firstAt: "2026-11-15T04:00:00.000Z",
        lastAt: "2026-11-15T04:00:00.000Z",
      },
      {
        method: "listEntities",
        entityType: "image",
        count: 2,
        firstAt: "2026-11-15T03:00:00.000Z",
        lastAt: "2026-11-15T04:00:00.000Z",
      },
    ]);
  });

  it("adds up uses from every process sharing the state, across restarts", async () => {
    const open = await sharedState();
    const web = ledger(legacyBinaryStore(open()));
    const worker = ledger(legacyBinaryStore(open()));

    web.record({ method: "getEntityRaw", entityType: "image" });
    worker.record({ method: "getEntityRaw", entityType: "image" });
    worker.record({ method: "getEntityRaw", entityType: "image" });
    await Promise.all([web.flush(), worker.flush()]);

    const restarted = ledger(legacyBinaryStore(open()));
    expect(await restarted.list()).toEqual([
      expect.objectContaining({
        method: "getEntityRaw",
        entityType: "image",
        count: 3,
      }),
    ]);
  });

  it("keeps uses whose write failed for the next flush", async () => {
    const open = await sharedState();
    const state = open();
    const store = legacyBinaryStore(state);
    let refusals = 1;
    const flaky = ledger({
      ...store,
      get: (key) => store.get(key),
      compareAndSet: (key, expected, value) =>
        store.compareAndSet(key, expected, value),
      list: (options) => store.list(options),
      setIfNotExists: async (key, value) => {
        if (refusals-- > 0) throw new Error("database is locked");
        return store.setIfNotExists(key, value);
      },
    });
    const reader = ledger(store);

    flaky.record({ method: "listEntities", entityType: "image" });
    await flaky.flush();
    expect(await reader.list()).toEqual([]);

    await flaky.flush();
    expect(await reader.list()).toEqual([
      expect.objectContaining({ method: "listEntities", count: 1 }),
    ]);
  });
});
