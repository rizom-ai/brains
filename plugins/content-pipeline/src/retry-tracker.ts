/**
 * RetryTracker - records per-entity publish failure counts.
 *
 * Scheduled publishing is at-most-once: a failed queue entry is dropped and is
 * NOT retried automatically. This tracker only accumulates a failure count and
 * the last error for observability, and is cleared when a publish succeeds.
 *
 * Implements Component Interface Standardization pattern.
 */

export interface RetryInfo {
  entityId: string;
  retryCount: number;
  lastError: string;
}

interface RetryEntry {
  entityId: string;
  retryCount: number;
  lastError: string;
}

export class RetryTracker {
  private static instance: RetryTracker | null = null;

  private retries: Map<string, RetryEntry> = new Map();

  /**
   * Get the singleton instance
   */
  public static getInstance(): RetryTracker {
    RetryTracker.instance ??= new RetryTracker();
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
  public static createFresh(): RetryTracker {
    return new RetryTracker();
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor() {}

  /**
   * Record a failure for an entity, incrementing its failure count.
   */
  public recordFailure(entityId: string, error: string): void {
    const existing = this.retries.get(entityId);
    const retryCount = (existing?.retryCount ?? 0) + 1;

    this.retries.set(entityId, {
      entityId,
      retryCount,
      lastError: error,
    });
  }

  /**
   * Clear failure info for entity (on success)
   */
  public clearRetries(entityId: string): void {
    this.retries.delete(entityId);
  }

  /**
   * Get failure info for entity
   */
  public getRetryInfo(entityId: string): RetryInfo | null {
    const entry = this.retries.get(entityId);
    if (!entry) return null;

    return {
      entityId: entry.entityId,
      retryCount: entry.retryCount,
      lastError: entry.lastError,
    };
  }
}
