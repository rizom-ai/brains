import type { ProgressNotification } from "@brains/types";

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
 * // Report a message
 * await progress?.report("Building project");
 *
 * // Create sub-progress
 * const subProgress = progress?.createSub("Compiling");
 *
 * // Use with APIs that expect a callback
 * await someApi(subProgress?.toCallback());
 * ```
 */
export class ProgressReporter {
  private heartbeatInterval: Timer | undefined;

  private constructor(
    private readonly callback: ProgressCallback,
    private readonly prefix?: string,
  ) {}

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
   * Create a sub-progress reporter with an optional prefix
   */
  createSub(prefix: string): ProgressReporter {
    const newPrefix = this.prefix ? `${this.prefix}: ${prefix}` : prefix;
    return new ProgressReporter(this.callback, newPrefix);
  }

  /**
   * Report progress
   */
  async report(
    message: string,
    progress?: number,
    total?: number,
  ): Promise<void> {
    const fullMessage = this.prefix ? `${this.prefix}: ${message}` : message;

    const notification: ProgressNotification = {
      progress: progress ?? 0,
      message: fullMessage,
    };
    if (total !== undefined) notification.total = total;

    await this.callback(notification);
  }

  /**
   * Start a heartbeat that reports progress periodically
   * Useful for long-running operations to prevent timeouts
   */
  startHeartbeat(message: string, intervalMs = 5000): void {
    this.stopHeartbeat(); // Clear any existing heartbeat

    this.heartbeatInterval = setInterval(() => {
      this.report(message).catch(() => {
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
    return async (notification) => {
      const message =
        this.prefix && notification.message
          ? `${this.prefix}: ${notification.message}`
          : (this.prefix ?? notification.message);

      await this.callback({
        ...notification,
        ...(message && { message }),
      });
    };
  }
}
