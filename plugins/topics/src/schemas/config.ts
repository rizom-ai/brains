import { z } from "@brains/utils";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Number of messages to process in each window
   */
  windowSize: z.number().min(10).max(100).default(30),

  /**
   * Minimum relevance score for topic extraction
   */
  minRelevanceScore: z.number().min(0).max(1).default(0.5),

  /**
   * Similarity threshold for automatic merging
   */
  mergeSimilarityThreshold: z.number().min(0).max(1).default(0.85),

  /**
   * Enable automatic merging of similar topics
   */
  autoMerge: z.boolean().default(true),

  /**
   * Enable automatic topic extraction from conversation digests
   */
  enableAutoExtraction: z.boolean().default(true),
});

export type TopicsPluginConfig = z.infer<typeof topicsPluginConfigSchema>;
