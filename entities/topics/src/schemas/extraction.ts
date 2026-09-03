import { z } from "@brains/utils/zod";

/**
 * Schema for AI-extracted topic data
 */
export const extractedTopicSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodString;
  relevanceScore: z.ZodNumber;
}> = z.object({
  title: z.string().max(100),
  content: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export type ExtractedTopicData = z.output<typeof extractedTopicSchema>;

/**
 * Schema for AI extraction response
 */
export const topicExtractionResponseSchema: z.ZodArray<
  typeof extractedTopicSchema
> = z.array(extractedTopicSchema);

export type TopicExtractionResponse = z.output<
  typeof topicExtractionResponseSchema
>;

/**
 * Envelope the extraction template returns: `{ topics: [...] }`
 */
export const topicExtractionEnvelopeSchema: z.ZodObject<{
  topics: typeof topicExtractionResponseSchema;
}> = z.object({ topics: topicExtractionResponseSchema });
