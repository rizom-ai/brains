import { z } from "@brains/utils/zod";

/**
 * Configuration for publish behavior per entity type
 */
export type PublishExecutionMode = "provider";

export const publishExecutionModeSchema: z.ZodType<
  PublishExecutionMode,
  PublishExecutionMode
> = z.enum(["provider"]);

export interface PublishConfig {
  executionMode?: PublishExecutionMode | undefined;
  publishResultIdField?: string | undefined;
  publishTimestampField?: string | undefined;
  enabled?: boolean | undefined;
}

export type PublishConfigInput = PublishConfig;

export const publishConfigSchema: z.ZodType<PublishConfig, PublishConfigInput> =
  z
    .object({
      /** Publishing execution mode. Only provider execution is supported. */
      executionMode: publishExecutionModeSchema.optional(),

      /** Optional metadata/frontmatter field for storing provider result IDs. */
      publishResultIdField: z.string().min(1).optional(),

      /** Optional metadata/frontmatter field for storing publish timestamps. */
      publishTimestampField: z.string().min(1).optional(),

      /** Whether this entity type is enabled for publishing */
      enabled: z.boolean().optional(),
    })
    .strict();

/**
 * Default configuration values
 */
export const DEFAULT_PUBLISH_CONFIG: Required<PublishConfig> = {
  executionMode: "provider",
  publishResultIdField: "platformId",
  publishTimestampField: "publishedAt",
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
export interface GenerationCondition {
  skipIfDraftExists?: boolean | undefined;
  minSourceEntities?: number | undefined;
  maxUnpublishedDrafts?: number | undefined;
  sourceEntityType?: string | undefined;
}

export type GenerationConditionInput = GenerationCondition;

export const generationConditionSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<GenerationCondition, GenerationConditionInput> = z.object({
  /** Skip generation if a draft already exists for this period (default: true) */
  skipIfDraftExists: z.boolean().optional(),

  /** Minimum number of source entities required to generate */
  minSourceEntities: z.number().optional(),

  /** Maximum number of unpublished drafts allowed before stopping generation */
  maxUnpublishedDrafts: z.number().optional(),

  /** Entity type to use as source content (e.g., "post" for newsletter) */
  sourceEntityType: z.string().optional(),
});

/**
 * Plugin configuration schema
 */
export interface ContentPipelineConfig {
  entitySchedules?: Record<string, string> | undefined;
  generationSchedules?: Record<string, string> | undefined;
  generationConditions?: Record<string, GenerationCondition> | undefined;
}

export type ContentPipelineConfigInput = ContentPipelineConfig;

export const contentPipelineConfigSchema: z.ZodType<
  ContentPipelineConfig,
  ContentPipelineConfigInput
> = z.object({
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
});
