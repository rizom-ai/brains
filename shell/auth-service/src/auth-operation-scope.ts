import { AsyncLocalStorage } from "node:async_hooks";
import { SerialQueue } from "@brains/utils/serial-queue";

interface OperationScope {
  active: boolean;
}

/** Owns facade operations without serializing their work. @internal */
export class AuthOperationScope {
  private readonly admission = new SerialQueue();
  private readonly context = new AsyncLocalStorage<OperationScope>();
  private readonly active = new Set<Promise<void>>();
  private closePromise: Promise<void> | undefined;
  private pendingCloses = 0;
  private backgroundOpen = true;

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()?.active) {
      // An admitted operation can finish its nested calls while close drains it.
      return this.admit(operation).result;
    }
    this.closePromise = undefined;
    return this.admission
      .run(() => {
        if (this.pendingCloses === 0) this.backgroundOpen = true;
        return this.admit(operation);
      })
      .then(({ result }) => result);
  }

  runBackground(operation: () => Promise<void>): Promise<void> {
    if (this.backgroundOpen) {
      return this.admit(operation).result;
    }
    // A scheduled tick must not queue behind the close that drains its supervisor.
    return Promise.resolve();
  }

  close(release: () => Promise<void>): Promise<void> {
    if (this.context.getStore()?.active) {
      return Promise.reject(
        new Error("Cannot close auth service from an active auth operation"),
      );
    }
    if (!this.closePromise) {
      this.pendingCloses += 1;
      this.backgroundOpen = false;
      this.closePromise = this.admission.run(async () => {
        try {
          // Nested operations may join after the first snapshot. No new external
          // operation enters until release settles, and every nested call is owned.
          while (this.active.size > 0) await Promise.all([...this.active]);
          await release();
        } finally {
          // No live operation remains. Release native context storage; run()
          // re-enables it when a subsequent lifetime admits work.
          this.context.disable();
          this.pendingCloses -= 1;
        }
      });
    }
    return this.closePromise;
  }

  private admit<T>(operation: () => Promise<T>): { result: Promise<T> } {
    const scope: OperationScope = { active: true };
    const result = Promise.resolve().then(() =>
      this.context.run(scope, operation),
    );
    const finish = (): void => {
      scope.active = false;
      this.active.delete(settled);
    };
    // Request failures belong to their callers, not to the shutdown barrier.
    const settled = result.then(finish, finish);
    this.active.add(settled);
    return { result };
  }
}
