import type { IJobQueueService, JobHandler } from "@brains/job-queue";

export const IMPORT_JOB_TYPE = "directory-sync:directory-import";

type Queue = Pick<
  IJobQueueService,
  "dequeue" | "getHandler" | "unregisterHandler" | "getActiveJobs"
>;

/**
 * Fixture-only seam for an execution-only borrower; owner validation stays live.
 * Install during plugin registration, BEFORE workers can dequeue.
 * No scheduler writes, global patches or whole-worker pause.
 */
export class ImportClaimHold {
  private readonly queue: Queue;
  private readonly handler: JobHandler;
  private readonly originalDescriptor: PropertyDescriptor | undefined;
  private readonly trackedDequeue: Queue["dequeue"];
  private readonly claims = new Set<Promise<void>>();
  private phase: "running" | "holding" | "held" | "closed" = "running";
  private drain: Promise<void> = Promise.resolve();
  private pendingHold: Promise<boolean> | undefined;
  private closing: Promise<void> | undefined;
  private claimFailed = false;
  private claimFailure: unknown;

  public constructor(queue: Queue) {
    const handler = queue.getHandler(IMPORT_JOB_TYPE);
    if (!handler)
      throw new Error("Import hold requires an executable import handler");
    this.queue = queue;
    this.handler = handler;
    this.originalDescriptor = Object.getOwnPropertyDescriptor(queue, "dequeue");
    const original = queue.dequeue.bind(queue);
    this.trackedDequeue = async (
      claim,
      excludeTypes = [],
    ): ReturnType<Queue["dequeue"]> => {
      if (this.phase === "closed") throw new Error("Import hold is closed");
      const exclusions =
        this.phase === "running"
          ? excludeTypes
          : [...new Set([...excludeTypes, IMPORT_JOB_TYPE])];
      const advertisedImport =
        !exclusions.includes(IMPORT_JOB_TYPE) &&
        queue.getHandler(IMPORT_JOB_TYPE) !== undefined;
      const settled = Promise.withResolvers<void>();
      this.claims.add(settled.promise);
      try {
        return await original(claim, exclusions);
      } catch (error) {
        if (advertisedImport) {
          this.claimFailed = true;
          this.claimFailure = error;
        }
        throw error;
      } finally {
        this.claims.delete(settled.promise);
        settled.resolve();
      }
    };
    Object.defineProperty(queue, "dequeue", {
      value: this.trackedDequeue,
      writable: true,
      configurable: true,
    });
  }

  /** Repeat until true on EVERY borrower, before starting the producer edit. */
  public hold(): Promise<boolean> {
    if (this.phase === "closed")
      return Promise.reject(new Error("Import hold is closed"));
    if (!this.ownsSeam())
      return Promise.reject(
        new Error("Import hold no longer owns the dequeue seam"),
      );
    if (
      this.phase !== "running" &&
      this.queue.getHandler(IMPORT_JOB_TYPE) !== this.handler
    )
      return Promise.reject(
        new Error("Import handler was replaced while held"),
      );
    if (this.phase === "held")
      return this.claimFailed
        ? Promise.reject(this.uncertainClaimError())
        : (this.pendingHold ?? Promise.resolve(true));
    if (this.phase === "running") {
      if (this.queue.getHandler(IMPORT_JOB_TYPE) !== this.handler)
        return Promise.reject(new Error("Import handler changed before hold"));
      this.phase = "holding";
      // Snapshot only pre-hold claims. Later claims cannot advertise imports
      // and must remain free to service unrelated work.
      this.drain = Promise.all([...this.claims]).then((): void => {});
    }
    this.pendingHold ??= this.checkQuiescence().finally((): void => {
      this.pendingHold = undefined;
    });
    return this.pendingHold;
  }

  private async checkQuiescence(): Promise<boolean> {
    await this.drain;
    this.assertOpen();
    if (this.claimFailed) throw this.uncertainClaimError();
    const active = await this.queue.getActiveJobs([IMPORT_JOB_TYPE]);
    this.assertOpen();
    if (!this.ownsSeam())
      throw new Error("Import hold no longer owns the dequeue seam");
    if (this.queue.getHandler(IMPORT_JOB_TYPE) !== this.handler)
      throw new Error("Import handler was replaced while held");
    if (active.some((job) => job.status === "processing")) return false;
    this.phase = "held";
    return true;
  }

  public release(): void {
    this.assertOpen();
    if (this.claimFailed) throw this.uncertainClaimError();
    if (!this.ownsSeam())
      throw new Error("Import hold no longer owns the dequeue seam");
    if (this.phase === "running") return;
    if (this.phase !== "held" || this.pendingHold)
      throw new Error("Import claims have not quiesced");
    if (this.queue.getHandler(IMPORT_JOB_TYPE) !== this.handler)
      throw new Error("Import handler was replaced while held");
    this.phase = "running";
  }

  /** Join control/claim calls and remove the seam, never revive a shutdown handler. */
  public close(): Promise<void> {
    this.closing ??= this.retire();
    return this.closing;
  }

  private async retire(): Promise<void> {
    this.phase = "closed";
    if (this.queue.getHandler(IMPORT_JOB_TYPE) === this.handler)
      this.queue.unregisterHandler(IMPORT_JOB_TYPE);
    // A closing hold rejects to its caller; retirement still joins that read.
    await Promise.allSettled([
      ...this.claims,
      ...(this.pendingHold ? [this.pendingHold] : []),
    ]);
    if (!this.ownsSeam())
      throw new Error("Import hold no longer owns the dequeue seam");
    if (this.originalDescriptor)
      Object.defineProperty(this.queue, "dequeue", this.originalDescriptor);
    else if (!Reflect.deleteProperty(this.queue, "dequeue"))
      throw new Error("Could not retire the import dequeue seam");
  }

  private uncertainClaimError(): Error {
    return new Error(
      "Import claim outcome is uncertain; do not acknowledge or replay",
      { cause: this.claimFailure },
    );
  }

  private ownsSeam(): boolean {
    return (
      Object.getOwnPropertyDescriptor(this.queue, "dequeue")?.value ===
      this.trackedDequeue
    );
  }

  private assertOpen(): void {
    if (this.phase === "closed") throw new Error("Import hold is closed");
  }
}
