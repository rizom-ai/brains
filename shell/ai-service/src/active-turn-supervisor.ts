import { Cause, Effect, Exit, Fiber, FiberSet, Scope } from "effect";

interface TurnSupervisorRuntime {
  scope: Scope.CloseableScope;
  fibers: FiberSet.FiberSet<unknown, unknown>;
}

/** Owns active agent turns and links Promise cancellation to fiber interruption. */
export class ActiveTurnSupervisor {
  private readonly runtime: TurnSupervisorRuntime;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  public constructor() {
    const scope = Effect.runSync(Scope.make());
    const fibers = Effect.runSync(
      Scope.extend(FiberSet.make<unknown, unknown>(), scope),
    );
    this.runtime = { scope, fibers };
  }

  public async run<A>(
    operation: (signal: AbortSignal) => Promise<A>,
    signal?: AbortSignal,
  ): Promise<A> {
    if (this.closed) {
      throw new Error("Agent service has been shut down");
    }
    signal?.throwIfAborted();

    const fiber = Effect.runFork(
      Effect.tryPromise({
        try: operation,
        catch: (error) => error,
      }),
    );
    FiberSet.unsafeAdd(this.runtime.fibers, fiber);

    const interrupt = (): void => {
      Effect.runSync(Fiber.interruptFork(fiber));
    };
    signal?.addEventListener("abort", interrupt, { once: true });
    if (signal?.aborted) interrupt();

    try {
      const exit = await Effect.runPromise(Fiber.await(fiber));
      if (Exit.isSuccess(exit)) return exit.value;
      if (signal?.aborted) throw signal.reason;
      throw Cause.squash(exit.cause);
    } finally {
      signal?.removeEventListener("abort", interrupt);
    }
  }

  public close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= Effect.runPromise(
      Scope.close(this.runtime.scope, Exit.void),
    );
    return this.closePromise;
  }
}
