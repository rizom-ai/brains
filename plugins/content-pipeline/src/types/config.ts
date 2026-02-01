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
 * Generation condition schema
 * Controls when automatic draft generation should occur
 */
export const generationConditionSchema = z.object({
  /** Skip generation if a draft already exists for this period (default: true) */
  skipIfDraftExists: z.boolean().optional(),

  /** Minimum number of source entities required to generate */
  minSourceEntities: z.number().optional(),

  /** Maximum number of unpublished drafts allowed before stopping generation */
  maxUnpublishedDrafts: z.number().optional(),

  /** Entity type to use as source content (e.g., "post" for newsletter) */
  sourceEntityType: z.string().optional(),
});

export type GenerationCondition = z.infer<typeof generationConditionSchema>;

/**
 * Plugin configuration schema
 */
export const contentPipelineConfigSchema = z.object({
  /**
   * Per-entity-type publish schedules (cron syntax).
   * Entity types without a schedule are processed immediately when queued.
   *
   * Examples:
   *   "0 9 * * *"      - Daily at 9am
   *   "0 9 * * 1-5"    - Weekdays at 9am
   *   "0 *\/6 * * *"    - Every 6 hours
   *   "* * * * * *"    - Every second (6-field format)
   */
  entitySchedules: z.record(z.string(), z.string()).optional(),

  /**
   * Per-entity-type generation schedules (cron syntax).
   * Triggers automatic draft generation on schedule.
   *
   * Example:
   *   generationSchedules: {
   *     newsletter: "0 9 * * 1",     // Generate newsletter draft Monday 9am
   *     'social-post': "0 9 * * *",  // Generate social post daily 9am
   *   }
   */
  generationSchedules: z.record(z.string(), z.string()).optional(),

  /**
   * Conditions that must be met before generating drafts.
   *
   * Example:
   *   generationConditions: {
   *     newsletter: {
   *       skipIfDraftExists: true,
   *       minSourceEntities: 1,
   *       maxUnpublishedDrafts: 3,
   *       sourceEntityType: "post",
   *     },
   *   }
   */
  generationConditions: z
    .record(z.string(), generationConditionSchema)
    .optional(),

  /** Maximum number of retry attempts */
  maxRetries: z.number().optional().default(3),

  /** Base delay in milliseconds for retry backoff */
  retryBaseDelayMs: z.number().optional().default(5000),
});

export type ContentPipelineConfig = z.infer<typeof contentPipelineConfigSchema>;
