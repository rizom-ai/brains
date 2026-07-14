import { Effect, Exit, FiberMap, Scope } from "@brains/effect-runtime";
import type { Clock } from "@brains/effect-runtime";

interface KeyedCleanupSupervisorRuntimeOptions {
  clock?: Clock.Clock;
}

/** Owns replaceable delayed cleanup fibers for one plugin instance. @internal */
export class KeyedCleanupSupervisor {
  private readonly scope: Scope.CloseableScope;
  private readonly fibers: FiberMap.FiberMap<string, void, never>;
  private readonly delayMs: number;
  private readonly clock: Clock.Clock | undefined;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  public constructor(
    delayMs: number,
    runtimeOptions?: KeyedCleanupSupervisorRuntimeOptions,
  ) {
    this.delayMs = delayMs;
    this.clock = runtimeOptions?.clock;
    this.scope = Effect.runSync(Scope.make());
    this.fibers = Effect.runSync(
      Scope.extend(FiberMap.make<string, void, never>(), this.scope),
    );
  }

  /** Replace any pending cleanup for the key and restart its delay. */
  public schedule(key: string, cleanup: () => void): void {
    if (this.closed) return;

    const delayedCleanup = Effect.sleep(this.delayMs).pipe(
      Effect.andThen(Effect.sync(cleanup)),
    );
    const ownedCleanup = this.clock
      ? Effect.withClock(delayedCleanup, this.clock)
      : delayedCleanup;
    const fiber = Effect.runFork(ownedCleanup);
    FiberMap.unsafeSet(this.fibers, key, fiber);
  }

  /** Interrupt every pending cleanup and reject future scheduling. */
  public close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= Effect.runPromise(Scope.close(this.scope, Exit.void));
    return this.closePromise;
  }
}
