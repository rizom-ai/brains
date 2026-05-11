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
    mode: z.literal("source-batch"),
    minRelevanceScore: z.number().min(0).max(1).optional(),
  }),
]);

export interface TopicSourceRef {
  entityId: string;
  entityType: string;
  contentHash: string;
}

export interface TopicSourceBatchResult {
  success: boolean;
  sources: number;
  created: number;
  skipped: number;
  batches: number;
  stale: number;
  missing: number;
  unpublished: number;
}

export interface TopicSourceBatchStore {
  add(ref: TopicSourceRef): void;
  drain(): TopicSourceRef[];
}

export class TopicSourceBatchBuffer implements TopicSourceBatchStore {
  private readonly refs = new Map<string, TopicSourceRef>();

  public add(ref: TopicSourceRef): void {
    this.refs.set(`${ref.entityType}:${ref.entityId}`, ref);
  }

  public drain(): TopicSourceRef[] {
    const refs = Array.from(this.refs.values());
    this.refs.clear();
    return refs;
  }
}

export type TopicProjectionJobData = z.infer<
  typeof topicProjectionJobDataSchema
>;

export interface TopicBatchResult {
  deleted?: number;
  created: number;
  skipped: number;
  batches: number;
}

interface ExtractionParams {
  context: EntityPluginContext;
  logger: Logger;
  shouldProcessEntityType: (entityType: string) => boolean;
  isEntityPublished: (entity: BaseEntity) => boolean;
  minRelevanceScore: number;
}

export function createTopicProjectionHandler(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: TopicsPluginConfig;
  extractAllTopics: () => Promise<void>;
  rebuildAllTopics: () => Promise<void>;
  sourceBatch: TopicSourceBatchStore;
  isEntityPublished: (entity: BaseEntity) => boolean;
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
      return processSourceBatch({
        context,
        logger,
        sourceBatch: params.sourceBatch,
        isEntityPublished: params.isEntityPublished,
        minRelevanceScore: data.minRelevanceScore ?? config.minRelevanceScore,
      });
    },
    validateAndParse: (data: unknown): TopicProjectionJobData | null => {
      const result = topicProjectionJobDataSchema.safeParse(data ?? {});
      return result.success ? result.data : null;
    },
  };
}

async function processSourceBatch(params: {
  context: EntityPluginContext;
  logger: Logger;
  sourceBatch: TopicSourceBatchStore;
  isEntityPublished: (entity: BaseEntity) => boolean;
  minRelevanceScore: number;
}): Promise<TopicSourceBatchResult> {
  const refs = params.sourceBatch.drain();
  const fetched = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      entity: await params.context.entityService.getEntity({
        entityType: ref.entityType,
        id: ref.entityId,
      }),
    })),
  );

  let stale = 0;
  let missing = 0;
  let unpublished = 0;
  const toExtract: BaseEntity[] = [];

  for (const { ref, entity } of fetched) {
    if (!entity) {
      missing++;
      continue;
    }
    if (entity.contentHash !== ref.contentHash) {
      stale++;
      continue;
    }
    if (!params.isEntityPublished(entity)) {
      unpublished++;
      continue;
    }
    toExtract.push(entity);
  }

  if (toExtract.length === 0) {
    return {
      success: true,
      sources: refs.length,
      created: 0,
      skipped: 0,
      batches: 0,
      stale,
      missing,
      unpublished,
    };
  }

  const result = await extractTopicsBatched(
    toExtract,
    params.context,
    params.logger,
    { minRelevanceScore: params.minRelevanceScore },
  );

  return {
    success: true,
    sources: refs.length,
    ...result,
    stale,
    missing,
    unpublished,
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
    { minRelevanceScore: params.minRelevanceScore },
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
    params.minRelevanceScore,
  );
  params.logger.info("Topic rebuild complete", result);
}

export async function replaceAllTopics(
  entities: BaseEntity[],
  context: EntityPluginContext,
  logger: Logger,
  minRelevanceScore: number,
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
      skipped: 0,
      batches: 0,
    };
  }

  const result = await extractTopicsBatched(entities, context, logger, {
    minRelevanceScore,
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
