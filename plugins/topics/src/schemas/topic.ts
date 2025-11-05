import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Topic metadata schema
 * Topics store all information in the content body, no metadata needed
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
 * Schema for topic source with metadata
 */
export const topicSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.literal("conversation"),
});

export type TopicSource = z.infer<typeof topicSourceSchema>;

/**
 * Schema for topic body structure (without title, which is dynamic)
 */
export const topicBodySchema = z.object({
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  sources: z.array(topicSourceSchema), // Rich source objects with metadata
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
