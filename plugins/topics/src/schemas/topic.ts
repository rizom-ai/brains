import { z } from "zod";

/**
 * Topic metadata schema
 * Topics store all information in the content body, no metadata needed
 */
export const topicMetadataSchema = z.object({});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;

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
