import { Effect, Exit, Scope } from "effect";
import { runEffectPromise } from "../effect-runtime";

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

  public constructor() {
    this.scope = Effect.runSync(Scope.make());
  }

  /** Register cleanup in acquisition order; close runs it in reverse order. */
  public addFinalizer(finalizer: () => void | Promise<void>): void {
    if (this.closed) {
      throw new Error("Cannot register cleanup after shell shutdown");
    }
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.promise(async () => {
          await finalizer();
        }),
      ),
    );
  }

  /** Fork a background effect that is interrupted when the shell scope closes. */
  public async fork(effect: Effect.Effect<unknown>): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot start background work after shell shutdown");
    }
    await runEffectPromise(Effect.forkIn(effect, this.scope));
  }

  /** Close once. Effect scopes run registered finalizers in reverse order. */
  public async close(
    exit: Exit.Exit<unknown, unknown> = Exit.void,
  ): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await runEffectPromise(Scope.close(this.scope, exit));
  }
}
