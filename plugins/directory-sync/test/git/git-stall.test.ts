import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { GitStallError, runGitWithStallTimeout } from "../../src/lib/git-stall";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("runGitWithStallTimeout", () => {
  it("uses the injected clock and preserves GitStallError identity", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        let settled = false;
        const operation = deferred();
        const outcome = runGitWithStallTimeout(
          { baseDir: process.cwd(), timeoutMs: 100, clock },
          () => operation.promise,
        ).then(
          () => {
            settled = true;
            return undefined;
          },
          (error: unknown) => {
            settled = true;
            return error;
          },
        );

        yield* TestClock.adjust(99);
        yield* Effect.yieldNow();
        expect(settled).toBe(false);

        yield* TestClock.adjust(1);
        yield* Effect.yieldNow();
        expect(settled).toBe(false);

        operation.resolve();
        const error = yield* Effect.promise(() => outcome);
        expect(error).toBeInstanceOf(GitStallError);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves caller abort reason identity", async () => {
    const controller = new AbortController();
    const reason = new Error("stop periodic pull");
    const operation = deferred();
    let settled = false;
    const running = runGitWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      () => operation.promise,
      controller.signal,
    ).finally(() => {
      settled = true;
    });

    controller.abort(reason);
    await Promise.resolve();
    expect(settled).toBe(false);
    operation.resolve();
    try {
      await running;
      throw new Error("Expected caller cancellation");
    } catch (error) {
      expect(error).toBe(reason);
    }
  });

  it("preserves ordinary operation errors", async () => {
    const original = new Error("remote rejected credentials");

    try {
      await runGitWithStallTimeout(
        { baseDir: process.cwd(), timeoutMs: 10_000 },
        async () => {
          throw original;
        },
      );
      throw new Error("Expected operation failure");
    } catch (error) {
      expect(error).toBe(original);
    }
  });
});
