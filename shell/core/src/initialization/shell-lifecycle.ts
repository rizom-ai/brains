import { Cause, Effect, Exit, Scope } from "effect";

async function runEffect<A>(effect: Effect.Effect<A>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/**
 * Owns resources whose lifetime matches one Shell instance.
 *
 * The scope is created with the Shell, retained after successful boot, and
 * closed on shutdown or boot failure. Public Shell APIs remain Promise-based;
 * Effect is an internal lifecycle implementation detail.
 */
export class ShellLifecycle {
  private readonly scope: Scope.CloseableScope;
  private closed = false;

  public constructor(finalizer: () => Promise<void>) {
    this.scope = Effect.runSync(Scope.make());
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.promise(() => finalizer()),
      ),
    );
  }

  /** Fork a background effect that is interrupted when the shell scope closes. */
  public async fork(effect: Effect.Effect<unknown>): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot start background work after shell shutdown");
    }
    await runEffect(Effect.forkIn(effect, this.scope));
  }

  /** Close once. Effect scopes run registered finalizers in reverse order. */
  public async close(
    exit: Exit.Exit<unknown, unknown> = Exit.void,
  ): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await runEffect(Scope.close(this.scope, exit));
  }
}
