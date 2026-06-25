import { z } from "@brains/utils/zod-v4";

/**
 * Schema for AI-extracted topic data
 */
export const extractedTopicSchema = z.object({
  title: z.string().max(100),
  content: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export type ExtractedTopicData = z.output<typeof extractedTopicSchema>;

/**
 * Schema for AI extraction response
 */
export const topicExtractionResponseSchema = z.array(extractedTopicSchema);

export type TopicExtractionResponse = z.output<
  typeof topicExtractionResponseSchema
>;
