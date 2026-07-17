import { describe, expect, it } from "bun:test";
import { GitOperationLock } from "../../src/lib/git-lock";

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("GitOperationLock cancellation", () => {
  it("preserves a pre-aborted reason without running the callback", async () => {
    const lock = new GitOperationLock();
    const controller = new AbortController();
    const reason = new Error("cancel lock waiter");
    controller.abort(reason);
    let called = false;

    try {
      await lock.run(async () => {
        called = true;
      }, controller.signal);
      throw new Error("Expected lock cancellation");
    } catch (error) {
      expect(error).toBe(reason);
    }
    expect(called).toBe(false);
  });

  it("does not abandon a callback after it has entered the lock", async () => {
    const lock = new GitOperationLock();
    const started = deferred();
    const release = deferred();
    const controller = new AbortController();
    const running = lock.run(async () => {
      started.resolve();
      await release.promise;
      return "finished";
    }, controller.signal);
    await started.promise;

    let settled = false;
    void running.then(() => {
      settled = true;
    });
    controller.abort(new Error("too late to skip"));
    await Promise.resolve();
    expect(settled).toBe(false);

    release.resolve();
    expect(await running).toBe("finished");
  });

  it("skips a canceled waiter and admits the next waiter", async () => {
    const lock = new GitOperationLock();
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const first = lock.run(async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return "first";
    });
    await firstStarted.promise;

    const controller = new AbortController();
    const reason = new Error("skip queued pull");
    let canceledCalled = false;
    const canceled = lock.run(async () => {
      canceledCalled = true;
      return "canceled";
    }, controller.signal);
    let nextCalled = false;
    const next = lock.run(async () => {
      nextCalled = true;
      return "next";
    });

    controller.abort(reason);
    try {
      await canceled;
      throw new Error("Expected queued cancellation");
    } catch (error) {
      expect(error).toBe(reason);
    }
    expect(canceledCalled).toBe(false);
    expect(nextCalled).toBe(false);

    releaseFirst.resolve();
    expect(await first).toBe("first");
    expect(await next).toBe("next");
    expect(canceledCalled).toBe(false);
    expect(nextCalled).toBe(true);
  });
});
