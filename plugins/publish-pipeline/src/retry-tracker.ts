/**
 * RetryTracker - Tracks retry attempts with exponential backoff
 *
 * Implements Component Interface Standardization pattern.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export interface RetryInfo {
  entityId: string;
  retryCount: number;
  lastError: string;
  nextRetryAt: number;
  willRetry: boolean;
}

interface RetryEntry {
  entityId: string;
  retryCount: number;
  lastError: string;
  nextRetryAt: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 5000,
};

export class RetryTracker {
  private static instance: RetryTracker | null = null;

  private retries: Map<string, RetryEntry> = new Map();
  private config: RetryConfig;

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: RetryConfig): RetryTracker {
    RetryTracker.instance ??= new RetryTracker(config ?? DEFAULT_CONFIG);
    return RetryTracker.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    RetryTracker.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config?: RetryConfig): RetryTracker {
    return new RetryTracker(config ?? DEFAULT_CONFIG);
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor(config: RetryConfig) {
    this.config = config;
  }

  /**
   * Record a failure for an entity
   * Increments retry count and calculates next retry time
   */
  public recordFailure(entityId: string, error: string): void {
    const existing = this.retries.get(entityId);
    const retryCount = (existing?.retryCount ?? 0) + 1;

    // Calculate exponential backoff: baseDelay * 2^(retryCount - 1)
    const delay = this.config.baseDelayMs * Math.pow(2, retryCount - 1);
    const nextRetryAt = Date.now() + delay;

    this.retries.set(entityId, {
      entityId,
      retryCount,
      lastError: error,
      nextRetryAt,
    });
  }

  /**
   * Check if entity should be retried (under max retries)
   */
  public shouldRetry(entityId: string): boolean {
    const entry = this.retries.get(entityId);
    if (!entry) return false;
    return entry.retryCount < this.config.maxRetries;
  }

  /**
   * Check if retry time has passed for entity
   */
  public isReadyForRetry(entityId: string): boolean {
    const entry = this.retries.get(entityId);
    if (!entry) return false;
    return Date.now() >= entry.nextRetryAt;
  }

  /**
   * Clear retry info for entity (on success or giving up)
   */
  public clearRetries(entityId: string): void {
    this.retries.delete(entityId);
  }

  /**
   * Get retry info for entity
   */
  public getRetryInfo(entityId: string): RetryInfo | null {
    const entry = this.retries.get(entityId);
    if (!entry) return null;

    return {
      entityId: entry.entityId,
      retryCount: entry.retryCount,
      lastError: entry.lastError,
      nextRetryAt: entry.nextRetryAt,
      willRetry: entry.retryCount < this.config.maxRetries,
    };
  }
}
