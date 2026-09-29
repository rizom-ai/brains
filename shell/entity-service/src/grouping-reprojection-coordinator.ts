import type { GroupingProjectionTarget } from "./grouping-projection-state";

interface ReprojectionDependencies {
  pending(): GroupingProjectionTarget[];
  complete(targets: readonly GroupingProjectionTarget[]): void;
  refresh(): Promise<void>;
  project(
    targets: readonly GroupingProjectionTarget[] | undefined,
  ): Promise<void>;
}

/** Caller-triggered scans only: no timers, durable jobs or persistent readiness. */
export class GroupingReprojection {
  private readonly dependencies: ReprojectionDependencies;
  private running: Promise<void> | undefined;
  private initialized = false;
  private fullRequested = false;
  private closedError: Error | undefined;

  constructor(dependencies: ReprojectionDependencies) {
    this.dependencies = dependencies;
  }

  public isReady(): boolean {
    return (
      !this.closedError && this.initialized && !this.running && !this.hasWork()
    );
  }

  public invalidate(): void {
    this.initialized = false;
  }

  /** Fence new scans synchronously and join the currently owned scan. */
  public async close(): Promise<void> {
    this.closedError ??= new Error("Grouping reprojection is closed");
    await this.running;
  }

  public run(full = false): Promise<void> {
    if (this.closedError) return Promise.reject(this.closedError);
    if (this.running) {
      this.fullRequested ||= full;
      return this.running;
    }
    this.fullRequested ||= full || !this.initialized;
    if (this.isReady()) return Promise.resolve();
    this.running = this.drain()
      .catch((error: unknown) => {
        this.invalidate();
        throw error;
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private hasWork(): boolean {
    return this.fullRequested || this.dependencies.pending().length > 0;
  }

  private async drain(): Promise<void> {
    for (let pass = 0; pass < 4; pass++) {
      await this.dependencies.refresh();
      const targets = this.dependencies.pending();
      const full = this.fullRequested;
      this.fullRequested = false;
      try {
        if (full || targets.length > 0)
          await this.dependencies.project(full ? undefined : targets);
      } catch (error) {
        this.fullRequested ||= full;
        throw error;
      }
      this.dependencies.complete(targets);
      // A source change during the pass cannot publish readiness for an older set.
      await this.dependencies.refresh();
      if (!this.hasWork()) {
        this.initialized = true;
        return;
      }
    }
    throw new Error(
      "Grouping definitions changed repeatedly during reprojection; retry when changes settle",
    );
  }
}
