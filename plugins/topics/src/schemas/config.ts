import { z } from "zod";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Time window in hours for sliding window extraction
   */
  extractionWindowHours: z.number().min(1).optional(),

  /**
   * Minimum relevance score for topic extraction
   */
  minRelevanceScore: z.number().min(0).max(1).optional(),

  /**
   * Similarity threshold for automatic merging
   */
  mergeSimilarityThreshold: z.number().min(0).max(1).optional(),

  /**
   * Enable automatic extraction on new conversations
   */
  autoExtract: z.boolean().optional(),

  /**
   * Enable automatic merging of similar topics
   */
  autoMerge: z.boolean().optional(),
});

export type TopicsPluginConfig = z.infer<typeof topicsPluginConfigSchema>;
export type TopicsPluginConfigInput = Partial<
  z.input<typeof topicsPluginConfigSchema>
>;

/**
 * Default configuration
 */
export const defaultTopicsPluginConfig: Partial<TopicsPluginConfig> = {
  extractionWindowHours: 24,
  minRelevanceScore: 0.5,
  mergeSimilarityThreshold: 0.8,
  autoExtract: true,
  autoMerge: true,
};
