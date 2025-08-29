import { z } from "zod";
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
  metadata: topicMetadataSchema.optional(),
});

export type TopicEntity = z.infer<typeof topicEntitySchema>;

/**
 * Schema for topic body structure (without title, which is dynamic)
 */
export const topicBodySchema = z.object({
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  sources: z.array(z.string()), // Just source IDs
});

export type TopicBody = z.infer<typeof topicBodySchema>;

/**
 * Topic sources are just IDs of entities this topic was extracted from
 */
export type TopicSource = string;

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
