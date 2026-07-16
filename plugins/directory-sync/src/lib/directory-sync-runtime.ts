import {
  Cause,
  Effect,
  Exit,
  FiberMap,
  FiberSet,
  Scope,
} from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";

interface DirectorySyncRuntimeOptions {
  clock?: Clock.Clock | undefined;
}

/** Owns directory-sync resources and supervised background work. @internal */
export class DirectorySyncRuntime {
  private readonly resourceScope: Scope.CloseableScope;
  private readonly scheduleScope: Scope.CloseableScope;
  private readonly periodicScope: Scope.CloseableScope;
  private readonly delayScope: Scope.CloseableScope;
  private readonly scheduleFibers: FiberSet.FiberSet<void, never>;
  private readonly periodicFibers: FiberMap.FiberMap<number, void, unknown>;
  private readonly delayedFibers: FiberMap.FiberMap<string, void, never>;
  private readonly clock: Clock.Clock | undefined;
  private readonly activeOperations = new Set<Promise<void>>();
  private readonly activeFailures: unknown[] = [];
  private nextPeriodicId = 0;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(options: DirectorySyncRuntimeOptions = {}) {
    this.resourceScope = Effect.runSync(Scope.make());
    this.scheduleScope = Effect.runSync(Scope.make());
    this.periodicScope = Effect.runSync(Scope.make());
    this.delayScope = Effect.runSync(Scope.make());
    this.scheduleFibers = Effect.runSync(
      Scope.extend(FiberSet.make<void, never>(), this.scheduleScope),
    );
    this.periodicFibers = Effect.runSync(
      Scope.extend(FiberMap.make<number, void, unknown>(), this.periodicScope),
    );
    this.delayedFibers = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.delayScope),
    );
    this.clock = options.clock;
  }

  async acquire<A>(
    acquire: () => Promise<A>,
    release: (resource: A) => Promise<void>,
  ): Promise<A> {
    if (this.closed) {
      throw new Error("Directory sync runtime is closed");
    }

    const resource = Effect.acquireRelease(Effect.promise(acquire), (value) =>
      Effect.promise(() => release(value)),
    );
    const result = await Effect.runPromiseExit(
      Scope.extend(resource, this.resourceScope),
    );
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
    return result.value;
  }

  /** Start one fixed-cadence schedule with one cancellable active callback. */
  schedulePeriodic(
    intervalMs: number,
    operation: (signal: AbortSignal) => Promise<void>,
  ): void {
    if (this.closed) return;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error("Periodic interval must be a positive finite number");
    }

    const key = this.nextPeriodicId++;
    const trigger = (): void => {
      if (this.closed || FiberMap.unsafeHas(this.periodicFibers, key)) return;

      const active = Effect.tryPromise({
        try: operation,
        catch: (error) => error,
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            this.activeFailures.push(error);
          }),
        ),
      );
      FiberMap.unsafeSet(this.periodicFibers, key, Effect.runFork(active), {
        onlyIfMissing: true,
      });
    };
    const schedule = Effect.sleep(intervalMs).pipe(
      Effect.andThen(Effect.sync(trigger)),
      Effect.forever,
    );
    const ownedSchedule = this.clock
      ? Effect.withClock(schedule, this.clock)
      : schedule;
    FiberSet.unsafeAdd(this.scheduleFibers, Effect.runFork(ownedSchedule));
  }

  /** Replace a pending trailing delay without interrupting work already started. */
  scheduleTrailing(
    key: string,
    delayMs: number,
    operation: () => Promise<void>,
  ): void {
    if (this.closed) return;

    const delayedStart = Effect.sleep(delayMs).pipe(
      Effect.andThen(
        Effect.sync(() => {
          this.trackActive(operation);
        }),
      ),
    );
    const ownedDelay = this.clock
      ? Effect.withClock(delayedStart, this.clock)
      : delayedStart;
    const fiber = Effect.runFork(ownedDelay);
    FiberMap.unsafeSet(this.delayedFibers, key, fiber);
  }

  close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeRuntime();
    return this.closePromise;
  }

  private trackActive(operation: () => Promise<void>): void {
    if (this.closed) return;

    let active: Promise<void>;
    try {
      active = operation();
    } catch (error) {
      active = Promise.reject(error);
    }

    const tracked = active
      .catch((error: unknown) => {
        this.activeFailures.push(error);
      })
      .finally(() => {
        this.activeOperations.delete(tracked);
      });
    this.activeOperations.add(tracked);
  }

  private async closeRuntime(): Promise<void> {
    const failures: unknown[] = [];
    const settle = async (operation: () => Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    };

    await settle(() => this.closeScope(this.scheduleScope));
    await settle(() => this.closeScope(this.periodicScope));
    await settle(() => this.closeScope(this.delayScope));
    await settle(() => this.closeScope(this.resourceScope));

    while (this.activeOperations.size > 0) {
      await Promise.all([...this.activeOperations]);
    }
    failures.push(...this.activeFailures);

    if (failures.length > 0) throw failures[0];
  }

  private async closeScope(scope: Scope.CloseableScope): Promise<void> {
    const result = await Effect.runPromiseExit(Scope.close(scope, Exit.void));
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
