import type { ProjectionSourceRole } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Configuration schema for the Topics plugin
 */
const extractionVisibilitySchema: z.ZodEnum<{
  public: "public";
  shared: "shared";
  restricted: "restricted";
}> = z.enum(["public", "shared", "restricted"]);

export type TopicExtractionVisibility = z.output<
  typeof extractionVisibilitySchema
>;

const projectionSourceRoleSchema: z.ZodEnum<{
  canonical: "canonical";
  primary: "primary";
  secondary: "secondary";
  supporting: "supporting";
  ambient: "ambient";
  excluded: "excluded";
}> = z.enum([
  "canonical",
  "primary",
  "secondary",
  "supporting",
  "ambient",
  "excluded",
]);

// The role set belongs to the plugin contract; keep this enum equal to it.
function expectProjectionSourceRole(
  value: z.output<typeof projectionSourceRoleSchema>,
): ProjectionSourceRole {
  return value;
}
function expectProjectionSourceRoleInput(
  value: ProjectionSourceRole,
): z.input<typeof projectionSourceRoleSchema> {
  return value;
}
void expectProjectionSourceRole;
void expectProjectionSourceRoleInput;

const topicSourceRolePolicySchema: z.ZodObject<{
  weight: z.ZodNumber;
  canMint: z.ZodBoolean;
}> = z.object({
  weight: z.number().min(0).max(1),
  canMint: z.boolean(),
});

export type TopicSourceRolePolicy = z.output<
  typeof topicSourceRolePolicySchema
>;

const defaultSourceRolePolicies: Record<
  ProjectionSourceRole,
  TopicSourceRolePolicy
> = {
  canonical: { weight: 1, canMint: true },
  primary: { weight: 1, canMint: true },
  secondary: { weight: 0.8, canMint: true },
  supporting: { weight: 0.55, canMint: false },
  ambient: { weight: 0.35, canMint: false },
  excluded: { weight: 0, canMint: false },
};

type SourceRolePolicies = Record<ProjectionSourceRole, TopicSourceRolePolicy>;

export const topicsPluginConfigSchema: z.ZodObject<{
  includeEntityTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeEntityTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
  minRelevanceScore: z.ZodDefault<z.ZodNumber>;
  createRelevanceThreshold: z.ZodDefault<z.ZodNumber>;
  reinforceRelevanceThreshold: z.ZodDefault<z.ZodNumber>;
  sourceWeights: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  mintableEntityTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
  sourceRolePolicies: z.ZodPipe<
    z.ZodDefault<
      ReturnType<
        typeof z.partialRecord<
          typeof projectionSourceRoleSchema,
          typeof topicSourceRolePolicySchema
        >
      >
    >,
    z.ZodTransform<SourceRolePolicies, Partial<SourceRolePolicies>>
  >;
  sourceRoleOverrides: z.ZodDefault<
    z.ZodRecord<z.ZodString, typeof projectionSourceRoleSchema>
  >;
  maxEntitiesPerBatch: z.ZodDefault<z.ZodNumber>;
  topicSoftCeilingSourceRatio: z.ZodDefault<z.ZodNumber>;
  mergeSimilarityThreshold: z.ZodDefault<z.ZodNumber>;
  semanticMergeDistance: z.ZodDefault<z.ZodNumber>;
  reconciliationMaxPairs: z.ZodDefault<z.ZodNumber>;
  autoMerge: z.ZodDefault<z.ZodBoolean>;
  extractableStatuses: z.ZodDefault<z.ZodArray<z.ZodString>>;
  enableAutoExtraction: z.ZodDefault<z.ZodBoolean>;
  extractionVisibility: z.ZodDefault<typeof extractionVisibilitySchema>;
  sourceChangeBatchDelayMs: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  /**
   * Deprecated allow-list of entity types to extract topics from. Defaults to
   * all registered projection sources. Prefer excludeEntityTypes for normal
   * brain configuration.
   */
  includeEntityTypes: z.array(z.string()).default(["*"]),

  /**
   * Entity types to exclude from topic extraction while keeping source
   * selection default-open.
   */
  excludeEntityTypes: z.array(z.string()).default([]),

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

export type TopicsPluginConfig = z.output<typeof topicsPluginConfigSchema>;
export type TopicsPluginConfigInput = z.input<typeof topicsPluginConfigSchema>;
