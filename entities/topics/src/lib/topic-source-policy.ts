import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  isVisibleWithinScope,
  type ServiceEntityReads,
} from "@brains/sdk/internal/service-runtime";

type EntityTypeConfig = ReturnType<ServiceEntityReads["getEntityTypeConfig"]>;
import { z } from "@brains/utils/zod";
import type {
  TopicsPluginConfig,
  TopicSourceRolePolicy,
} from "../schemas/config";
import { TOPIC_ENTITY_TYPE } from "./constants";

const sourceMetadataSchema = z.looseObject({
  title: z.string().optional(),
  status: z.unknown().optional(),
});

export function includesTopicSourceType(
  entityType: string,
  config: TopicsPluginConfig,
  entityTypeConfig: EntityTypeConfig,
): boolean {
  return (
    entityType !== TOPIC_ENTITY_TYPE &&
    !config.excludeEntityTypes.includes(entityType) &&
    entityTypeConfig.projectionSource !== false
  );
}

/** Whether topics are drawn from this type: included and given weight. */
export function isTopicSourceType(
  entityType: string,
  config: TopicsPluginConfig,
  entityTypeConfig: EntityTypeConfig,
): boolean {
  return (
    includesTopicSourceType(entityType, config, entityTypeConfig) &&
    topicSourcePolicy(entityType, config, entityTypeConfig).weight > 0
  );
}

/** The entity types topics are drawn from, sorted. */
export function topicSourceTypes(
  entityService: {
    getEntityTypes(): string[];
    getEntityTypeConfig(type: string): EntityTypeConfig;
  },
  config: TopicsPluginConfig,
): string[] {
  return entityService
    .getEntityTypes()
    .filter((type) =>
      isTopicSourceType(type, config, entityService.getEntityTypeConfig(type)),
    )
    .sort();
}

/** The config a source policy reads: role policies and per-type overrides. */
export type TopicSourcePolicyConfig = Pick<
  TopicsPluginConfig,
  "sourceRoleOverrides" | "sourceRolePolicies"
>;

/** The weight and mint authority of one source type's role. */
export function topicSourcePolicy(
  entityType: string,
  config: TopicSourcePolicyConfig,
  entityTypeConfig: EntityTypeConfig,
): TopicSourceRolePolicy {
  const role =
    config.sourceRoleOverrides[entityType] ??
    entityTypeConfig.projectionSourceRole ??
    (entityTypeConfig.projectionSource === false ? "excluded" : "primary");
  return config.sourceRolePolicies[role];
}

/**
 * The policy for one extraction prompt over several sources: its strongest
 * source's weight, and mint authority when any source may mint.
 */
export function topicBatchSourcePolicy(
  entityTypes: readonly string[],
  config: TopicSourcePolicyConfig,
  getEntityTypeConfig: (entityType: string) => EntityTypeConfig,
): TopicSourceRolePolicy {
  return entityTypes.reduce<TopicSourceRolePolicy>(
    (batch, entityType) => {
      const policy = topicSourcePolicy(
        entityType,
        config,
        getEntityTypeConfig(entityType),
      );
      return {
        weight: Math.max(batch.weight, policy.weight),
        canMint: batch.canMint || policy.canMint,
      };
    },
    { weight: 0, canMint: false },
  );
}

export function isTopicSourceEligible(
  entity: BaseEntity,
  config: TopicsPluginConfig,
): boolean {
  if (!isVisibleWithinScope(entity.visibility, config.extractionVisibility))
    return false;
  const parsed = sourceMetadataSchema.safeParse(entity.metadata);
  if (!parsed.success) return false;
  const status = parsed.data.status;
  return (
    status === undefined ||
    status === null ||
    (typeof status === "string" && config.extractableStatuses.includes(status))
  );
}

export function topicSourceTitle(entity: BaseEntity): string {
  const parsed = sourceMetadataSchema.safeParse(entity.metadata);
  return parsed.success ? (parsed.data.title ?? entity.id) : entity.id;
}
