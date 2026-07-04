import { z } from "@brains/utils/zod-v4";

/**
 * Configuration schema for the Topics plugin
 */
export type TopicExtractionVisibility = "public" | "shared" | "restricted";

const extractionVisibilitySchema: z.ZodType<
  TopicExtractionVisibility,
  TopicExtractionVisibility
> = z.enum(["public", "shared", "restricted"]);

export interface TopicsPluginConfig {
  includeEntityTypes: string[];
  minRelevanceScore: number;
  mergeSimilarityThreshold: number;
  autoMerge: boolean;
  extractableStatuses: string[];
  enableAutoExtraction: boolean;
  extractionVisibility: TopicExtractionVisibility;
  sourceChangeBatchDelayMs: number;
}

export interface TopicsPluginConfigInput {
  includeEntityTypes?: string[] | undefined;
  minRelevanceScore?: number | undefined;
  mergeSimilarityThreshold?: number | undefined;
  autoMerge?: boolean | undefined;
  extractableStatuses?: string[] | undefined;
  enableAutoExtraction?: boolean | undefined;
  extractionVisibility?: TopicExtractionVisibility | undefined;
  sourceChangeBatchDelayMs?: number | undefined;
}

export const topicsPluginConfigSchema: z.ZodType<
  TopicsPluginConfig,
  TopicsPluginConfigInput
> = z.object({
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
   * Status values that are eligible for topic extraction.
   * Entities without a status field are always eligible.
   */
  extractableStatuses: z.array(z.string()).default(["published"]),

  /**
   * Enable automatic topic extraction from entity events
   */
  enableAutoExtraction: z.boolean().default(true),

  /**
   * Visibility boundary for topic extraction sources and derived topics.
   */
  extractionVisibility: extractionVisibilitySchema.default("public"),

  /**
   * Delay before processing source-change batches, allowing bursts to coalesce.
   */
  sourceChangeBatchDelayMs: z.number().int().min(0).default(1000),
});
