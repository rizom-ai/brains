import {
  Cause,
  Clock,
  Effect,
  Exit,
  FiberSet,
  Scope,
} from "@brains/utils/effect";
import type { Clock as ClockType } from "@brains/utils/effect";

interface OAuthClientMaintenanceSupervisorOptions {
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

/** Owns scheduled OAuth-client pruning and drains admitted maintenance. @internal */
export class OAuthClientMaintenanceSupervisor {
  private readonly scope: Scope.CloseableScope;
  private readonly fibers: FiberSet.FiberSet<void, never>;
  private readonly intervalMs: number;
  private readonly maintenance: (now: number) => Promise<void>;
  private readonly options: OAuthClientMaintenanceSupervisorOptions;
  private readonly activeMaintenance = new Set<Promise<void>>();
  private startPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    intervalMs: number,
    maintenance: (now: number) => Promise<void>,
    options: OAuthClientMaintenanceSupervisorOptions = {},
  ) {
    this.intervalMs = Math.max(1, intervalMs);
    this.maintenance = maintenance;
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

  private maintenanceEffect(): Effect.Effect<void> {
    return Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.tryPromise({
        try: () => this.trackMaintenance(() => this.maintenance(now)),
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
    await Effect.runPromise(this.withClock(this.maintenanceEffect()));
    if (this.closed) return;

    const delay = this.options.clock
      ? Effect.sleep(this.intervalMs)
      : unrefSleep(this.intervalMs);
    const schedule = delay.pipe(
      Effect.andThen(this.maintenanceEffect()),
      Effect.forever,
    );
    const fiber = Effect.runFork(this.withClock(schedule));
    FiberSet.unsafeAdd(this.fibers, fiber);
  }

  private trackMaintenance(
    startMaintenance: () => Promise<void>,
  ): Promise<void> {
    if (this.closed) return Promise.resolve();

    const maintenance = startMaintenance();
    this.activeMaintenance.add(maintenance);
    return maintenance.finally(() => {
      this.activeMaintenance.delete(maintenance);
    });
  }

  private async closeSupervisor(): Promise<void> {
    const result = await Effect.runPromiseExit(
      Scope.close(this.scope, Exit.void),
    );
    await Promise.allSettled([...this.activeMaintenance]);
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
