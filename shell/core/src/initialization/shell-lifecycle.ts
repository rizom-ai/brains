import { Cause, Effect, Exit, Layer, Scope } from "@brains/utils/effect";
import type { Context } from "@brains/utils/effect";
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

  /** Build a synchronous scoped layer owned by this shell lifecycle. */
  public buildLayer<ROut>(
    layer: Layer.Layer<ROut, never, never>,
  ): Context.Context<ROut> {
    this.assertOpen();
    const exit = Effect.runSyncExit(Layer.buildWithScope(layer, this.scope));
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
    return exit.value;
  }

  /** Register cleanup in acquisition order; close runs it in reverse order. */
  public addFinalizer(finalizer: () => void | Promise<void>): void {
    this.assertOpen();
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.promise(async () => {
          await finalizer();
        }),
      ),
    );
  }

  /** Register synchronous acquisition cleanup that can roll back construction. */
  public addSyncFinalizer(finalizer: () => void): void {
    this.assertOpen();
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.sync(() => {
          finalizer();
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

  /** Roll back synchronous service acquisition from a throwing constructor. */
  public closeSync(exit: Exit.Exit<unknown, unknown>): void {
    if (this.closed) return;
    this.closed = true;
    Effect.runSync(Scope.close(this.scope, exit));
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Cannot register cleanup after shell shutdown");
    }
  }
}
