import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { GitStallError, runGitWithStallTimeout } from "../../src/lib/git-stall";

function never(): Promise<never> {
  return new Promise<never>(() => {});
}

describe("runGitWithStallTimeout", () => {
  it("uses the injected clock and preserves GitStallError identity", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        let settled = false;
        const outcome = runGitWithStallTimeout(
          { baseDir: process.cwd(), timeoutMs: 100, clock },
          never,
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
        const error = yield* Effect.promise(() => outcome);
        expect(error).toBeInstanceOf(GitStallError);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves caller abort reason identity", async () => {
    const controller = new AbortController();
    const reason = new Error("stop periodic pull");
    const running = runGitWithStallTimeout(
      { baseDir: process.cwd(), timeoutMs: 10_000 },
      never,
      controller.signal,
    );

    controller.abort(reason);
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
