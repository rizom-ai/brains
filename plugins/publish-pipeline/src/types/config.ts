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
export const publishPipelineConfigSchema = z.object({
  /** Default interval in milliseconds between queue checks */
  tickIntervalMs: z.number().optional().default(60000),

  /**
   * Per-entity-type intervals in milliseconds.
   * Allows different publish rates for different content types.
   * Example: { post: 3600000, deck: 3600000, 'social-post': 300000 }
   */
  entityIntervals: z.record(z.string(), z.number()).optional(),

  /** Maximum number of retry attempts */
  maxRetries: z.number().optional().default(3),

  /** Base delay in milliseconds for retry backoff */
  retryBaseDelayMs: z.number().optional().default(5000),
});

export type PublishPipelineConfig = z.infer<typeof publishPipelineConfigSchema>;
