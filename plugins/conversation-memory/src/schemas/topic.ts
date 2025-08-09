import { z } from "zod";

/**
 * Schema for conversation topic metadata
 * Minimal metadata - context is stored in the content itself
 */
export const topicMetadataSchema = z.object({
  title: z.string(),
  messageCount: z.number(),
  lastUpdated: z.string().datetime(),
});

export type TopicMetadata = z.infer<typeof topicMetadataSchema>;

/**
 * Schema for conversation topic entity
 */
export const conversationTopicSchema = z.object({
  id: z.string(),
  entityType: z.literal("conversation-topic"),
  content: z.string(), // The summarized content with key takeaways
  metadata: topicMetadataSchema,
  created: z.string().datetime(),
  updated: z.string().datetime(),
});

export type ConversationTopic = z.infer<typeof conversationTopicSchema>;