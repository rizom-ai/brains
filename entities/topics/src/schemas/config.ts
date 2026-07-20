import { z } from "@brains/utils/zod";

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
  createRelevanceThreshold: number;
  reinforceRelevanceThreshold: number;
  sourceWeights: Record<string, number>;
  mintableEntityTypes: string[];
  maxEntitiesPerBatch: number;
  topicSoftCeilingSourceRatio: number;
  mergeSimilarityThreshold: number;
  semanticMergeDistance: number;
  reconciliationMaxPairs: number;
  autoMerge: boolean;
  extractableStatuses: string[];
  enableAutoExtraction: boolean;
  extractionVisibility: TopicExtractionVisibility;
  sourceChangeBatchDelayMs: number;
}

export interface TopicsPluginConfigInput {
  includeEntityTypes?: string[] | undefined;
  minRelevanceScore?: number | undefined;
  createRelevanceThreshold?: number | undefined;
  reinforceRelevanceThreshold?: number | undefined;
  sourceWeights?: Record<string, number> | undefined;
  mintableEntityTypes?: string[] | undefined;
  maxEntitiesPerBatch?: number | undefined;
  topicSoftCeilingSourceRatio?: number | undefined;
  mergeSimilarityThreshold?: number | undefined;
  semanticMergeDistance?: number | undefined;
  reconciliationMaxPairs?: number | undefined;
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
   * Minimum weighted relevance required to create a new topic.
   */
  createRelevanceThreshold: z.number().min(0).max(1).default(0.7),

  /**
   * Minimum weighted relevance required to reinforce an existing topic.
   */
  reinforceRelevanceThreshold: z.number().min(0).max(1).default(0.5),

  /**
   * Relevance multipliers by source entity type.
   */
  sourceWeights: z.record(z.string(), z.number().min(0).max(1)).default({
    "anchor-profile": 1,
    post: 1,
    summary: 1,
    deck: 0.85,
    project: 0.8,
    link: 0.6,
    note: 0.6,
  }),

  /**
   * Entity types allowed to mint new topics. Other source types can only
   * reinforce existing topics.
   */
  mintableEntityTypes: z
    .array(z.string())
    .default(["anchor-profile", "post", "summary", "deck", "project"]),

  /**
   * Maximum entities in one AI extraction prompt. This prevents large corpus
   * rebuilds from compressing the whole corpus into only 1-3 topics.
   */
  maxEntitiesPerBatch: z.number().int().min(1).default(4),

  /**
   * One new topic is allowed per N source entities, clamped to [5, 24].
   */
  topicSoftCeilingSourceRatio: z.number().min(1).default(5),

  /**
   * Deprecated lexical similarity threshold retained for config compatibility.
   * Semantic merge distance is used for new automatic merge decisions.
   */
  mergeSimilarityThreshold: z.number().min(0).max(1).default(0.85),

  /**
   * Maximum cosine distance for automatic semantic merging. Lower is closer.
   */
  semanticMergeDistance: z.number().min(0).max(1).default(0.35),

  /**
   * Maximum topic pairs to examine in one reconciliation pass.
   */
  reconciliationMaxPairs: z.number().int().min(0).default(100),

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
