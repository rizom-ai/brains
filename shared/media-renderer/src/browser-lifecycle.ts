import { Cause, Effect, Exit, Option } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import type { BrowserFactory, MediaBrowser } from "./renderer";

const DEFAULT_BROWSER_CLOSE_TIMEOUT_MS = 5_000;

interface BrowserLifecycleOptions {
  signal?: AbortSignal | undefined;
  closeTimeoutMs?: number | undefined;
  clock?: Clock.Clock | undefined;
}

export async function withBrowser<T>(
  browserFactory: BrowserFactory,
  timeoutMs: number,
  operation: (browser: MediaBrowser) => Promise<T>,
  onTimeout: () => unknown,
  options: BrowserLifecycleOptions = {},
): Promise<T> {
  const closeTimeoutMs =
    options.closeTimeoutMs ?? DEFAULT_BROWSER_CLOSE_TIMEOUT_MS;
  let acquired: MediaBrowser | undefined;
  let released = false;
  const release = (browser: MediaBrowser): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (released) return Effect.void;
      released = true;
      const cleanup = closeBrowser(browser, closeTimeoutMs);
      const timedCleanup = options.clock
        ? Effect.withClock(cleanup, options.clock)
        : cleanup;
      // Finalizers are uninterruptible. Run the bounded close in its own
      // interruptible runtime, but await it so release still drains.
      return Effect.promise(() => Effect.runPromise(timedCleanup));
    });
  const acquire = acquireBrowser(
    browserFactory,
    (browser) => {
      acquired = browser;
    },
    release,
  );
  const use = (browser: MediaBrowser): Effect.Effect<T, unknown> =>
    Effect.tryPromise({
      try: () => operation(browser),
      catch: (error) => error,
    });
  // The outer lease closes the cancellation gap during launch. Once acquired,
  // acquireUseRelease owns the ordinary render and exact-once release path.
  const managed = Effect.scoped(
    Effect.flatMap(
      Effect.acquireReleaseInterruptible(acquire, () =>
        acquired ? release(acquired) : Effect.void,
      ),
      (browser) =>
        Effect.acquireUseRelease(Effect.succeed(browser), use, release),
    ),
  ).pipe(
    Effect.timeoutFail({
      duration: timeoutMs,
      onTimeout,
    }),
  );
  const timed = options.clock
    ? Effect.withClock(managed, options.clock)
    : managed;
  const exit = await Effect.runPromiseExit(timed, {
    ...(options.signal && { signal: options.signal }),
  });

  if (Exit.isFailure(exit)) {
    if (options.signal?.aborted) throw options.signal.reason;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isSome(failure)) throw failure.value;
    throw Cause.squash(exit.cause);
  }
  return exit.value;
}

function acquireBrowser(
  browserFactory: BrowserFactory,
  onAcquired: (browser: MediaBrowser) => void,
  release: (browser: MediaBrowser) => Effect.Effect<void>,
): Effect.Effect<MediaBrowser, unknown> {
  return Effect.async<MediaBrowser, unknown>((resume) => {
    let canceled = false;
    const launch = Promise.resolve().then(() => browserFactory.launch());

    launch.then(
      (browser) => {
        if (canceled) {
          void Effect.runPromise(release(browser));
          return;
        }
        onAcquired(browser);
        resume(Effect.succeed(browser));
      },
      (error: unknown) => {
        if (!canceled) resume(Effect.fail(error));
      },
    );

    return Effect.sync(() => {
      canceled = true;
    });
  });
}

function closeBrowser(
  browser: MediaBrowser,
  timeoutMs: number,
): Effect.Effect<void> {
  const close = Effect.tryPromise({
    try: () => browser.close(),
    catch: (error) => error,
  }).pipe(Effect.timeoutOption(Math.max(1, timeoutMs)));

  return close.pipe(
    Effect.flatMap((result) =>
      Option.isNone(result) ? killBrowser(browser) : Effect.void,
    ),
    Effect.catchAll(() => killBrowser(browser)),
  );
}

function killBrowser(browser: MediaBrowser): Effect.Effect<void> {
  return Effect.sync(() => {
    try {
      browser.process?.()?.kill("SIGKILL");
    } catch {
      // Process may already be dead; nothing more can be done.
    }
  });
}
