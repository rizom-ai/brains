import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { TopicsContext } from "./topics-context";
import type { Logger } from "@brains/utils/logger";
import type { TopicsPluginConfig } from "../schemas/config";
import { extractTopicsBatched } from "./topic-batch-extractor";
import { TopicService } from "./topic-service";

export interface TopicBatchResult {
  deleted?: number;
  created: number;
  merged: number;
  skipped: number;
  batches: number;
}

/** Replace topics for an isolated evaluation dataset. Not a runtime job path. */
export async function replaceAllTopics(
  entities: BaseEntity[],
  context: TopicsContext,
  logger: Logger,
  config: TopicsPluginConfig,
): Promise<Required<TopicBatchResult>> {
  const topicService = new TopicService(context.entityService, logger);
  const existingTopics = await topicService.listTopics({
    visibility: config.extractionVisibility,
  });

  for (const topic of existingTopics) {
    await topicService.deleteTopic(topic.id);
  }

  if (entities.length === 0) {
    return {
      deleted: existingTopics.length,
      created: 0,
      merged: 0,
      skipped: 0,
      batches: 0,
    };
  }

  const result = await extractTopicsBatched(entities, context, logger, {
    minRelevanceScore: config.minRelevanceScore,
    createRelevanceThreshold: config.createRelevanceThreshold,
    reinforceRelevanceThreshold: config.reinforceRelevanceThreshold,
    sourceRolePolicies: config.sourceRolePolicies,
    sourceRoleOverrides: config.sourceRoleOverrides,
    sourceEntityCount: entities.length,
    maxEntitiesPerBatch: config.maxEntitiesPerBatch,
    topicSoftCeilingSourceRatio: config.topicSoftCeilingSourceRatio,
    autoMerge: config.autoMerge,
    semanticMergeDistance: config.semanticMergeDistance,
    targetVisibility: config.extractionVisibility,
  });
  return {
    deleted: existingTopics.length,
    ...result,
  };
}
