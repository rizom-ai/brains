import { Cause, Effect, Exit, Scope } from "@brains/utils/effect";

/** Owns directory-sync runtime resources behind Promise-based boundaries. */
export class DirectorySyncRuntime {
  private readonly scope: Scope.CloseableScope;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor() {
    this.scope = Effect.runSync(Scope.make());
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
      Scope.extend(resource, this.scope),
    );
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
    return result.value;
  }

  close(): Promise<void> {
    this.closed = true;
    this.closePromise ??= this.closeScope();
    return this.closePromise;
  }

  private async closeScope(): Promise<void> {
    const result = await Effect.runPromiseExit(
      Scope.close(this.scope, Exit.void),
    );
    if (Exit.isFailure(result)) throw Cause.squash(result.cause);
  }
}
