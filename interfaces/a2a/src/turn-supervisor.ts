import {
  Cause,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Scope,
} from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

interface A2ATurnSupervisorOptions {
  clock?: Clock.Clock | undefined;
}

interface HeartbeatSchedule {
  intervalMs: number;
  tick(): void;
}

interface StartTurnOptions {
  onCancel(): void;
  heartbeat?: HeartbeatSchedule | undefined;
}

interface ActiveTurn {
  controller: AbortController;
  onCancel: () => void;
  canceled: boolean;
  fiber?: Fiber.RuntimeFiber<void, never> | undefined;
}

/** Owns in-flight A2A turns and their heartbeat schedules. @internal */
export class A2ATurnSupervisor {
  private readonly scope: Scope.CloseableScope;
  private readonly fibers: FiberMap.FiberMap<string, void, never>;
  private readonly active = new Map<string, ActiveTurn>();
  private readonly clock: Clock.Clock | undefined;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(options: A2ATurnSupervisorOptions = {}) {
    this.clock = options.clock;
    this.scope = Effect.runSync(Scope.make());
    this.fibers = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.scope),
    );
  }

  start(
    taskId: string,
    operation: (signal: AbortSignal) => Promise<void>,
    options: StartTurnOptions,
  ): boolean {
    if (this.closed) {
      options.onCancel();
      return false;
    }
    if (this.active.has(taskId)) {
      throw new Error(`A2A task is already active: ${taskId}`);
    }

    const entry: ActiveTurn = {
      controller: new AbortController(),
      onCancel: options.onCancel,
      canceled: false,
    };
    this.active.set(taskId, entry);

    const work = Effect.tryPromise({
      try: (lifecycleSignal) =>
        operation(AbortSignal.any([lifecycleSignal, entry.controller.signal])),
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.void));

    const heartbeat = options.heartbeat;
    const supervised = heartbeat
      ? Effect.scoped(
          Effect.gen(function* () {
            const schedule = Effect.sleep(heartbeat.intervalMs).pipe(
              Effect.andThen(Effect.sync(() => heartbeat.tick())),
              Effect.forever,
            );
            yield* Effect.forkScoped(schedule);
            yield* work;
          }),
        )
      : work;
    const timed = this.clock
      ? Effect.withClock(supervised, this.clock)
      : supervised;
    const owned = timed.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (this.active.get(taskId) === entry) {
            this.active.delete(taskId);
          }
        }),
      ),
    );

    const fiber = Effect.runFork(owned);
    entry.fiber = fiber;
    FiberMap.unsafeSet(this.fibers, taskId, fiber);
    return true;
  }

  cancel(
    taskId: string,
    reason: unknown = new Error("A2A task canceled"),
  ): boolean {
    const entry = this.active.get(taskId);
    if (!entry) return false;

    if (!entry.canceled) {
      entry.canceled = true;
      entry.onCancel();
      entry.controller.abort(reason);
    }
    if (entry.fiber) {
      Effect.runSync(Fiber.interruptFork(entry.fiber));
    }
    return true;
  }

  close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeSupervisor();
    return this.closePromise;
  }

  private async closeSupervisor(): Promise<void> {
    for (const taskId of [...this.active.keys()]) {
      this.cancel(taskId, new Error("A2A interface stopped"));
    }

    const result = await Effect.runPromiseExit(
      Scope.close(this.scope, Exit.void),
    );
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
