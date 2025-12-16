import { z } from "@brains/utils";

/**
 * Configuration schema for the Topics plugin
 */
export const topicsPluginConfigSchema = z.object({
  /**
   * Whitelist of entity types to extract topics from.
   * If non-empty, only these types are processed.
   * If empty, all types except excludeEntityTypes are processed (blacklist mode).
   */
  includeEntityTypes: z.array(z.string()).default([]),

  /**
   * Blacklist of entity types to exclude from topic extraction.
   * Only used when includeEntityTypes is empty.
   * Default excludes singleton/system entities that don't have detail pages.
   */
  excludeEntityTypes: z
    .array(z.string())
    .default(["base", "profile", "identity", "site-info"]),

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
