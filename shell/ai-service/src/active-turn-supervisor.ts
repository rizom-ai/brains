import { deferred } from "@brains/utils/deferred";
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  FiberSet,
  Scope,
} from "@brains/utils/effect";

interface TurnSupervisorRuntime {
  scope: Scope.Closeable;
  fibers: FiberSet.FiberSet<unknown, unknown>;
}

/** Cancels turn observations while retaining admitted work until shutdown drains it. */
export class ActiveTurnSupervisor {
  private readonly runtime: TurnSupervisorRuntime;
  private readonly activeOperations = new Set<Promise<unknown>>();
  private closePromise: Promise<void> | null = null;
  private closed = false;

  public constructor() {
    const scope = Effect.runSync(Scope.make());
    const fibers = Effect.runSync(
      Scope.provide(FiberSet.make<unknown, unknown>(), scope),
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
        try: (operationSignal) =>
          this.trackOperation(operation, operationSignal),
        catch: (error) => error,
      }),
    );
    FiberSet.addUnsafe(this.runtime.fibers, fiber);

    const interrupt = (): void => {
      fiber.interruptUnsafe();
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
    // Publish the shared close before abort listeners can reenter it.
    this.closePromise ??= Promise.resolve().then(() => this.closeSupervisor());
    return this.closePromise;
  }

  private trackOperation<A>(
    operation: (signal: AbortSignal) => Promise<A>,
    signal: AbortSignal,
  ): Promise<A> {
    const work = deferred<A>();
    this.activeOperations.add(work.promise);
    const clear = (): void => {
      this.activeOperations.delete(work.promise);
    };
    void work.promise.then(clear, clear);
    try {
      // Ownership precedes the adapter call, which may reenter close().
      void operation(signal).then(work.resolve, work.reject);
    } catch (error) {
      // Synchronous adapter failures must settle the published owner too.
      work.reject(error);
    }
    return work.promise;
  }

  private async closeSupervisor(): Promise<void> {
    const exit = await Effect.runPromiseExit(
      Scope.close(this.runtime.scope, Exit.void),
    );
    // Interrupting an observation cannot terminate its underlying Promise.
    await Promise.allSettled([...this.activeOperations]);
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  }
}
