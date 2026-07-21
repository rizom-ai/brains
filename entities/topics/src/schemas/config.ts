import type { ProjectionSourceRole } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Configuration schema for the Topics plugin
 */
export type TopicExtractionVisibility = "public" | "shared" | "restricted";

export interface TopicSourceRolePolicy {
  weight: number;
  canMint: boolean;
}

const extractionVisibilitySchema: z.ZodType<
  TopicExtractionVisibility,
  TopicExtractionVisibility
> = z.enum(["public", "shared", "restricted"]);

const projectionSourceRoleSchema: z.ZodType<
  ProjectionSourceRole,
  ProjectionSourceRole
> = z.enum(["canonical", "primary", "supporting", "ambient", "excluded"]);

const topicSourceRolePolicySchema: z.ZodType<
  TopicSourceRolePolicy,
  TopicSourceRolePolicy
> = z.object({
  weight: z.number().min(0).max(1),
  canMint: z.boolean(),
});

const defaultSourceRolePolicies: Record<
  ProjectionSourceRole,
  TopicSourceRolePolicy
> = {
  canonical: { weight: 1, canMint: true },
  primary: { weight: 1, canMint: true },
  supporting: { weight: 0.55, canMint: false },
  ambient: { weight: 0.35, canMint: false },
  excluded: { weight: 0, canMint: false },
};

export interface TopicsPluginConfig {
  includeEntityTypes: string[];
  minRelevanceScore: number;
  createRelevanceThreshold: number;
  reinforceRelevanceThreshold: number;
  sourceWeights: Record<string, number>;
  mintableEntityTypes: string[];
  sourceRolePolicies: Record<ProjectionSourceRole, TopicSourceRolePolicy>;
  sourceRoleOverrides: Record<string, ProjectionSourceRole>;
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
  sourceRolePolicies?:
    Partial<Record<ProjectionSourceRole, TopicSourceRolePolicy>> | undefined;
  sourceRoleOverrides?: Record<string, ProjectionSourceRole> | undefined;
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
   * Deprecated per-entity relevance multipliers retained for config
   * compatibility. Prefer sourceRolePolicies + entity projectionSourceRole.
   */
  sourceWeights: z.record(z.string(), z.number().min(0).max(1)).default({}),

  /**
   * Deprecated per-entity mint allow-list retained for config compatibility.
   * Prefer sourceRolePolicies + entity projectionSourceRole.
   */
  mintableEntityTypes: z.array(z.string()).default([]),

  /**
   * Role-level topic economics. Entity packages define default roles; brain or
   * instance config can override policies without the topics plugin knowing
   * about other entity packages.
   */
  sourceRolePolicies: z
    .partialRecord(projectionSourceRoleSchema, topicSourceRolePolicySchema)
    .default({})
    .transform((policies) => ({
      ...defaultSourceRolePolicies,
      ...policies,
    })),

  /**
   * Brain/instance-specific role overrides by entity type.
   */
  sourceRoleOverrides: z
    .record(z.string(), projectionSourceRoleSchema)
    .default({}),

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
