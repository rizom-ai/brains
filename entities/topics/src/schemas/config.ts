import { z } from "@brains/utils";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Whitelist of entity types to extract topics from.
   * Only these types are processed. If empty, no types are processed.
   */
  includeEntityTypes: z.array(z.string()).default([]),

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
   * Enable automatic topic extraction from entity events
   */
  enableAutoExtraction: z.boolean().default(true),
});

export type TopicsPluginConfig = z.infer<typeof topicsPluginConfigSchema>;
