/**
 * Configuration for publish behavior per entity type
 */
export interface PublishConfig {
  /** Maximum number of retry attempts before marking as failed */
  maxRetries?: number;

  /** Initial backoff delay in milliseconds between retries */
  retryBackoffMs?: number;

  /** Multiplier for exponential backoff (e.g., 2 = double delay each retry) */
  retryBackoffMultiplier?: number;

  /** Whether this entity type is enabled for publishing */
  enabled?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_PUBLISH_CONFIG: Required<PublishConfig> = {
  maxRetries: 3,
  retryBackoffMs: 5000,
  retryBackoffMultiplier: 2,
  enabled: true,
};

/**
 * Scheduler configuration for the publish service
 */
export interface SchedulerConfig {
  /** Interval in milliseconds between queue checks */
  intervalMs: number;

  /** Whether the scheduler is enabled */
  enabled: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMs: 60000, // 1 minute
  enabled: true,
};
