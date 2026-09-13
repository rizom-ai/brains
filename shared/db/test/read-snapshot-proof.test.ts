import { beforeEach, afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import { PersistenceBudgetPool } from "../src/turso-worker/budget-pool";
import {
  validateReadReply,
  type ReadCommand,
} from "../src/turso-worker/read-protocol";
import type { BlobPlan } from "../src/turso-worker/blob-protocol";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
  type SealedStage,
} from "../src/turso-worker/binary-protocol";

const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
const consumerUrl = new URL(
  "./fixtures/turso-thread/read-consumer.ts",
  import.meta.url,
);
const SHA = "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
const plan: BlobPlan = {
  table: "proof_reads",
  column: "bytes",
  key: [{ column: "id", value: 1 }],
  maxBytes: 65539,
};
class ObservedDriver extends SqlWorkerDriver {
  public filled: () => void = () => undefined;
  public override read(command: ReadCommand): Promise<unknown> {
    const pending = super.read(command);
    if (command.action === "fill") this.filled();
    return pending;
  }
}
let driver: ObservedDriver;
let pool: PersistenceBudgetPool;
beforeEach(async () => {
  pool = new PersistenceBudgetPool();
  driver = new ObservedDriver({
    url: "file::memory:",
    workerUrl,
    budget: pool,
  });
  await driver.executeMultiple(
    "CREATE TABLE proof_reads (id INTEGER PRIMARY KEY, bytes BLOB); INSERT INTO proof_reads VALUES (1, zeroblob(65539)), (2, zeroblob(0)), (3, NULL)",
  );
});
afterEach(async () => {
  await driver.close();
});
function consumer(pause = false, fault?: string): Worker {
  return new Worker(consumerUrl, {
    workerData: { pause, ...(fault && { fault }) },
  });
}
function waiting(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error): void => reject(error);
    worker.once("error", failed);
    worker.once("message", (input: unknown) => {
      try {
        assert.deepEqual(input, {
          kind: "chunk-held",
          threadId: worker.threadId,
          pid: process.pid,
        });
        worker.off("error", failed);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}
describe("worker-owned read snapshots", () => {
  it("keeps the whole reservation charged when the adopted backing is smaller", async () => {
    const scope = await driver.openReadScope();
    const other = await driver.openReadScope();
    try {
      const read = await scope.prepare({
        ...plan,
        maxBytes: STAGE_BUDGET_BYTES,
      });
      expect(read.sizeBytes).toBe(65539);
      assert.equal(read.sha256, SHA);
      assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
      assert.equal(
        (await driver.readStats()).reservedBytes,
        STAGE_BUDGET_BYTES,
      );
      await assert.rejects(
        other.prepare({
          ...plan,
          key: [{ column: "id", value: 2 }],
          maxBytes: 1,
        }),
        /capacity exceeded/,
      );
      await scope.discard(read.capability);
      assert.equal(pool.stats().residentBytes, 0);
      assert.equal((await driver.readStats()).reservedBytes, 0);
      const next = await other.prepare(plan);
      assert.equal(next.sha256, SHA);
    } finally {
      await Promise.all([scope.close(), other.close()]);
    }
  });
  it("does not expose adopted bytes through ordinary query replies", async () => {
    await assert.rejects(
      driver.execute({ sql: "SELECT bytes FROM proof_reads WHERE id = 1" }),
    );
    const scope = await driver.openReadScope();
    try {
      const read = await scope.prepare(plan);
      expect(read.sha256).toBe(SHA);
      assert.equal(read.sizeBytes, 65539);
    } finally {
      await scope.close();
    }
  });
  it("validates allocation and completion identities before releasing request admission", () => {
    const generation = crypto.randomUUID();
    const scope = crypto.randomUUID();
    const capability = { generation, scope, id: 99 };
    const allocate = { action: "allocate", scope, plan } as const;
    const fill = { action: "fill", capability } as const;
    expect(
      validateReadReply(allocate, capability, generation, 99),
    ).toBeUndefined();
    validateReadReply(
      fill,
      { capability, sizeBytes: 65539, sha256: SHA },
      generation,
      100,
    );
    for (const foreign of [
      { ...capability, generation: crypto.randomUUID() },
      { ...capability, scope: crypto.randomUUID() },
      { ...capability, id: 100 },
    ]) {
      assert.throws(
        () => validateReadReply(allocate, foreign, generation, 99),
        /Invalid read snapshot acknowledgement/,
      );
      assert.throws(
        () =>
          validateReadReply(
            fill,
            { capability: foreign, sizeBytes: 65539, sha256: SHA },
            generation,
            100,
          ),
        /Invalid read snapshot acknowledgement/,
      );
    }
  });
  it("cancels an active download without revoking a sibling snapshot", async () => {
    const scope = await driver.openReadScope();
    const first = await scope.prepare(plan);
    const sibling = await scope.prepare(plan);
    const held = Promise.withResolvers<void>();
    const cancellation = new AbortController();
    const rejected = assert.rejects(
      scope.download(
        first.capability,
        () => {
          const peer = consumer(true);
          void waiting(peer).then(held.resolve, held.reject);
          return peer;
        },
        cancellation.signal,
      ),
      /cancelled/,
    );
    await held.promise;
    cancellation.abort();
    await rejected;
    expect(pool.stats().residentBytes).toBe(65539);
    assert.equal(pool.egress.stats().slots, 0);
    assert.equal(
      (await scope.download(sibling.capability, () => consumer())).sha256,
      SHA,
    );
    await scope.close();
  });
  it("retains consumer-held credit after database worker exit until the consumer actually exits", async () => {
    const reader = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    const park = new SharedArrayBuffer(4);
    const allowExit = Promise.withResolvers<void>();
    const stopping = Promise.withResolvers<void>();
    let terminate: (() => Promise<number>) | undefined;
    try {
      await reader.executeMultiple(
        "CREATE TABLE proof_reads (id INTEGER PRIMARY KEY, bytes BLOB); INSERT INTO proof_reads VALUES (1, zeroblob(3))",
      );
      const scope = await reader.openReadScope();
      const read = await scope.prepare(plan);
      const held = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        scope.download(read.capability, () => {
          const peer = new Worker(consumerUrl, {
            workerData: { pause: true, park },
          });
          terminate = peer.terminate.bind(peer);
          const original = terminate;
          peer.terminate = async (): Promise<number> => {
            stopping.resolve();
            await allowExit.promise;
            return original();
          };
          void waiting(peer).then(held.resolve, held.reject);
          return peer;
        }),
        /owner lost|receiver exited/,
      );
      await held.promise;
      await reader.terminateForProof();
      await stopping.promise;
      expect(pool.stats().residentBytes).toBe(0);
      assert.equal(pool.egress.stats().reservedBytes, STAGE_CHUNK_BYTES);
      // The other native owner remains usable while the consumer is parked.
      assert.equal(
        (await driver.execute({ sql: "SELECT 1 AS n" })).rows[0]?.["n"],
        1,
      );
      allowExit.resolve();
      Atomics.store(new Int32Array(park), 0, 1);
      Atomics.notify(new Int32Array(park), 0);
      await rejected;
      await assert.rejects(reader.close(), /owner lost/);
      assert.equal(pool.egress.stats().slots, 0);
    } finally {
      allowExit.resolve();
      Atomics.store(new Int32Array(park), 0, 1);
      Atomics.notify(new Int32Array(park), 0);
      await terminate?.();
      await assert.rejects(reader.close());
    }
  });
  it("snapshots descriptors and charges the entire read backing, not just visible bytes", async () => {
    const scope = await driver.openReadScope();
    const descriptor: BlobPlan = {
      ...plan,
      key: [{ column: "id", value: 1 }],
      maxBytes: STAGE_BUDGET_BYTES,
    };
    const pending = scope.prepare(descriptor);
    descriptor.key = [{ column: "id", value: 2 }];
    descriptor.maxBytes = 0;
    const read = await pending;
    expect(read.sizeBytes).toBe(65539);
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    const uploads = await driver.openBinaryScope();
    await assert.rejects(
      uploads.begin({ reservationBytes: 1 }),
      /capacity exceeded/,
    );
    await scope.close();
    await uploads.close();
    assert.equal(pool.stats().residentBytes, 0);
  });
  it("revalidates size after the snapshot actually acquires its queued lease", async () => {
    const scope = await driver.openReadScope();
    const blocker = await driver.transaction("write");
    await blocker.execute({
      sql: "UPDATE proof_reads SET bytes=zeroblob(65540) WHERE id=1",
    });
    const submitted = Promise.withResolvers<void>();
    driver.filled = (): void => submitted.resolve();
    const rejected = assert.rejects(
      scope.prepare(plan),
      /Invalid BLOB type or size/,
    );
    try {
      await submitted.promise;
      expect((await driver.readStats()).preparing).toBe(1);
      await blocker.commit();
      await rejected;
      assert.equal(pool.stats().residentBytes, 0);
      assert.equal(pool.stats().scratchBytes, 0);
    } finally {
      await scope.close();
    }
  });
  it("shares two egress credits across owners without borrowing ingress capacity or creating an excess consumer", async () => {
    const extra = [0, 1].map(
      () =>
        new SqlWorkerDriver({ url: "file::memory:", workerUrl, budget: pool }),
    );
    const drivers = [driver, ...extra];
    try {
      for (const peer of extra)
        await peer.executeMultiple(
          "CREATE TABLE proof_reads (id INTEGER PRIMARY KEY, bytes BLOB); INSERT INTO proof_reads VALUES (1, zeroblob(3))",
        );
      const scopes = await Promise.all(
        drivers.map((peer) => peer.openReadScope()),
      );
      const reads: SealedStage[] = [];
      // Prepare sequentially: this case isolates egress, not the two scratch slots.
      for (const scope of scopes) reads.push(await scope.prepare(plan));
      const held = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      const rejected = scopes.slice(0, 2).map((scope, index) => {
        const read = reads[index];
        const ready = held[index];
        assert(read && ready);
        return assert.rejects(
          scope.download(read.capability, () => {
            const peer = consumer(true);
            void waiting(peer).then(ready.resolve, ready.reject);
            return peer;
          }),
          /revoked|closed/,
        );
      });
      await Promise.all(held.map((entry) => entry.promise));
      expect(pool.egress.stats()).toEqual({
        slots: 2,
        reservedBytes: 2 * STAGE_CHUNK_BYTES,
      });
      assert.equal(pool.ingress.stats().slots, 0);
      const third = scopes[2];
      const read = reads[2];
      assert(third && read);
      let spawned = false;
      await assert.rejects(
        third.download(read.capability, () => {
          spawned = true;
          return consumer();
        }),
        /Shared egress capacity exceeded/,
      );
      assert.equal(spawned, false);
      await Promise.all(scopes.map((scope) => scope.close()));
      await Promise.all(rejected);
      assert.equal(pool.egress.stats().slots, 0);
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      await Promise.all(extra.map((peer) => peer.close()));
    }
  });
  it("releases the snapshot before a slow consumer and keeps the original bytes after a writer commits", async () => {
    const scope = await driver.openReadScope();
    const read = await scope.prepare(plan);
    expect(read.sha256).toBe(SHA);
    const held = Promise.withResolvers<void>();
    let source: Worker | undefined;
    const transfer = scope.download(read.capability, () => {
      source = consumer(true);
      void waiting(source).then(held.resolve, held.reject);
      return source;
    });
    try {
      await held.promise;
      assert.equal(pool.egress.stats().reservedBytes, STAGE_CHUNK_BYTES);
      assert.equal(pool.stats().scratchBytes, 0);
      await driver.execute({
        sql: "UPDATE proof_reads SET bytes=x'01' WHERE id=1",
      });
      assert(source);
      source.postMessage({ kind: "resume" });
      const result = await transfer; // Consumer independently hashes the old backing.
      assert.equal(result.sha256, SHA);
      assert.equal(result.sizeBytes, 65539);
      assert.equal(pool.stats().residentBytes, 0);
      assert.equal(pool.egress.stats().slots, 0);
      await assert.rejects(
        scope.download(read.capability, () => consumer()),
        /Unknown or spent/,
      );
    } finally {
      await scope.close();
    }
  });
  it.each(["empty", "missing", "null", "size"])(
    "handles %s without publishing an invalid snapshot",
    async (mode) => {
      const scope = await driver.openReadScope();
      const selected = {
        ...plan,
        key: [
          {
            column: "id",
            value:
              mode === "empty"
                ? 2
                : mode === "null"
                  ? 3
                  : mode === "missing"
                    ? 4
                    : 1,
          },
        ],
        maxBytes: 0,
      };
      if (mode === "empty") {
        const read = await scope.prepare(selected);
        assert.equal(
          (await scope.download(read.capability, () => consumer())).sizeBytes,
          0,
        );
      } else
        await assert.rejects(
          scope.prepare(selected),
          /exactly one row|Invalid BLOB/,
        );
      expect(pool.stats().residentBytes).toBe(0);
      assert.equal(pool.stats().scratchBytes, 0);
      await scope.close();
    },
  );
  it("pins a cancelled preparation while it waits for the native owner, then releases after snapshot rollback", async () => {
    const scope = await driver.openReadScope();
    const blocker = await driver.transaction("write");
    const submitted = Promise.withResolvers<void>();
    driver.filled = (): void => submitted.resolve();
    const rejected = assert.rejects(
      scope.prepare(plan),
      /revoked|scope is closing/,
    );
    try {
      await submitted.promise;
      assert.equal((await driver.readStats()).preparing, 1);
      await scope.close();
      expect(pool.stats().residentBytes).toBe(65539);
      assert.equal(pool.stats().scratchSlots, 1);
      await blocker.rollback();
      await rejected;
      assert.equal(pool.stats().residentBytes, 0);
      assert.equal(pool.stats().scratchBytes, 0);
    } finally {
      await blocker.rollback();
      await scope.close();
    }
  });
  it("shares resident admission with uploads before acquiring a read lease", async () => {
    const uploads = await driver.openBinaryScope();
    await uploads.begin({ reservationBytes: STAGE_BUDGET_BYTES });
    const scope = await driver.openReadScope();
    await assert.rejects(scope.prepare(plan), /capacity exceeded/);
    expect((await driver.readStats()).reads).toBe(0);
    assert.equal(pool.stats().scratchBytes, 0);
    await uploads.close();
    await scope.close();
  });
  it("fails scratch admission without holding a lease or leaking the read backing", async () => {
    const scope = await driver.openReadScope();
    const blocker = await driver.transaction("write");
    const first = driver.verifyBlob(plan);
    const second = driver.verifyBlob(plan);
    try {
      await assert.rejects(scope.prepare(plan), /scratch capacity exceeded/);
      expect(pool.stats().residentBytes).toBe(0);
      await blocker.rollback();
      await Promise.all([first, second]);
    } finally {
      await blocker.rollback();
      await scope.close();
    }
  });
  it.each(["grant", "direction", "sequence", "replay", "sql", "backing"])(
    "rejects %s on a read port and releases its snapshot",
    async (fault) => {
      const scope = await driver.openReadScope();
      const read = await scope.prepare(plan);
      await assert.rejects(
        scope.download(read.capability, () => consumer(false, fault)),
      );
      expect(pool.stats().residentBytes).toBe(0);
      assert.equal(pool.egress.stats().slots, 0);
      assert.equal(
        (await driver.execute({ sql: "SELECT count(*) AS n FROM proof_reads" }))
          .rows[0]?.["n"],
        3,
      );
      await scope.close();
    },
  );
  it("rejects a second stream without destroying the rightful reader and revokes on scope closure", async () => {
    const scope = await driver.openReadScope();
    const read = await scope.prepare(plan);
    const held = Promise.withResolvers<void>();
    const rejected = assert.rejects(
      scope.download(read.capability, () => {
        const peer = consumer(true);
        void waiting(peer).then(held.resolve, held.reject);
        return peer;
      }),
      /revoked|closed/,
    );
    await held.promise;
    await assert.rejects(
      scope.download(read.capability, () => consumer()),
      /not available/,
    );
    expect((await driver.readStats()).streaming).toBe(1);
    await scope.close();
    await rejected;
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.egress.stats().slots, 0);
  });
});
