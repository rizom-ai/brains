import { z } from "zod";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Time window in hours for sliding window extraction
   */
  extractionWindowHours: z.number().min(1).default(24),

  /**
   * Minimum relevance score for topic extraction
   */
  minRelevanceScore: z.number().min(0).max(1).default(0.5),

  /**
   * Similarity threshold for automatic merging
   */
  mergeSimilarityThreshold: z.number().min(0).max(1).default(0.8),

  /**
   * Enable automatic extraction on new conversations
   */
  autoExtract: z.boolean().default(true),

  /**
   * Enable automatic merging of similar topics
   */
  autoMerge: z.boolean().default(true),
});

export type TopicsPluginConfig = z.infer<typeof topicsPluginConfigSchema>;
export type TopicsPluginConfigInput = z.input<typeof topicsPluginConfigSchema>;

/**
 * Default configuration
 */
export const defaultTopicsPluginConfig: TopicsPluginConfig = {
  extractionWindowHours: 24,
  minRelevanceScore: 0.5,
  mergeSimilarityThreshold: 0.8,
  autoExtract: true,
  autoMerge: true,
};
