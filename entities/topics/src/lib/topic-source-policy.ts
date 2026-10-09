import {
  isVisibleWithinScope,
  type BaseEntity,
  type EntityReader,
} from "@brains/sdk/entities";
type SourcePolicy = Partial<ReturnType<EntityReader["getSourcePolicy"]>>;
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
  entityTypeConfig: SourcePolicy,
): boolean {
  return (
    entityType !== TOPIC_ENTITY_TYPE &&
    !config.excludeEntityTypes.includes(entityType) &&
    (config.includeEntityTypes.includes("*") ||
      config.includeEntityTypes.includes(entityType)) &&
    entityTypeConfig.projectionSource !== false
  );
}

export function topicSourcePolicy(
  entityType: string,
  config: TopicsPluginConfig,
  entityTypeConfig: SourcePolicy,
): TopicSourceRolePolicy {
  const role =
    config.sourceRoleOverrides[entityType] ??
    entityTypeConfig.projectionSourceRole ??
    (entityTypeConfig.projectionSource === false ? "excluded" : "primary");
  const policy = config.sourceRolePolicies[role];
  return {
    weight:
      Object.keys(config.sourceWeights).length > 0
        ? (config.sourceWeights[entityType] ?? 1)
        : policy.weight,
    canMint:
      config.mintableEntityTypes.length > 0
        ? config.mintableEntityTypes.includes(entityType)
        : policy.canMint,
  };
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
  // A status allowlist may narrow public publication, never broaden it.
  if (
    config.extractionVisibility === "public" &&
    status !== undefined &&
    status !== null &&
    status !== "published"
  )
    return false;
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
