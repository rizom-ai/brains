import { it, expect } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { WorkerLifetime } from "../src/turso-worker/worker-lifetime";

it.each(["delayed", "rejected"] as const)(
  "does not treat %s termination as an exit acknowledgement",
  async (mode) => {
    const worker = new Worker(
      new URL("./fixtures/thread-lifetime-worker.ts", import.meta.url),
    );
    const terminate = worker.terminate.bind(worker);
    const ready = Promise.withResolvers<void>();
    const pong = Promise.withResolvers<void>();
    const requested = Promise.withResolvers<void>();
    const allow = Promise.withResolvers<void>();
    const observedExit = Promise.withResolvers<void>();
    let exited = false;
    const hasExited = (): boolean => exited;
    const failures: Error[] = [];
    function fail(error: Error): void {
      failures.push(error);
      ready.reject(error);
      pong.reject(error);
    }
    // Startup/exit can reject a rendezvous before the test reaches that await.
    void ready.promise.catch(() => undefined);
    void pong.promise.catch(() => undefined);
    const lifetime = new WorkerLifetime(worker, {
      message: (input): void => {
        if (input === "ready") ready.resolve();
        else if (input === "pong") pong.resolve();
        else fail(new Error("Unexpected lifecycle fixture reply"));
      },
      failure: fail,
      exit: (): void => {
        exited = true;
        observedExit.resolve();
        const error = new Error("Worker exited before lifecycle rendezvous");
        ready.reject(error);
        pong.reject(error);
      },
    });
    const failure = new Error("Injected termination rejection");
    worker.terminate = async (): Promise<number> => {
      requested.resolve();
      if (mode === "rejected") throw failure;
      await allow.promise;
      return terminate();
    };
    try {
      await ready.promise;
      lifetime.requestTermination();
      await requested.promise;
      if (mode === "rejected")
        await assert.rejects(lifetime.exited, (error) => error === failure);
      worker.postMessage("ping");
      await pong.promise;
      expect(exited).toBe(false);
      if (mode === "delayed") {
        allow.resolve();
        await lifetime.exited;
        assert.equal(exited, true);
      }
    } finally {
      allow.resolve();
      if (!hasExited()) await terminate();
      await observedExit.promise;
    }
    assert.deepEqual(failures, []);
    // A late actual exit cannot erase the earlier unconfirmed-join failure.
    if (mode === "rejected")
      await assert.rejects(lifetime.exited, (error) => error === failure);
  },
);
