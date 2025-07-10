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
export class ProgressReporter {
  private heartbeatInterval: Timer | undefined;

  private constructor(private readonly callback: ProgressCallback) {}

  /**
   * Create a progress reporter from a callback
   */
  static from(
    callback: ProgressCallback | undefined,
  ): ProgressReporter | undefined {
    if (!callback) return undefined;
    return new ProgressReporter(callback);
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
      return new ProgressReporter(async (notification) => {
        const scaledProgress =
          start + (notification.progress / (notification.total ?? 100)) * range;
        await this.callback({
          ...notification,
          progress: scaledProgress,
          total: 100,
        });
      });
    }

    return new ProgressReporter(this.callback);
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
   * Create a ProgressReporter for a specific job
   */
  createProgressReporter(jobId: string): ProgressReporter;
}
