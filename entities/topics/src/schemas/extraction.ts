import { z } from "@brains/utils/zod-v4";

/**
 * Schema for AI-extracted topic data
 */
export interface ExtractedTopicData {
  title: string;
  content: string;
  relevanceScore: number;
}

export const extractedTopicSchema: z.ZodType<
  ExtractedTopicData,
  ExtractedTopicData
> = z.object({
  title: z.string().max(100),
  content: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

/**
 * Schema for AI extraction response
 */
export type TopicExtractionResponse = ExtractedTopicData[];

export const topicExtractionResponseSchema: z.ZodType<
  TopicExtractionResponse,
  TopicExtractionResponse
> = z.array(extractedTopicSchema);
