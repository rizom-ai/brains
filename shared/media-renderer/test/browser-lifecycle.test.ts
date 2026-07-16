import { describe, expect, it } from "bun:test";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { withBrowser } from "../src/browser-lifecycle";
import type { BrowserFactory, MediaBrowser, MediaPage } from "../src/renderer";

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

  it("bounds a hung close and kills the browser process", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const closeStarted = deferred<void>();
        let closeCalls = 0;
        let killCalls = 0;
        let killedWith: string | number | undefined;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            await new Promise<void>(() => {});
          },
          process: () => ({
            kill: (signal?: string | number): boolean => {
              killCalls++;
              killedWith = signal;
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
        ).then((result) => {
          settled = true;
          return result;
        });

        yield* Effect.promise(() => closeStarted.promise);
        yield* TestClock.adjust(99);
        expect(settled).toBe(false);
        expect(killCalls).toBe(0);

        yield* TestClock.adjust(1);
        expect(yield* Effect.promise(() => rendering)).toBe("rendered");
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
          1_000,
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
        const closeFinished = deferred<void>();
        const timeoutError = new Error("launch timed out");
        let closeCalls = 0;
        const browser: MediaBrowser = {
          newPage: async () => page,
          close: async (): Promise<void> => {
            closeCalls++;
            closeStarted.resolve(undefined);
            closeFinished.resolve(undefined);
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
        yield* Effect.promise(() => rendering);
        expect(rejection).toBe(timeoutError);
        expect(closeCalls).toBe(0);

        launch.resolve(browser);
        yield* Effect.promise(() => closeStarted.promise);
        yield* Effect.promise(() => closeFinished.promise);
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
