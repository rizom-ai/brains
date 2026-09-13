import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import { PersistenceBudgetPool } from "../src/turso-worker/budget-pool";
import { STAGE_CHUNK_BYTES } from "../src/turso-worker/binary-protocol";

const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
const producerUrl = new URL(
  "./fixtures/turso-thread/upload-producer.ts",
  import.meta.url,
);
function producer(
  size: number,
  options: { pause?: boolean; fault?: string; park?: SharedArrayBuffer } = {},
): Worker {
  return new Worker(producerUrl, { workerData: { size, ...options } });
}
function held(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    worker.once("error", reject);
    worker.once("message", (input: unknown) => {
      try {
        assert.deepEqual(input, {
          kind: "credit-held",
          threadId: worker.threadId,
          pid: process.pid,
        });
        worker.off("error", reject);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe("direct credited worker uploads", () => {
  it.each(["before-admission", "before-handoff", "active"])(
    "cancels %s without fencing a healthy receiver",
    async (phase) => {
      const pool = new PersistenceBudgetPool();
      const driver = new SqlWorkerDriver({
        url: "file::memory:",
        workerUrl,
        budget: pool,
      });
      const cancellation = new AbortController();
      try {
        const scope = await driver.openBinaryScope();
        const stage = await scope.begin({ reservationBytes: 3 });
        const waiting = Promise.withResolvers<void>();
        let spawned = false;
        if (phase === "before-admission") cancellation.abort();
        const rejected = assert.rejects(
          driver.upload(
            stage,
            () => {
              spawned = true;
              const source = producer(3, { pause: true });
              if (phase === "before-handoff") cancellation.abort();
              if (phase === "active")
                void held(source).then(waiting.resolve, waiting.reject);
              return source;
            },
            cancellation.signal,
          ),
          /cancelled/,
        );
        if (phase === "active") {
          await waiting.promise;
          cancellation.abort();
        }
        await rejected;
        expect(spawned).toBe(phase !== "before-admission");
        assert.equal(pool.ingress.stats().slots, 0);
        assert.equal(
          (await driver.execute({ sql: "SELECT 1 AS ok" })).rows[0]?.["ok"],
          1,
        );
        await scope.close();
        assert.equal(pool.stats().residentBytes, 0);
      } finally {
        cancellation.abort();
        await driver.close();
      }
    },
  );
  it.each(["grant", "replay", "sequence", "backing", "sql", "exit"])(
    "rejects %s without native SQL or leaked stages",
    async (fault) => {
      const pool = new PersistenceBudgetPool();
      const driver = new SqlWorkerDriver({
        url: "file::memory:",
        workerUrl,
        budget: pool,
      });
      try {
        await driver.execute({
          sql: "CREATE TABLE proof_uploads (id INTEGER PRIMARY KEY)",
        });
        const scope = await driver.openBinaryScope();
        const stage = await scope.begin({ reservationBytes: 3 });
        await assert.rejects(
          driver.upload(stage, () => producer(3, { fault })),
        );
        expect((await driver.stageStats()).stages).toBe(0);
        assert.equal(
          (
            await driver.execute({
              sql: "SELECT count(*) AS n FROM proof_uploads",
            })
          ).rows[0]?.["n"],
          0,
        );
        assert.deepEqual(pool.ingress.stats(), { slots: 0, reservedBytes: 0 });
        await scope.close();
      } finally {
        await driver.close();
      }
    },
  );
  it.each(["empty", "incomplete", "digest"])(
    "settles the %s finish path with returned credit",
    async (mode) => {
      const pool = new PersistenceBudgetPool();
      const driver = new SqlWorkerDriver({
        url: "file::memory:",
        workerUrl,
        budget: pool,
      });
      try {
        const scope = await driver.openBinaryScope();
        const stage = await scope.begin({
          reservationBytes: mode === "empty" ? 0 : 4,
          expectedSize: mode === "incomplete" ? 4 : 0,
          ...(mode === "digest" && { expectedDigest: "0".repeat(64) }),
        });
        const upload = driver.upload(stage, () =>
          producer(mode === "incomplete" ? 3 : 0),
        );
        if (mode === "empty")
          assert.equal(
            (await upload).sha256,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          );
        else await assert.rejects(upload, /size or digest mismatch/);
        expect(pool.ingress.stats().slots).toBe(0);
        await scope.close();
        assert.equal(pool.stats().residentBytes, 0);
      } finally {
        await driver.close();
      }
    },
  );
  it("revokes through reserved cleanup capacity while ordinary native admission is full", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
      maxInFlight: 1,
    });
    const gate = new SharedArrayBuffer(4);
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 3 });
      const waiting = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        driver.upload(stage, () => {
          const source = producer(3, { pause: true });
          void held(source).then(waiting.resolve, waiting.reject);
          return source;
        }),
      );
      await waiting.promise;
      const blocked = driver.holdThreadForProof(gate);
      await blocked.entered;
      await assert.rejects(driver.execute({ sql: "SELECT 1" }), /overloaded/);
      const closing = scope.close();
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await blocked.done;
      await closing;
      await rejected;
      expect(pool.ingress.stats().slots).toBe(0);
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await driver.close();
    }
  });
  it("shares two ingress slots and rejects before creating an excess producer", async () => {
    const pool = new PersistenceBudgetPool();
    const drivers = Array.from(
      { length: 3 },
      () =>
        new SqlWorkerDriver({ url: "file::memory:", workerUrl, budget: pool }),
    );
    try {
      const scopes = await Promise.all(
        drivers.map((driver) => driver.openBinaryScope()),
      );
      const stages = await Promise.all(
        scopes.map((scope) => scope.begin({ reservationBytes: 1 })),
      );
      const waiting = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      const rejected = drivers.slice(0, 2).map((driver, index) => {
        const stage = stages[index];
        const ready = waiting[index];
        assert(stage && ready);
        return assert.rejects(
          driver.upload(stage, () => {
            const source = producer(1, { pause: true });
            void held(source).then(ready.resolve, ready.reject);
            return source;
          }),
          /revoked|closed|exited/,
        );
      });
      await Promise.all(waiting.map((entry) => entry.promise));
      expect(pool.ingress.stats()).toEqual({
        slots: 2,
        reservedBytes: 2 * STAGE_CHUNK_BYTES,
      });
      const third = drivers[2];
      const stage = stages[2];
      assert(third && stage);
      let spawned = false;
      await assert.rejects(
        third.upload(stage, () => {
          spawned = true;
          return producer(1);
        }),
        /Shared ingress capacity/,
      );
      assert.equal(spawned, false);
      await Promise.all(scopes.map((scope) => scope.close()));
      await Promise.all(rejected);
      assert.deepEqual(pool.ingress.stats(), { slots: 0, reservedBytes: 0 });
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      await Promise.all(drivers.map((driver) => driver.close()));
    }
  });
  it("reclaims an unstarted producer reservation without pretending its stage was rolled back", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 1 });
      await assert.rejects(
        driver.upload(stage, () => {
          throw new Error("Producer construction failed");
        }),
        /construction failed/,
      );
      expect(pool.ingress.stats().slots).toBe(0);
      assert.equal((await driver.stageStats()).stages, 1);
      await scope.close();
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      await driver.close();
    }
  });
  it("settles a producer startup failure while the receiver handoff is queued", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    const gate = new SharedArrayBuffer(4);
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 1 });
      const blocked = driver.holdThreadForProof(gate);
      await blocked.entered;
      const dead = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        driver.upload(stage, () => {
          const source = new Worker(
            new URL(
              "./fixtures/turso-thread/missing-producer.ts",
              import.meta.url,
            ),
          );
          source.once("exit", () => dead.resolve());
          return source;
        }),
      );
      await dead.promise;
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await blocked.done;
      await rejected;
      expect(pool.ingress.stats().slots).toBe(0);
      await scope.close();
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await driver.close();
    }
  });
  it("retains producer-owned credit after receiver exit and keeps HTTP control responsive", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    const park = new SharedArrayBuffer(4);
    const allowExit = Promise.withResolvers<void>();
    const stopping = Promise.withResolvers<void>();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("control"),
    });
    let terminate: (() => Promise<number>) | undefined;
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 3 });
      const waiting = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        driver.upload(stage, () => {
          const source = producer(3, { pause: true, park });
          terminate = source.terminate.bind(source);
          const original = terminate;
          source.terminate = async (): Promise<number> => {
            stopping.resolve();
            await allowExit.promise;
            return original();
          };
          void held(source).then(waiting.resolve, waiting.reject);
          return source;
        }),
        /owner lost|receiver exited/,
      );
      await waiting.promise;
      await driver.terminateForProof();
      await stopping.promise;
      expect(pool.stats().members).toBe(0);
      assert.equal(pool.ingress.stats().reservedBytes, STAGE_CHUNK_BYTES);
      let closed = false;
      const closing = assert.rejects(driver.close(), /owner lost/).then(() => {
        closed = true;
      });
      assert.equal(await (await fetch(server.url)).text(), "control");
      assert.equal(closed, false);
      allowExit.resolve();
      Atomics.store(new Int32Array(park), 0, 1);
      Atomics.notify(new Int32Array(park), 0);
      await rejected;
      await closing;
      assert.equal(pool.ingress.stats().reservedBytes, 0);
    } finally {
      allowExit.resolve();
      Atomics.store(new Int32Array(park), 0, 1);
      Atomics.notify(new Int32Array(park), 0);
      await terminate?.();
      await server.stop(true);
      await assert.rejects(driver.close());
    }
  });
  it("preserves owner and termination errors without refunding a live producer", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    const park = new SharedArrayBuffer(4);
    let terminate: (() => Promise<number>) | undefined;
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 3 });
      const waiting = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        driver.upload(stage, () => {
          const source = producer(3, { pause: true, park });
          terminate = source.terminate.bind(source);
          source.terminate = (): Promise<number> =>
            Promise.reject(new Error("Injected producer termination failure"));
          void held(source).then(waiting.resolve, waiting.reject);
          return source;
        }),
        (error) => {
          assert(error instanceof AggregateError);
          assert.match(error.message, /cleanup could not be confirmed/);
          assert(
            error.errors.some(
              (cause: unknown) =>
                cause instanceof Error &&
                /termination failure/.test(cause.message),
            ),
          );
          return true;
        },
      );
      await waiting.promise;
      await driver.terminateForProof();
      await rejected;
      await assert.rejects(
        driver.close(),
        /Persistence and binary shutdown failed/,
      );
      expect(pool.ingress.stats().reservedBytes).toBe(STAGE_CHUNK_BYTES);
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      Atomics.store(new Int32Array(park), 0, 1);
      Atomics.notify(new Int32Array(park), 0);
      await terminate?.();
      await assert.rejects(driver.close());
    }
    assert.equal(pool.ingress.stats().slots, 0);
  });
  it("shutdown joins an active producer rather than only closing the database", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 3 });
      const waiting = Promise.withResolvers<void>();
      const exited = Promise.withResolvers<void>();
      const rejected = assert.rejects(
        driver.upload(stage, () => {
          const source = producer(3, { pause: true });
          source.once("exit", () => exited.resolve());
          void held(source).then(waiting.resolve, waiting.reject);
          return source;
        }),
      );
      await waiting.promise;
      const closing = driver.close();
      let spawned = false;
      await assert.rejects(
        driver.upload(stage, () => {
          spawned = true;
          return producer(3);
        }),
        /closing|owner lost/,
      );
      assert.equal(spawned, false);
      await closing;
      await rejected;
      await exited.promise;
      expect(pool.ingress.stats()).toEqual({ slots: 0, reservedBytes: 0 });
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      await driver.close();
    }
  });
  it("moves three chunks between workers, seals, and binds without parent payloads", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({
        reservationBytes: 65539,
        expectedSize: 65539,
      });
      const facts = await driver.upload(stage, () => producer(65539));
      expect(facts.sha256).toBe(
        "82abcd7b965a2c75bef1461e9f5206f47621c1bdeda0aa75de8714ba73dabccc",
      );
      assert.equal(facts.sizeBytes, 65539);
      assert.deepEqual(pool.ingress.stats(), { slots: 0, reservedBytes: 0 });
      assert.equal(pool.stats().residentBytes, 65539);
      await driver.execute({
        sql: "CREATE TABLE proof_uploads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL)",
      });
      const claim = await scope.reserve(stage);
      const tx = await driver.transaction("write", [claim]);
      await scope.close();
      assert.equal(pool.stats().residentBytes, 65539);
      await tx.executeBound({
        sql: "INSERT INTO proof_uploads VALUES (1, ?)",
        args: [{ kind: "resident", claim }],
      });
      await tx.commit();
      assert.deepEqual(
        await driver.verifyBlob({
          table: "proof_uploads",
          column: "bytes",
          key: [{ column: "id", value: 1 }],
          maxBytes: 65539,
        }),
        { sizeBytes: 65539, sha256: facts.sha256 },
      );
      assert.equal(pool.stats().residentBytes, 0);
      await scope.close();
    } finally {
      await driver.close();
    }
  });
  it("revokes a scope while the producer owns its credit and blocks competing append/seal", async () => {
    const pool = new PersistenceBudgetPool();
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      budget: pool,
    });
    try {
      const scope = await driver.openBinaryScope();
      const stage = await scope.begin({ reservationBytes: 3 });
      const waiting = Promise.withResolvers<void>();
      const upload = driver.upload(stage, () => {
        const source = producer(3, { pause: true });
        void held(source).then(waiting.resolve, waiting.reject);
        return source;
      });
      const rejected = assert.rejects(upload, /revoked|closed|exited/);
      await waiting.promise;
      expect(pool.ingress.stats().reservedBytes).toBe(STAGE_CHUNK_BYTES);
      await assert.rejects(
        scope.append(stage, 0, new Uint8Array([1])),
        /active upload/,
      );
      await assert.rejects(scope.seal(stage), /active upload/);
      await scope.close();
      await rejected;
      assert.deepEqual(pool.ingress.stats(), { slots: 0, reservedBytes: 0 });
      assert.equal(pool.stats().residentBytes, 0);
    } finally {
      await driver.close();
    }
  });
});
