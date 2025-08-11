import { z } from "zod";

/**
 * Schema for AI-extracted topic data
 */
export const extractedTopicSchema = z.object({
  title: z.string().max(100),
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()).max(10),
  relevanceScore: z.number().min(0).max(1),
});

export type ExtractedTopicData = z.infer<typeof extractedTopicSchema>;

/**
 * Schema for AI extraction response
 */
export const topicExtractionResponseSchema = z.array(extractedTopicSchema);

export type TopicExtractionResponse = z.infer<
  typeof topicExtractionResponseSchema
>;
