import type {
  BaseEntity,
  EntityPluginContext,
  JobHandler,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { TopicsPluginConfig } from "../schemas/config";
import { extractTopicsBatched } from "./topic-batch-extractor";
import { TopicService } from "./topic-service";
import { TOPICS_JOB_SOURCE, TOPICS_PLUGIN_ID } from "./constants";

export const topicProjectionJobDataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("derive"),
    reason: z.string().optional(),
  }),
  z.object({
    mode: z.literal("rebuild"),
    reason: z.string().optional(),
  }),
  z.object({
    mode: z.literal("source"),
    entityId: z.string(),
    entityType: z.string(),
    contentHash: z.string().optional(),
    minRelevanceScore: z.number().min(0).max(1).optional(),
    autoMerge: z.boolean().optional(),
    mergeSimilarityThreshold: z.number().min(0).max(1).optional(),
  }),
]);

export type TopicProjectionJobData = z.infer<
  typeof topicProjectionJobDataSchema
>;

export interface TopicBatchResult {
  deleted?: number;
  created: number;
  merged: number;
  skipped: number;
  batches: number;
}

interface ExtractionParams {
  context: EntityPluginContext;
  logger: Logger;
  config: TopicsPluginConfig;
  shouldProcessEntityType: (entityType: string) => boolean;
  isEntityPublished: (entity: BaseEntity) => boolean;
}

export function createTopicProjectionHandler(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: TopicsPluginConfig;
  extractAllTopics: () => Promise<void>;
  rebuildAllTopics: () => Promise<void>;
}): JobHandler<string, TopicProjectionJobData, unknown> {
  const { context, logger, config } = params;

  return {
    process: async (data): Promise<unknown> => {
      if (data.mode === "derive") {
        await params.extractAllTopics();
        return { success: true };
      }
      if (data.mode === "rebuild") {
        await params.rebuildAllTopics();
        return { success: true };
      }

      const entity = await context.entityService.getEntity({
        entityType: data.entityType,
        id: data.entityId,
      });
      if (!entity) return { success: false, topicsExtracted: 0 };

      // Staleness check: skip if content has changed since the job was queued.
      if (data.contentHash && entity.contentHash !== data.contentHash) {
        logger.debug("Skipping stale source extraction", {
          entityId: entity.id,
          entityType: entity.entityType,
        });
        return { success: true, created: 0, merged: 0, skipped: 0 };
      }

      const result = await extractTopicsBatched([entity], context, logger, {
        minRelevanceScore: data.minRelevanceScore ?? config.minRelevanceScore,
        autoMerge: data.autoMerge ?? config.autoMerge,
        mergeSimilarityThreshold:
          data.mergeSimilarityThreshold ?? config.mergeSimilarityThreshold,
      });
      return { success: true, ...result };
    },
    validateAndParse: (data: unknown): TopicProjectionJobData | null => {
      const result = topicProjectionJobDataSchema.safeParse(data ?? {});
      return result.success ? result.data : null;
    },
  };
}

export function getInitialProjectionJobOptions(): {
  priority: number;
  source: string;
  deduplication: "coalesce";
  deduplicationKey: string;
  metadata: {
    operationType: "data_processing";
    operationTarget: string;
    pluginId: string;
  };
} {
  return {
    priority: 5,
    source: TOPICS_JOB_SOURCE,
    deduplication: "coalesce",
    deduplicationKey: "topics-initial-derivation",
    metadata: {
      operationType: "data_processing",
      operationTarget: "topics-initial-derivation",
      pluginId: TOPICS_PLUGIN_ID,
    },
  };
}

/**
 * Batch re-extract topics from all source entities.
 * Uses token-budget-aware batching — one LLM call per batch instead of per entity.
 */
export async function extractAllTopics(
  params: ExtractionParams,
): Promise<void> {
  const toExtract = await getEntitiesToExtract(params);

  if (toExtract.length === 0) {
    params.logger.info("No entities to extract topics from");
    return;
  }

  params.logger.info(`Batch topic extraction: ${toExtract.length} entities`);

  const result = await extractTopicsBatched(
    toExtract,
    params.context,
    params.logger,
    {
      minRelevanceScore: params.config.minRelevanceScore,
      autoMerge: params.config.autoMerge,
      mergeSimilarityThreshold: params.config.mergeSimilarityThreshold,
    },
  );

  params.logger.info("Batch topic extraction complete", result);
}

/**
 * Operator reset — delete all topics and rebuild from current source entities.
 */
export async function rebuildAllTopics(
  params: ExtractionParams,
): Promise<void> {
  const toExtract = await getEntitiesToExtract(params);
  const result = await replaceAllTopics(
    toExtract,
    params.context,
    params.logger,
    params.config,
  );
  params.logger.info("Topic rebuild complete", result);
}

export async function replaceAllTopics(
  entities: BaseEntity[],
  context: EntityPluginContext,
  logger: Logger,
  config: TopicsPluginConfig,
): Promise<Required<TopicBatchResult>> {
  const topicService = new TopicService(context.entityService, logger);
  const existingTopics = await topicService.listTopics();

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
    autoMerge: config.autoMerge,
    mergeSimilarityThreshold: config.mergeSimilarityThreshold,
  });
  return {
    deleted: existingTopics.length,
    ...result,
  };
}

async function getEntitiesToExtract(
  params: ExtractionParams,
): Promise<BaseEntity[]> {
  const typesToProcess = getExtractableEntityTypes(params);

  const toExtract: BaseEntity[] = [];
  for (const type of typesToProcess) {
    const entities = await params.context.entityService.listEntities({
      entityType: type,
    });
    for (const entity of entities) {
      if (!params.isEntityPublished(entity)) continue;
      toExtract.push(entity);
    }
  }

  return toExtract;
}

function getExtractableEntityTypes(params: ExtractionParams): string[] {
  const allTypes = params.context.entityService.getEntityTypes();
  return allTypes.filter((type) => params.shouldProcessEntityType(type));
}
