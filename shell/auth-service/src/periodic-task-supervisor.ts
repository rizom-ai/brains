import {
  Cause,
  Clock,
  Effect,
  Exit,
  FiberSet,
  Scope,
} from "@brains/utils/effect";
import type { Clock as ClockType } from "@brains/utils/effect";

export interface PeriodicTaskSupervisorOptions {
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

/** Runs one non-overlapping supervised task immediately and on a fixed delay. @internal */
export class PeriodicTaskSupervisor {
  private readonly scope: Scope.CloseableScope;
  private readonly fibers: FiberSet.FiberSet<void, never>;
  private readonly intervalMs: number;
  private readonly task: (now: number) => Promise<void>;
  private readonly options: PeriodicTaskSupervisorOptions;
  private readonly activeTasks = new Set<Promise<void>>();
  private startPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    intervalMs: number,
    task: (now: number) => Promise<void>,
    options: PeriodicTaskSupervisorOptions = {},
  ) {
    this.intervalMs = Math.max(1, intervalMs);
    this.task = task;
    this.options = options;
    this.scope = Effect.runSync(Scope.make());
    this.fibers = Effect.runSync(
      Scope.extend(FiberSet.make<void, never>(), this.scope),
    );
  }

  start(): Promise<void> {
    this.startPromise ??= this.startSupervisor();
    return this.startPromise;
  }

  close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeSupervisor();
    return this.closePromise;
  }

  private taskEffect(): Effect.Effect<void> {
    return Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.tryPromise({
        try: () => this.trackTask(() => this.task(now)),
        catch: (error) => error,
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            this.options.onError?.(error);
          }),
        ),
      ),
    );
  }

  private withClock(effect: Effect.Effect<void>): Effect.Effect<void> {
    return this.options.clock
      ? Effect.withClock(effect, this.options.clock)
      : effect;
  }

  private async startSupervisor(): Promise<void> {
    await Effect.runPromise(this.withClock(this.taskEffect()));
    if (this.closed) return;

    const delay = this.options.clock
      ? Effect.sleep(this.intervalMs)
      : unrefSleep(this.intervalMs);
    const schedule = delay.pipe(
      Effect.andThen(this.taskEffect()),
      Effect.forever,
    );
    const fiber = Effect.runFork(this.withClock(schedule));
    FiberSet.unsafeAdd(this.fibers, fiber);
  }

  private trackTask(startTask: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();

    const task = startTask();
    this.activeTasks.add(task);
    return task.finally(() => {
      this.activeTasks.delete(task);
    });
  }

  private async closeSupervisor(): Promise<void> {
    const result = await Effect.runPromiseExit(
      Scope.close(this.scope, Exit.void),
    );
    await Promise.allSettled([...this.activeTasks]);
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
