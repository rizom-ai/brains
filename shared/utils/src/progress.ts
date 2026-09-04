/**
 * Progress notification for long-running operations
 */
export interface ProgressNotification {
  progress: number;
  total?: number;
  message?: string;
  rate?: number; // Items per second
  eta?: number; // Estimated time remaining in milliseconds
}

/**
 * Progress callback type
 */
export type ProgressCallback = (
  notification: ProgressNotification,
) => Promise<void>;

/**
 * Progress reporting, as a structural contract.
 *
 * `ProgressReporter` itself cannot cross a public package boundary: it has
 * private fields and a private constructor, so the copy inlined into the
 * published declarations is nominally distinct from this one. Anything
 * handed to plugin authors is typed as this interface, which inlines
 * cleanly. `ProgressReporter` satisfies it.
 */
export interface ProgressContract {
  report(notification: ProgressNotification): Promise<void>;
}

/**
 * A simple utility class for managing progress reporting in nested operations
 *
 * @example
 * ```typescript
 * // Create from a callback
 * const progress = ProgressReporter.from(sendProgress);
 *
 * // Report progress
 * await progress?.report({
 *   message: "Building project",
 *   progress: 10,
 *   total: 100
 * });
 *
 * // Create sub-progress with scaled range
 * const subProgress = progress?.createSub({ scale: { start: 10, end: 90 } });
 *
 * // Use with APIs that expect a callback
 * await someApi(subProgress?.toCallback());
 * ```
 */
/**
 * What a progress reporter provides to callers.
 *
 * Consumers depend on this rather than on `CallbackProgressReporter`. The class
 * carries a private callback and a private constructor, so nothing else can be
 * assignable to it — which is why every test double had to be asserted into
 * place, a cast that also erased the check on the members it did define.
 */
export interface ProgressReporter {
  createSub(options?: {
    scale?: { start: number; end: number };
  }): ProgressReporter;
  report(notification: ProgressNotification): Promise<void>;
  startHeartbeat(message: string, intervalMs?: number): void;
  stopHeartbeat(): void;
  toCallback(): ProgressCallback;
}

/** The reporter the runtime constructs: a scaled wrapper around one callback. */
export class CallbackProgressReporter implements ProgressReporter {
  private readonly callback: ProgressCallback;
  private heartbeatInterval: Timer | undefined;

  private constructor(callback: ProgressCallback) {
    this.callback = callback;
  }

  /**
   * Create a progress reporter from a callback
   */
  static from(
    callback: ProgressCallback | undefined,
  ): ProgressReporter | undefined {
    if (!callback) return undefined;
    return new CallbackProgressReporter(callback);
  }

  /**
   * A reporter that discards notifications.
   *
   * For callers that must supply a reporter but have nowhere to send progress —
   * a synchronous tool path invoking a job handler directly, for instance.
   * Unlike `from`, this always returns a reporter, so such callers do not have
   * to fabricate one.
   */
  static noop(): CallbackProgressReporter {
    return new CallbackProgressReporter(async () => {
      // Intentionally discards progress.
    });
  }

  /**
   * Create a sub-reporter with scaled progress range
   */
  createSub(options?: {
    scale?: { start: number; end: number };
  }): ProgressReporter {
    const { scale } = options ?? {};

    if (scale) {
      const { start, end } = scale;
      const range = end - start;
      return new CallbackProgressReporter(async (notification) => {
        const scaledProgress =
          start + (notification.progress / (notification.total ?? 100)) * range;
        await this.callback({
          ...notification,
          progress: scaledProgress,
          total: 100,
        });
      });
    }

    return new CallbackProgressReporter(this.callback);
  }

  /**
   * Report progress
   */
  async report(notification: ProgressNotification): Promise<void> {
    await this.callback(notification);
  }

  /**
   * Start a heartbeat that reports progress periodically
   * Useful for long-running operations to prevent timeouts
   */
  startHeartbeat(message: string, intervalMs = 5000): void {
    this.stopHeartbeat(); // Clear any existing heartbeat

    this.heartbeatInterval = setInterval(() => {
      this.report({ message, progress: 0 }).catch(() => {
        // Ignore errors from progress reporting
      });
    }, intervalMs);
  }

  /**
   * Stop the heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Get the underlying callback function
   */
  toCallback(): ProgressCallback {
    return this.callback;
  }
}

/**
 * Interface for job progress monitoring
 * Allows different implementations for production and testing
 */
export interface IJobProgressMonitor {
  /**
   * Start the progress monitor
   */
  start(): void;

  /**
   * Stop the progress monitor
   */
  stop(): void;

  /**
   * Create a ProgressReporter for a specific job
   */
  createProgressReporter(jobId: string, attemptId?: string): ProgressReporter;

  /**
   * Emit job completion event
   */
  emitJobCompletion(jobId: string): Promise<void>;

  /**
   * Emit job failure event
   */
  emitJobFailure(jobId: string): Promise<void>;

  /**
   * Handle job status changes - emits individual job events and batch progress if applicable
   * This is the main entry point for job completion/failure notifications
   */
  handleJobStatusChange(
    jobId: string,
    status: "completed" | "failed",
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}
