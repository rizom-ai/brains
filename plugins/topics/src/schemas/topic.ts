import { z } from "zod";

/**
 * Topic metadata schema
 */
export const topicMetadataSchema = z.object({
  keywords: z.array(z.string()),
  relevanceScore: z.number().min(0).max(1),
  firstSeen: z.date(),
  lastSeen: z.date(),
  mentionCount: z.number().int().min(0),
  embedding: z.array(z.number()).optional(),
});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;

/**
 * Topic source reference schema
 */
export const topicSourceSchema = z.object({
  type: z.enum(["conversation", "note", "document", "link"]),
  id: z.string(),
  timestamp: z.date(),
  context: z.string().optional(),
});

export type TopicSource = z.infer<typeof topicSourceSchema>;

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
