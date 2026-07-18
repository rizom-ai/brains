import {
  Cause,
  Clock,
  Effect,
  Exit,
  FiberSet,
  Scope,
} from "@brains/utils/effect";
import type { Clock as ClockType } from "@brains/utils/effect";

interface SessionEvictionSupervisorOptions {
  clock?: ClockType.Clock | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

function unrefSleep(durationMs: number): Effect.Effect<void> {
  return Effect.async<void>((resume) => {
    const timer = setTimeout(() => resume(Effect.void), durationMs);
    timer.unref();
    return Effect.sync(() => clearTimeout(timer));
  });
}

/** Owns the MCP HTTP idle-session sweep and drains admitted sweeps. @internal */
export class SessionEvictionSupervisor {
  private readonly scope: Scope.CloseableScope;
  private readonly fibers: FiberSet.FiberSet<void, never>;
  private readonly activeSweeps = new Set<Promise<void>>();
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    intervalMs: number,
    sweep: (now: number) => Promise<void>,
    options: SessionEvictionSupervisorOptions = {},
  ) {
    this.scope = Effect.runSync(Scope.make());
    this.fibers = Effect.runSync(
      Scope.extend(FiberSet.make<void, never>(), this.scope),
    );

    const runSweep = Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.tryPromise({
        try: () => this.trackSweep(() => sweep(now)),
        catch: (error) => error,
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            options.onError?.(error);
          }),
        ),
      ),
    );
    const interval = Math.max(1, intervalMs);
    const schedule = (
      options.clock ? Effect.sleep(interval) : unrefSleep(interval)
    ).pipe(Effect.andThen(runSweep), Effect.forever);
    const timed = options.clock
      ? Effect.withClock(schedule, options.clock)
      : schedule;
    FiberSet.unsafeAdd(this.fibers, Effect.runFork(timed));
  }

  close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeSupervisor();
    return this.closePromise;
  }

  private trackSweep(startSweep: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();

    const sweep = startSweep();
    this.activeSweeps.add(sweep);
    return sweep.finally(() => {
      this.activeSweeps.delete(sweep);
    });
  }

  private async closeSupervisor(): Promise<void> {
    const result = await Effect.runPromiseExit(
      Scope.close(this.scope, Exit.void),
    );
    await Promise.allSettled([...this.activeSweeps]);
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
