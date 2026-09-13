import type { Worker } from "node:worker_threads";

export interface WorkerLifetimeHandlers {
  message(input: unknown): void;
  failure(error: Error): void;
  /** Protocol owner checks close acknowledgement and outstanding replies. */
  exit(code: number): void;
}

/** Parent-side lifecycle for one already spawned, budget-bound worker.
 * Creation/admission and native-close acknowledgement remain the caller's duties.
 * A termination request never resolves exit or releases resident reservations.
 */
export class WorkerLifetime {
  private readonly worker: Worker;
  private readonly completion = Promise.withResolvers<number>();
  public readonly exited: Promise<number> = this.completion.promise;
  public constructor(worker: Worker, handlers: WorkerLifetimeHandlers) {
    this.worker = worker;
    // Startup failure remains observable without an unhandled rejection before
    // the caller attaches its first close/transfer waiter.
    void this.exited.catch(() => undefined);
    worker.on("message", (input: unknown) => handlers.message(input));
    worker.on("error", (error) => handlers.failure(error));
    worker.once("exit", (code) => {
      this.completion.resolve(code);
      handlers.exit(code);
    });
  }
  public requestTermination(): void {
    void this.worker.terminate().catch((error: unknown) => {
      // Rejection means joining could not be confirmed, not that the worker exited.
      // Budget owners continue to listen for the actual exit event independently.
      this.completion.reject(error);
    });
  }
}
