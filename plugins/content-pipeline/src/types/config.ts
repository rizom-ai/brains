import { z } from "@brains/utils";

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

/**
 * Plugin configuration schema
 */
export const contentPipelineConfigSchema = z.object({
  /**
   * Per-entity-type cron schedules.
   * Uses standard cron syntax with optional seconds field.
   * Entity types without a schedule are processed immediately when queued.
   *
   * Examples:
   *   "0 9 * * *"      - Daily at 9am
   *   "0 9 * * 1-5"    - Weekdays at 9am
   *   "0 *\/6 * * *"    - Every 6 hours
   *   "* * * * * *"    - Every second (6-field format)
   *
   * Usage:
   *   entitySchedules: {
   *     post: "0 9 * * *",        // Blog posts at 9am daily
   *     'social-post': "0 9,12,18 * * *" // Social at 9am, noon, 6pm
   *   }
   */
  entitySchedules: z.record(z.string(), z.string()).optional(),

  /** Maximum number of retry attempts */
  maxRetries: z.number().optional().default(3),

  /** Base delay in milliseconds for retry backoff */
  retryBaseDelayMs: z.number().optional().default(5000),
});

export type ContentPipelineConfig = z.infer<typeof contentPipelineConfigSchema>;
