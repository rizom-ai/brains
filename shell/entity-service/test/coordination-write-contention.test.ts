import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";
import { applySqlitePragmas } from "@brains/db";
import { createEntityDatabase } from "../src/db";
import { EntityExportStore } from "../src/entity-export-store";
import { ProjectionStore } from "../src/projection-store";
import { createTestEntityDatabase } from "./helpers/test-entity-db";

describe("coordination plain-write contention", () => {
  let database: Awaited<ReturnType<typeof createTestEntityDatabase>>;
  let holder: ReturnType<typeof createEntityDatabase>;
  let contender: ReturnType<typeof createEntityDatabase>;
  let store: ProjectionStore;

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    holder = createEntityDatabase(database.config);
    contender = createEntityDatabase(database.config);
    await applySqlitePragmas(holder.client, holder.url);
    await applySqlitePragmas(contender.client, contender.url);
    await holder.client.execute(
      "CREATE TABLE contention_probe (id INTEGER PRIMARY KEY)",
    );
    store = new ProjectionStore(contender.db);
  });

  afterEach(async () => {
    contender.client.close();
    holder.client.close();
    await database.cleanup();
  });

  for (const replaceRevision of [false, true]) {
    it(`retries export acknowledgement while preserving its revision fence (replacement=${replaceRevision})`, async () => {
      const exports = new EntityExportStore(contender.db);
      await contender.db.transaction(async (tx) => {
        await exports.record(tx, {
          entityType: "note",
          entityId: "note-export",
          operation: "upsert",
        });
      });
      const intent = (await exports.list())[0];
      if (!intent) throw new Error("Missing export fixture");
      const held = await holder.client.transaction("write");
      try {
        if (replaceRevision)
          await held.execute(
            "UPDATE entity_export_intents SET revision = 'new-revision'",
          );
        const pending = exports.acknowledge([intent]).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await sleep(25);
        expect(await exports.list()).toHaveLength(1);
        await held.commit();
        const outcome = await pending;
        if ("error" in outcome) throw outcome.error;
        expect(outcome.value).toBe(replaceRevision ? 0 : 1);
        const remaining = await exports.list();
        expect(remaining).toHaveLength(replaceRevision ? 1 : 0);
        if (replaceRevision)
          expect(remaining[0]?.revision).toBe("new-revision");
      } finally {
        held.close();
      }
    });
  }

  async function createWave(): Promise<void> {
    await store.markDirty({
      sourceType: "note",
      sourceId: "note-source",
      revision: "hash-1",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "wave-contention",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
  }

  it("retries the single projection-rule insert before making rules visible", async () => {
    await createWave();
    const held = await holder.client.transaction("write");
    try {
      await held.execute("INSERT INTO contention_probe VALUES (1)");
      const pending = store
        .putWaveRules("wave-contention", [
          { ruleId: "topics", targetType: "topic", level: 0 },
        ])
        .then(
          () => ({ committed: true }),
          (error: unknown) => ({ error }),
        );
      await sleep(25);
      expect(await store.listWaveRules("wave-contention")).toHaveLength(0);
      await held.commit();
      const outcome = await pending;
      if ("error" in outcome) throw outcome.error;
      expect(outcome.committed).toBe(true);
      expect(await store.listWaveRules("wave-contention")).toEqual([
        expect.objectContaining({ ruleId: "topics", status: "pending" }),
      ]);
    } finally {
      held.close();
    }
  });

  it("retries only the pending-to-queued rule update", async () => {
    await createWave();
    await store.putWaveRules("wave-contention", [
      { ruleId: "topics", targetType: "topic", level: 0 },
    ]);
    const held = await holder.client.transaction("write");
    try {
      await held.execute("INSERT INTO contention_probe VALUES (1)");
      const pending = store
        .queueWaveRule("wave-contention", "topics", "job-1")
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
      await sleep(25);
      expect(
        (await store.getWaveRule("wave-contention", "topics"))?.status,
      ).toBe("pending");
      await held.commit();
      const outcome = await pending;
      if ("error" in outcome) throw outcome.error;
      expect(outcome.value).toMatchObject({ status: "queued", jobId: "job-1" });
    } finally {
      held.close();
    }
  });
});
