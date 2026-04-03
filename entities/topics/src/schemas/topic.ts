import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Topic metadata schema.
 * Empty — topics are knowledge domains, not citation trackers.
 * Old entities may have `sources` in metadata; the schema accepts
 * and strips unknown fields via Zod's default behavior.
 */
export const topicMetadataSchema = z.object({});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;

/**
 * Topic entity schema - extends base entity with topic-specific fields
 */
export const topicEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("topic"),
  metadata: topicMetadataSchema,
});

export type TopicEntity = z.infer<typeof topicEntitySchema>;

/**
 * Schema for topic body structure
 */
export const topicBodySchema = z.object({
  content: z.string(),
  keywords: z.array(z.string()),
});

/**
 * Topic frontmatter schema - fields editable via CMS
 */
export const topicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
  keywords: z.array(z.string()).optional().describe("Topic keywords"),
});

export type TopicBody = z.infer<typeof topicBodySchema>;

/**
 * Topic extraction job data schema
 */
export const topicExtractionJobDataSchema = z.object({
  timeWindowHours: z.number().min(1),
  minRelevanceScore: z.number().min(0).max(1),
});

export type TopicExtractionJobData = z.infer<
  typeof topicExtractionJobDataSchema
>;

/**
 * Topic merge job data schema
 */
export const topicMergeJobDataSchema = z.object({
  topicIds: z.array(z.string()).min(2),
  similarityThreshold: z.number().min(0).max(1),
});

export type TopicMergeJobData = z.infer<typeof topicMergeJobDataSchema>;
