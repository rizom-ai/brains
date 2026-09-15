import { Cause, Effect, Exit, Option } from "@brains/utils/effect";
import { isPromise } from "node:util/types";
import type { Clock } from "@brains/utils/effect";
import type {
  BrowserFactory,
  BrowserProcess,
  MediaBrowser,
} from "./browser-types";

const DEFAULT_BROWSER_CLOSE_TIMEOUT_MS = 5_000;
interface BrowserLifecycleOptions {
  signal?: AbortSignal | undefined;
  closeTimeoutMs?: number | undefined;
  clock?: Clock.Clock | undefined;
}
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function withBrowser<T>(
  browserFactory: BrowserFactory,
  timeoutMs: number,
  operation: (browser: MediaBrowser) => Promise<T>,
  onTimeout: () => unknown,
  options: BrowserLifecycleOptions = {},
): Promise<T> {
  options.signal?.throwIfAborted();
  let acquired: MediaBrowser | undefined;
  let retirement: Promise<void> | undefined;
  const cleanupErrors: unknown[] = [];
  const state: { failure?: { error: unknown } } = {};
  const rememberFailure = (error: unknown): Effect.Effect<void> =>
    Effect.sync(() => {
      state.failure ??= { error };
    });
  const release = (browser: MediaBrowser): Effect.Effect<void> =>
    Effect.promise(() => {
      // Every finalizer joins the same retirement, including acquisition races.
      retirement ??= (async (): Promise<void> => {
        const cleanup = closeBrowser(
          browser,
          options.closeTimeoutMs ?? DEFAULT_BROWSER_CLOSE_TIMEOUT_MS,
        );
        const result = await Effect.runPromiseExit(
          options.clock ? Effect.withClock(cleanup, options.clock) : cleanup,
        );
        if (Exit.isFailure(result))
          cleanupErrors.push(failureValue(result.cause));
      })();
      return retirement;
    });
  const acquire = acquireBrowser(
    browserFactory,
    (browser) => {
      acquired = browser;
    },
    release,
    cleanupErrors,
    options.signal,
  ).pipe(Effect.tapError(rememberFailure));
  const use = (browser: MediaBrowser): Effect.Effect<T, unknown> =>
    Effect.tryPromise({
      try: () => operation(browser),
      catch: (error) => error,
    }).pipe(Effect.tapError(rememberFailure));
  const managed = Effect.scoped(
    Effect.flatMap(
      Effect.acquireReleaseInterruptible(acquire, () =>
        acquired ? release(acquired) : Effect.void,
      ),
      (browser) =>
        Effect.acquireUseRelease(Effect.succeed(browser), use, release),
    ),
  );
  // Record the deadline before interrupting/joining the losing scope. A later
  // caller abort during retirement must not replace the original failure.
  const deadline = Effect.sleep(timeoutMs).pipe(
    Effect.flatMap(() => {
      const error = onTimeout();
      state.failure ??= { error };
      return Effect.fail(error);
    }),
  );
  const timed = Effect.raceFirst(managed, deadline);
  const exit = await Effect.runPromiseExit(
    options.clock ? Effect.withClock(timed, options.clock) : timed,
    {
      ...(options.signal && { signal: options.signal }),
    },
  );
  if (Exit.isFailure(exit)) {
    const primary = state.failure
      ? state.failure.error
      : options.signal?.aborted
        ? options.signal.reason
        : failureValue(exit.cause);
    throw combineFailures([primary, ...cleanupErrors]);
  }
  if (cleanupErrors.length) throw combineFailures(cleanupErrors);
  return exit.value;
}

function acquireBrowser(
  factory: BrowserFactory,
  onAcquired: (browser: MediaBrowser) => void,
  release: (browser: MediaBrowser) => Effect.Effect<void>,
  cleanupErrors: unknown[],
  caller?: AbortSignal,
): Effect.Effect<MediaBrowser, unknown> {
  return Effect.async<MediaBrowser, unknown>((resume) => {
    let cancelled = false;
    const controller = new AbortController();
    const launch = observe(() => factory.launch(controller.signal));
    void launch.then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        onAcquired(outcome.value);
        resume(Effect.succeed(outcome.value));
      } else resume(Effect.fail(outcome.error));
    });
    return Effect.suspend(() => {
      cancelled = true;
      controller.abort(
        caller?.aborted
          ? caller.reason
          : new Error("Browser acquisition cancelled"),
      );
      // Launch may ignore cancellation. Never detach its eventual browser or
      // report retirement before its rejection/late browser cleanup settles.
      return Effect.promise(async () => {
        const outcome = await launch;
        if (outcome.ok) await Effect.runPromise(release(outcome.value));
        else if (!Object.is(outcome.error, controller.signal.reason))
          cleanupErrors.push(outcome.error);
      });
    });
  });
}

function closeBrowser(
  browser: MediaBrowser,
  timeoutMs: number,
): Effect.Effect<void, unknown> {
  return Effect.suspend(() => {
    const errors: unknown[] = [];
    let child: BrowserProcess | null | undefined;
    let exitAcknowledged = false;
    try {
      child = browser.process?.();
    } catch (error) {
      errors.push(error);
    }
    const close = observe(() => browser.close());
    const exited = observe(async (): Promise<void> => {
      // A view-only adapter has no process receipt. This does not upgrade it
      // into an owned browser suitable for a rendering actor.
      if (!child) return;
      const receipt: unknown = child.exited;
      if (!isPromise(receipt))
        throw new Error("Browser process has no exit receipt");
      const code = await receipt;
      if (typeof code !== "number" || !Number.isSafeInteger(code) || code < 0)
        throw new Error("Browser process returned an invalid exit receipt");
      exitAcknowledged = true;
    });
    return Effect.gen(function* () {
      const graceful = yield* Effect.exit(
        Effect.all([fromOutcome(close), fromOutcome(exited)]).pipe(
          Effect.timeoutFail({
            duration: Math.max(1, timeoutMs),
            onTimeout: () => new Error("Browser retirement timed out"),
          }),
        ),
      );
      if (Exit.isFailure(graceful)) errors.push(failureValue(graceful.cause));
      if (errors.length && child && !exitAcknowledged) {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          errors.push(error);
        }
      }
      // The timeout bounds the grace period, not acknowledged retirement.
      // Even escalation cannot retract a pending close or manufacture exit.
      const outcomes = yield* Effect.promise(() =>
        Promise.all([close, exited]),
      );
      for (const outcome of outcomes)
        if (!outcome.ok) errors.push(outcome.error);
      if (errors.length) return yield* Effect.fail(combineFailures(errors));
    });
  });
}

async function observe<T>(body: () => T | Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await body() };
  } catch (error) {
    return { ok: false, error };
  }
}
function fromOutcome<T>(
  promise: Promise<Outcome<T>>,
): Effect.Effect<T, unknown> {
  return Effect.flatMap(
    Effect.promise(() => promise),
    (outcome) =>
      outcome.ok ? Effect.succeed(outcome.value) : Effect.fail(outcome.error),
  );
}
function failureValue(cause: Cause.Cause<unknown>): unknown {
  const failure = Cause.failureOption(cause);
  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
function combineFailures(errors: unknown[]): unknown {
  const unique = errors.filter(
    (error, index) =>
      errors.findIndex((candidate) => Object.is(candidate, error)) === index,
  );
  return unique.length === 1
    ? unique[0]
    : new AggregateError(unique, "Browser operation and retirement failed", {
        cause: unique[0],
      });
}
