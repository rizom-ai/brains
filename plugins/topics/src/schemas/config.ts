import { z } from "zod";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Number of messages to process in each window
   */
  windowSize: z.number().min(10).max(100).optional(),

  /**
   * Minimum relevance score for topic extraction
   */
  minRelevanceScore: z.number().min(0).max(1).optional(),

  /**
   * Similarity threshold for automatic merging
   */
  mergeSimilarityThreshold: z.number().min(0).max(1).optional(),

  /**
   * Enable automatic merging of similar topics
   */
  autoMerge: z.boolean().optional(),
});

export type TopicsPluginConfig = z.infer<typeof topicsPluginConfigSchema>;

/**
 * Default configuration
 */
export const defaultTopicsPluginConfig: Partial<TopicsPluginConfig> = {
  windowSize: 20,
  minRelevanceScore: 0.5,
  mergeSimilarityThreshold: 0.8,
  autoMerge: true,
};
