import {
  computeProjectionInputFingerprint,
  isVisibleWithinScope,
  type BaseEntity,
  type EntityPluginContext,
  type JobHandler,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import { extractTopicsBatched } from "./topic-batch-extractor";
import { TopicService } from "./topic-service";
import {
  reconcileTopics as reconcileTopicsDefault,
  type TopicReconciliationResult,
} from "./topic-reconciliation";
import { TOPICS_JOB_SOURCE, TOPICS_PLUGIN_ID } from "./constants";

export type TopicProjectionJobData =
  | { mode: "derive"; reason?: string | undefined }
  | { mode: "rebuild"; reason?: string | undefined }
  | { mode: "source-batch"; minRelevanceScore?: number | undefined }
  | { mode: "reconcile"; reason?: string | undefined };

export const topicProjectionJobDataSchema: z.ZodType<
  TopicProjectionJobData,
  TopicProjectionJobData
> = z.discriminatedUnion("mode", [
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
  z.object({
    mode: z.literal("reconcile"),
    reason: z.string().optional(),
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
  merged: number;
  skipped: number;
  batches: number;
  stale: number;
  missing: number;
  unpublished: number;
  hidden: number;
  unchanged: number;
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
  reconcileTopics?: (() => Promise<TopicReconciliationResult>) | undefined;
  sourceBatch: TopicSourceBatchStore;
  isEntityPublished: (entity: BaseEntity) => boolean;
}): JobHandler<string, TopicProjectionJobData, unknown> {
  const { context, logger, config } = params;
  const runReconciliation: () => Promise<TopicReconciliationResult> =
    params.reconcileTopics ??
    (async (): Promise<TopicReconciliationResult> =>
      reconcileTopicsDefault({
        context,
        logger,
        semanticMergeDistance: config.semanticMergeDistance,
        targetVisibility: config.extractionVisibility,
        maxPairs: config.reconciliationMaxPairs,
      }));

  return {
    process: async (data): Promise<unknown> => {
      if (data.mode === "derive") {
        await params.extractAllTopics();
        await runReconciliation();
        return { success: true };
      }
      if (data.mode === "rebuild") {
        await params.rebuildAllTopics();
        await runReconciliation();
        return { success: true };
      }
      if (data.mode === "reconcile") {
        return runReconciliation();
      }
      const result = await processSourceBatch({
        context,
        logger,
        config,
        sourceBatch: params.sourceBatch,
        isEntityPublished: params.isEntityPublished,
        minRelevanceScore: data.minRelevanceScore ?? config.minRelevanceScore,
      });
      if (result.created > 0 || result.merged > 0) {
        await runReconciliation();
      }
      return result;
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
  config: TopicsPluginConfig;
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

  const classified = fetched.reduce<{
    stale: number;
    missing: number;
    unpublished: number;
    hidden: number;
    candidates: BaseEntity[];
  }>(
    (result, { ref, entity }) => {
      if (!entity) return { ...result, missing: result.missing + 1 };
      if (entity.contentHash !== ref.contentHash) {
        return { ...result, stale: result.stale + 1 };
      }
      if (!params.isEntityPublished(entity)) {
        return { ...result, unpublished: result.unpublished + 1 };
      }
      if (
        !isVisibleWithinScope(
          entity.visibility,
          params.config.extractionVisibility,
        )
      ) {
        return { ...result, hidden: result.hidden + 1 };
      }
      return { ...result, candidates: [...result.candidates, entity] };
    },
    {
      stale: 0,
      missing: 0,
      unpublished: 0,
      hidden: 0,
      candidates: [],
    },
  );

  const inputState = params.context.runtimeState.scoped<string>({
    namespace: "topics.source-input-fingerprints",
    schema: z.string(),
  });
  const appInfo =
    classified.candidates.length > 0 ? await params.context.appInfo() : null;
  const fingerprinted = await Promise.all(
    classified.candidates.map(async (entity) => {
      const stateKey = computeProjectionInputFingerprint({
        entityType: entity.entityType,
        entityId: entity.id,
      });
      const fingerprint = computeProjectionInputFingerprint({
        version: "topic-source-input-v1",
        source: {
          id: entity.id,
          entityType: entity.entityType,
          contentHash: entity.contentHash,
          visibility: entity.visibility,
        },
        model: appInfo?.ai.model,
        template: "topics:extraction",
        config: {
          minRelevanceScore: params.minRelevanceScore,
          createRelevanceThreshold: params.config.createRelevanceThreshold,
          reinforceRelevanceThreshold:
            params.config.reinforceRelevanceThreshold,
          sourceWeights: params.config.sourceWeights,
          mintableEntityTypes: params.config.mintableEntityTypes,
          sourceRolePolicies: params.config.sourceRolePolicies,
          sourceRoleOverrides: params.config.sourceRoleOverrides,
          maxEntitiesPerBatch: params.config.maxEntitiesPerBatch,
          topicSoftCeilingSourceRatio:
            params.config.topicSoftCeilingSourceRatio,
          autoMerge: params.config.autoMerge,
          semanticMergeDistance: params.config.semanticMergeDistance,
          targetVisibility: params.config.extractionVisibility,
        },
      });
      return {
        entity,
        stateKey,
        fingerprint,
        unchanged: (await inputState.get(stateKey)) === fingerprint,
      };
    }),
  );
  const changed = fingerprinted.filter((candidate) => !candidate.unchanged);
  const unchanged = fingerprinted.length - changed.length;
  const toExtract = changed.map((candidate) => candidate.entity);

  if (toExtract.length === 0) {
    return {
      success: true,
      sources: refs.length,
      created: 0,
      merged: 0,
      skipped: 0,
      batches: 0,
      stale: classified.stale,
      missing: classified.missing,
      unpublished: classified.unpublished,
      hidden: classified.hidden,
      unchanged,
    };
  }

  const sourceEntityCount = await countConfiguredSources(
    params.context,
    params.config,
  );
  const result = await extractTopicsBatched(
    toExtract,
    params.context,
    params.logger,
    {
      minRelevanceScore: params.minRelevanceScore,
      createRelevanceThreshold: params.config.createRelevanceThreshold,
      reinforceRelevanceThreshold: params.config.reinforceRelevanceThreshold,
      sourceWeights: params.config.sourceWeights,
      mintableEntityTypes: params.config.mintableEntityTypes,
      sourceRolePolicies: params.config.sourceRolePolicies,
      sourceRoleOverrides: params.config.sourceRoleOverrides,
      sourceEntityCount,
      maxEntitiesPerBatch: params.config.maxEntitiesPerBatch,
      topicSoftCeilingSourceRatio: params.config.topicSoftCeilingSourceRatio,
      autoMerge: params.config.autoMerge,
      semanticMergeDistance: params.config.semanticMergeDistance,
      targetVisibility: params.config.extractionVisibility,
    },
  );

  if ((result.failedBatches ?? 0) === 0 && (result.failedItems ?? 0) === 0) {
    await Promise.all(
      changed.map((candidate) =>
        inputState.set(candidate.stateKey, candidate.fingerprint),
      ),
    );
  }

  return {
    success: true,
    sources: refs.length,
    ...result,
    stale: classified.stale,
    missing: classified.missing,
    unpublished: classified.unpublished,
    hidden: classified.hidden,
    unchanged,
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
      createRelevanceThreshold: params.config.createRelevanceThreshold,
      reinforceRelevanceThreshold: params.config.reinforceRelevanceThreshold,
      sourceWeights: params.config.sourceWeights,
      mintableEntityTypes: params.config.mintableEntityTypes,
      sourceRolePolicies: params.config.sourceRolePolicies,
      sourceRoleOverrides: params.config.sourceRoleOverrides,
      sourceEntityCount: toExtract.length,
      maxEntitiesPerBatch: params.config.maxEntitiesPerBatch,
      topicSoftCeilingSourceRatio: params.config.topicSoftCeilingSourceRatio,
      autoMerge: params.config.autoMerge,
      semanticMergeDistance: params.config.semanticMergeDistance,
      targetVisibility: params.config.extractionVisibility,
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
    sourceWeights: config.sourceWeights,
    mintableEntityTypes: config.mintableEntityTypes,
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

async function getEntitiesToExtract(
  params: ExtractionParams,
): Promise<BaseEntity[]> {
  const typesToProcess = getExtractableEntityTypes(params);

  const toExtract: BaseEntity[] = [];
  for (const type of typesToProcess) {
    const entities = await params.context.entityService.listEntities({
      entityType: type,
      options: {
        filter: { visibilityScope: params.config.extractionVisibility },
      },
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

async function countConfiguredSources(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
): Promise<number> {
  const entityTypes = context.entityService.getEntityTypes().filter((type) => {
    if (type === "topic") return false;
    if (config.excludeEntityTypes.includes(type)) return false;
    if (
      !config.includeEntityTypes.includes("*") &&
      !config.includeEntityTypes.includes(type)
    ) {
      return false;
    }
    return (
      context.entityService.getEntityTypeConfig(type).projectionSource !== false
    );
  });
  const counts = await Promise.all(
    entityTypes.map((entityType) =>
      context.entityService.countEntities({
        entityType,
        options: {
          filter: { visibilityScope: config.extractionVisibility },
        },
      }),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}
