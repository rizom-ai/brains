import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { withBrowser } from "../src/browser-lifecycle";
import type {
  BrowserFactory,
  MediaBrowser,
  MediaPage,
} from "../src/browser-types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value: T): void => settle?.(value),
  };
}

function browserFactory(browser: MediaBrowser): BrowserFactory {
  return {
    launch: async (): Promise<MediaBrowser> => browser,
  };
}

const page: MediaPage = {
  goto: async (): Promise<void> => undefined,
  screenshot: async (): Promise<Buffer> => Buffer.alloc(0),
  pdf: async (): Promise<Buffer> => Buffer.alloc(0),
};

describe("browser lifecycle", () => {
  it("rejects pre-aborted requests before launching", async () => {
    const caller = new AbortController();
    const reason = new Error("cancelled before launch");
    caller.abort(reason);
    let launches = 0;
    const factory: BrowserFactory = {
      launch: async (): Promise<never> => {
        launches++;
        throw new Error("unexpected launch");
      },
    };
    await assert.rejects(
      withBrowser(
        factory,
        1_000,
        async () => "unused",
        () => new Error("timeout"),
        { signal: caller.signal },
      ),
      (error: unknown) => error === reason,
    );
    expect(launches).toBe(0);
  });

  it("forwards acquisition cancellation and joins a distinct late launch failure", async () => {
    const started = deferred<void>();
    const cancelled = deferred<void>();
    const launch = Promise.withResolvers<MediaBrowser>();
    const caller = new AbortController();
    const reason = new Error("cancelled while launching");
    const late = new Error("launch cleanup failed");
    let observedReason: unknown;
    let settled = false;
    const factory: BrowserFactory = {
      launch: async (signal): Promise<MediaBrowser> => {
        assert.ok(signal);
        const onAbort = (): void => {
          observedReason = signal.reason;
          cancelled.resolve(undefined);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        started.resolve(undefined);
        try {
          return await launch.promise;
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      },
    };
    const work = withBrowser(
      factory,
      1_000,
      async () => "unused",
      () => new Error("timeout"),
      { signal: caller.signal },
    ).finally(() => {
      settled = true;
    });
    const rejected = assert.rejects(work, (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      expect(error.errors).toEqual([reason, late]);
      expect(error.cause).toBe(reason);
      return true;
    });
    await started.promise;
    caller.abort(reason);
    await cancelled.promise;
    try {
      expect(settled).toBe(false);
      expect(observedReason).toBe(reason);
    } finally {
      launch.reject(late);
      await rejected;
    }
  });

  it("retains distinct close, kill and exit-observation failures", async () => {
    const closeFailure = new Error("close failed");
    const killFailure = new Error("kill failed");
    const exitFailure = new Error("exit receipt failed");
    const exit = Promise.withResolvers<number>();
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<never> => {
        exit.reject(exitFailure);
        throw closeFailure;
      },
      process: () => ({
        exited: exit.promise,
        kill: (): never => {
          throw killFailure;
        },
      }),
    };
    await assert.rejects(
      withBrowser(
        browserFactory(browser),
        1_000,
        async () => "rendered",
        () => new Error("timeout"),
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toHaveLength(3);
        expect(error.errors).toContain(closeFailure);
        expect(error.errors).toContain(killFailure);
        expect(error.errors).toContain(exitFailure);
        return true;
      },
    );
  });

  it("rejects an invalid process-exit receipt", async () => {
    let kills = 0;
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<void> => undefined,
      process: () => ({
        exited: Promise.resolve(-1),
        kill: (): boolean => {
          kills++;
          return true;
        },
      }),
    };
    await assert.rejects(
      withBrowser(
        browserFactory(browser),
        1_000,
        async () => "rendered",
        () => new Error("timeout"),
      ),
      /invalid exit receipt/,
    );
    expect(kills).toBe(1);
  });

  it("joins the creator's process-exit receipt after close returns", async () => {
    const closeStarted = deferred<void>();
    const exited = deferred<number>();
    let exitReads = 0;
    let settled = false;
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<void> => {
        closeStarted.resolve(undefined);
      },
      process: () => ({
        get exited(): Promise<number> {
          exitReads++;
          return exited.promise;
        },
        kill: (): boolean => true,
      }),
    };
    const work = withBrowser(
      browserFactory(browser),
      1_000,
      async () => "rendered",
      () => new Error("timeout"),
    ).finally(() => {
      settled = true;
    });
    try {
      await closeStarted.promise;
      expect(exitReads).toBe(1);
      expect(settled).toBe(false);
    } finally {
      exited.resolve(0);
      await work;
    }
  });

  it("preserves operation and cleanup failure identities", async () => {
    const primary = new Error("render failed");
    const cleanup = new Error("close failed");
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<never> => {
        throw cleanup;
      },
      process: () => ({
        exited: Promise.resolve(0),
        kill: (): boolean => false,
      }),
    };
    await assert.rejects(
      withBrowser(
        browserFactory(browser),
        1_000,
        async (): Promise<never> => {
          throw primary;
        },
        () => new Error("timeout"),
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, cleanup]);
        expect(error.cause).toBe(primary);
        return true;
      },
    );
  });

  it("does not replace an observed failure with cancellation during cleanup", async () => {
    const closeStarted = deferred<void>();
    const releaseClose = deferred<void>();
    const caller = new AbortController();
    const primary = new Error("render already failed");
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<void> => {
        closeStarted.resolve(undefined);
        await releaseClose.promise;
      },
    };
    const rejected = assert.rejects(
      withBrowser(
        browserFactory(browser),
        1_000,
        async (): Promise<never> => {
          throw primary;
        },
        () => new Error("timeout"),
        { signal: caller.signal },
      ),
      (error: unknown) => error === primary,
    );
    await closeStarted.promise;
    caller.abort(new Error("late cancellation"));
    releaseClose.resolve(undefined);
    await rejected;
  });

  it("preserves the deadline failure when the caller aborts during retirement", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const closeStarted = deferred<void>();
        const releaseClose = deferred<void>();
        const caller = new AbortController();
        const primary = new Error("deadline elapsed first");
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeStarted.resolve(undefined);
            await releaseClose.promise;
          },
        };
        const rejected = assert.rejects(
          withBrowser(
            browserFactory(browser),
            100,
            async () => new Promise<never>(() => {}),
            () => primary,
            { clock, signal: caller.signal, closeTimeoutMs: 1_000 },
          ),
          (error: unknown) => error === primary,
        );
        yield* TestClock.adjust(100);
        yield* Effect.promise(() => closeStarted.promise);
        caller.abort(new Error("caller cancelled later"));
        releaseClose.resolve(undefined);
        yield* Effect.promise(() => rejected);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("waits for release before returning the render timeout", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const closeStarted = deferred<void>();
        const releaseClose = deferred<void>();
        const timeoutError = new Error("render timed out");
        let closeCalls = 0;
        let killCalls = 0;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            await releaseClose.promise;
          },
          process: () => ({
            exited: Promise.resolve(0),
            kill: (): boolean => {
              killCalls++;
              return true;
            },
          }),
        };
        let rejection: unknown;
        let settled = false;
        const rendering = withBrowser(
          browserFactory(browser),
          100,
          async () => new Promise<never>(() => {}),
          () => timeoutError,
          { clock, closeTimeoutMs: 1_000 },
        ).catch((error: unknown) => {
          rejection = error;
          settled = true;
        });

        yield* TestClock.adjust(100);
        yield* Effect.promise(() => closeStarted.promise);
        expect(settled).toBe(false);
        expect(closeCalls).toBe(1);
        expect(killCalls).toBe(0);

        releaseClose.resolve(undefined);
        yield* Effect.promise(() => rendering);
        expect(settled).toBe(true);
        expect(rejection).toBe(timeoutError);
        expect(closeCalls).toBe(1);
        expect(killCalls).toBe(0);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("escalates a hung close but still joins close and exit receipts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const closeStarted = deferred<void>();
        const killed = deferred<void>();
        const releaseClose = deferred<void>();
        const exited = deferred<number>();
        let closeCalls = 0;
        let killCalls = 0;
        let killedWith: string | number | undefined;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            await releaseClose.promise;
          },
          process: () => ({
            exited: exited.promise,
            kill: (signal?: string | number): boolean => {
              killCalls++;
              killedWith = signal;
              killed.resolve(undefined);
              return true;
            },
          }),
        };
        let settled = false;
        const rendering = withBrowser(
          browserFactory(browser),
          1_000,
          async () => "rendered",
          () => new Error("render timed out"),
          { clock, closeTimeoutMs: 100 },
        ).catch((error: unknown) => {
          settled = true;
          return error;
        });

        yield* Effect.promise(() => closeStarted.promise);
        yield* TestClock.adjust(99);
        expect(settled).toBe(false);
        expect(killCalls).toBe(0);

        yield* TestClock.adjust(1);
        yield* Effect.promise(() => killed.promise);
        expect(settled).toBe(false);
        exited.resolve(137);
        expect(settled).toBe(false);
        releaseClose.resolve(undefined);
        expect(yield* Effect.promise(() => rendering)).toMatchObject({
          message: "Browser retirement timed out",
        });
        expect(closeCalls).toBe(1);
        expect(killCalls).toBe(1);
        expect(killedWith).toBe("SIGKILL");
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves caller abort reasons after releasing the browser", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const operationStarted = deferred<void>();
        const closeStarted = deferred<void>();
        const releaseClose = deferred<void>();
        const abortReason = new Error("caller canceled");
        const controller = new AbortController();
        let closeCalls = 0;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            await releaseClose.promise;
          },
        };
        let rejection: unknown;
        let settled = false;
        const rendering = withBrowser(
          browserFactory(browser),
          100,
          async () => {
            operationStarted.resolve(undefined);
            await new Promise<void>(() => {});
          },
          () => new Error("render timed out"),
          { signal: controller.signal, clock, closeTimeoutMs: 1_000 },
        ).catch((error: unknown) => {
          rejection = error;
          settled = true;
        });

        yield* Effect.promise(() => operationStarted.promise);
        controller.abort(abortReason);
        yield* Effect.promise(() => closeStarted.promise);
        yield* TestClock.adjust(200); // A later render deadline cannot replace the caller's cancellation.
        expect(settled).toBe(false);
        expect(closeCalls).toBe(1);

        releaseClose.resolve(undefined);
        yield* Effect.promise(() => rendering);
        expect(settled).toBe(true);
        expect(rejection).toBe(abortReason);
        expect(closeCalls).toBe(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("releases a browser that arrives after acquisition times out", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const launch = deferred<MediaBrowser>();
        const launchStarted = deferred<void>();
        const closeStarted = deferred<void>();
        const releaseClose = deferred<void>();
        const timeoutError = new Error("launch timed out");
        let closeCalls = 0;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            await releaseClose.promise;
          },
        };
        const factory: BrowserFactory = {
          launch: async (): Promise<MediaBrowser> => {
            launchStarted.resolve(undefined);
            return launch.promise;
          },
        };
        let rejection: unknown;
        const rendering = withBrowser(
          factory,
          100,
          async () => "unreachable",
          () => timeoutError,
          { clock, closeTimeoutMs: 100 },
        ).catch((error: unknown) => {
          rejection = error;
        });

        yield* Effect.promise(() => launchStarted.promise);
        yield* TestClock.adjust(100);
        try {
          expect(rejection).toBeUndefined();
          expect(closeCalls).toBe(0);
        } finally {
          launch.resolve(browser);
        }
        yield* Effect.promise(() => closeStarted.promise);
        try {
          expect(rejection).toBeUndefined();
        } finally {
          releaseClose.resolve(undefined);
        }
        yield* Effect.promise(() => rendering);
        expect(rejection).toBe(timeoutError);
        expect(closeCalls).toBe(1);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("preserves operation failure identity while releasing exactly once", async () => {
    const failure = new Error("page failed");
    let closeCalls = 0;
    const browser: MediaBrowser = {
      newPage: async () => page,
      close: async (): Promise<void> => {
        closeCalls++;
      },
    };

    let rejection: unknown;
    try {
      await withBrowser(
        browserFactory(browser),
        1_000,
        async () => {
          throw failure;
        },
        () => new Error("render timed out"),
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBe(failure);
    expect(closeCalls).toBe(1);
  });
});
