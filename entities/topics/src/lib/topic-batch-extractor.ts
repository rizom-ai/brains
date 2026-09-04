import type {
  BaseEntity,
  ContentVisibility,
  EntityPluginContext,
  ProjectionSourceRole,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { TopicSourceRolePolicy } from "../schemas/config";
import { topicExtractionEnvelopeSchema } from "../schemas/extraction";
import type { TopicEntity } from "../types";
import { batchEntities } from "./batch-entities";
import {
  buildTopicExtractionPrompt,
  listExistingTopicTitles,
} from "./extraction-prompt";
import { TopicService } from "./topic-service";
import {
  TopicMergeSynthesizer,
  type ITopicMergeSynthesizer,
} from "./topic-merge-synthesizer";
import { TOPICS_BATCH_COMPLETED_EVENT } from "./constants";

/**
 * Build the prompt content for a batch of entities.
 */
export function buildBatchPrompt(entities: BaseEntity[]): string {
  if (entities.length === 0) return "";

  return entities
    .map((entity, i) => {
      const metaTitle = entity.metadata["title"];
      const title = typeof metaTitle === "string" ? metaTitle : entity.id;
      const type =
        entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1);

      return `---\n[${i + 1}] ${type}: ${title}\n\n${entity.content}`;
    })
    .join("\n\n");
}

export interface ExtractTopicsBatchedOptions {
  minRelevanceScore?: number;
  createRelevanceThreshold?: number;
  reinforceRelevanceThreshold?: number;
  sourceWeights?: Record<string, number>;
  mintableEntityTypes?: string[];
  sourceRolePolicies?: Record<ProjectionSourceRole, TopicSourceRolePolicy>;
  sourceRoleOverrides?: Record<string, ProjectionSourceRole>;
  sourceEntityCount?: number;
  maxEntitiesPerBatch?: number;
  topicSoftCeilingSourceRatio?: number;
  autoMerge?: boolean;
  mergeSimilarityThreshold?: number;
  semanticMergeDistance?: number;
  targetVisibility?: ContentVisibility;
  /** Injected for tests. Constructed from context when omitted. */
  topicMergeSynthesizer?: ITopicMergeSynthesizer;
}

export interface ExtractTopicsBatchedResult {
  created: number;
  merged: number;
  skipped: number;
  batches: number;
  failedBatches?: number;
  failedItems?: number;
}

const DEFAULT_SOURCE_ROLE_POLICIES: Record<
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

/**
 * Extract topics from source entities in token-budget-aware batches.
 *
 * For each extracted topic:
 * - if `autoMerge` is set and `findMergeCandidate` returns a hit above
 *   threshold, synthesize the merge and absorb the incoming title into the
 *   canonical topic
 * - otherwise create the topic (or skip if a topic with the same slug was
 *   already touched in this run)
 *
 * The in-batch `Map` of created/merged topics is passed as
 * `additionalCandidates` so a later topic in the same run can merge with one
 * created earlier — covering the gap where embeddings for fresh writes are
 * still queued in the background.
 *
 * Emits `TOPICS_BATCH_COMPLETED_EVENT` once at the end when any topic was
 * created or merged, so downstream subscribers can react to the wave rather
 * than per topic.
 */
export async function extractTopicsBatched(
  entities: BaseEntity[],
  context: EntityPluginContext,
  logger: Logger,
  options: ExtractTopicsBatchedOptions = {},
): Promise<ExtractTopicsBatchedResult> {
  if (entities.length === 0) {
    return { created: 0, merged: 0, skipped: 0, batches: 0 };
  }

  const minRelevanceScore = options.minRelevanceScore ?? 0;
  const createRelevanceThreshold = options.createRelevanceThreshold ?? 0.7;
  const reinforceRelevanceThreshold =
    options.reinforceRelevanceThreshold ?? 0.5;
  const sourceWeights = options.sourceWeights ?? {};
  const mintableEntityTypes = new Set(options.mintableEntityTypes ?? []);
  const sourceRolePolicies = {
    ...DEFAULT_SOURCE_ROLE_POLICIES,
    ...(options.sourceRolePolicies ?? {}),
  };
  const autoMerge = options.autoMerge ?? false;
  const threshold =
    options.semanticMergeDistance ?? options.mergeSimilarityThreshold ?? 0.35;
  const targetVisibility = options.targetVisibility ?? "public";
  const maxEntitiesPerBatch = options.maxEntitiesPerBatch ?? 4;

  const batches = splitBatchesByEntityCount(
    batchEntities(entities),
    maxEntitiesPerBatch,
  );
  const topicService = new TopicService(context.entityService, logger);
  const synthesizer =
    options.topicMergeSynthesizer ?? new TopicMergeSynthesizer(context, logger);

  const existingTopicTitles = await listExistingTopicTitles(
    context.entityService,
    undefined,
    targetVisibility,
  );
  const sourceEntityCount = options.sourceEntityCount ?? entities.length;
  const topicSoftCeiling = getTopicSoftCeiling(
    sourceEntityCount,
    options.topicSoftCeilingSourceRatio ?? 5,
  );
  const inBatch = new Map<string, TopicEntity>();

  interface ExtractionOutcome {
    created: number;
    merged: number;
    skipped: number;
    batches: number;
    failedBatches: number;
    failedItems: number;
  }
  const emptyOutcome = (): ExtractionOutcome => ({
    created: 0,
    merged: 0,
    skipped: 0,
    batches: 0,
    failedBatches: 0,
    failedItems: 0,
  });
  const combineOutcomes = (
    left: ExtractionOutcome,
    right: ExtractionOutcome,
  ): ExtractionOutcome => ({
    created: left.created + right.created,
    merged: left.merged + right.merged,
    skipped: left.skipped + right.skipped,
    batches: left.batches + right.batches,
    failedBatches: left.failedBatches + right.failedBatches,
    failedItems: left.failedItems + right.failedItems,
  });

  const processBatch = async (
    batch: BaseEntity[],
  ): Promise<ExtractionOutcome> => {
    logger.info(`Processing batch of ${batch.length} entities`);
    const sourcePolicy = getBatchSourcePolicy({
      batch,
      getEntityTypeConfig: (entityType) =>
        context.entityService.getEntityTypeConfig(entityType),
      sourceWeights,
      mintableEntityTypes,
      sourceRolePolicies,
      sourceRoleOverrides: options.sourceRoleOverrides ?? {},
    });
    const prompt = buildTopicExtractionPrompt({
      entityTitle: `Batch of ${batch.length} entities`,
      entityType: "batch",
      content: buildBatchPrompt(batch),
      existingTopicTitles,
    });

    try {
      const result = await context.ai.generate(
        {
          prompt,
          templateName: "topics:extraction",
          representedIdentity: "none",
        },
        topicExtractionEnvelopeSchema,
      );
      const topics = result.topics.filter(
        (topic) => topic.relevanceScore >= minRelevanceScore,
      );

      return await topics.reduce<Promise<ExtractionOutcome>>(
        async (previous, topic) => {
          const accumulated = await previous;
          try {
            const weightedRelevance =
              topic.relevanceScore * sourcePolicy.weight;
            if (weightedRelevance < reinforceRelevanceThreshold) {
              return combineOutcomes(accumulated, {
                ...emptyOutcome(),
                skipped: 1,
              });
            }

            if (autoMerge) {
              const candidate = await topicService.findMergeCandidate({
                incoming: topic,
                threshold,
                additionalCandidates: Array.from(inBatch.values()),
                targetVisibility,
              });
              if (candidate) {
                const synthesized = await synthesizer.synthesize({
                  existingTopic: candidate.topic,
                  incomingTopic: topic,
                });
                if (synthesized.verdict !== "distinct") {
                  const mergedTopic = await topicService.applySynthesizedMerge({
                    existingId: candidate.topic.id,
                    synthesized: { ...synthesized, title: candidate.title },
                    visibility: targetVisibility,
                  });
                  if (!mergedTopic) {
                    throw new Error(`Failed to merge topic: ${topic.title}`);
                  }
                  inBatch.set(mergedTopic.id, mergedTopic);
                  return combineOutcomes(accumulated, {
                    ...emptyOutcome(),
                    merged: 1,
                  });
                }
              }
            }

            const atSoftCeiling =
              existingTopicTitles.length + inBatch.size >= topicSoftCeiling;
            const mayCreate =
              sourcePolicy.canMint &&
              weightedRelevance >= createRelevanceThreshold &&
              !atSoftCeiling;
            if (!mayCreate) {
              return combineOutcomes(accumulated, {
                ...emptyOutcome(),
                skipped: 1,
              });
            }

            const slug = topicService.getTopicIdForTitle(
              topic.title,
              targetVisibility,
            );
            if (inBatch.has(slug)) {
              return combineOutcomes(accumulated, {
                ...emptyOutcome(),
                skipped: 1,
              });
            }

            const createResult = await topicService.createTopicOptimistic({
              title: topic.title,
              content: topic.content,
              visibility: targetVisibility,
            });
            if (createResult.topic) {
              inBatch.set(createResult.topic.id, createResult.topic);
            }
            return combineOutcomes(accumulated, {
              ...emptyOutcome(),
              ...(createResult.created ? { created: 1 } : { skipped: 1 }),
            });
          } catch (error) {
            logger.error("Topic batch item failed", {
              title: topic.title,
              error: getErrorMessage(error),
            });
            return combineOutcomes(accumulated, {
              ...emptyOutcome(),
              failedItems: 1,
            });
          }
        },
        Promise.resolve({ ...emptyOutcome(), batches: 1 }),
      );
    } catch (error) {
      logger.error("Batch topic extraction failed", {
        batchSize: batch.length,
        promptChars: prompt.length,
        error: getErrorMessage(error),
      });
      return { ...emptyOutcome(), batches: 1, failedBatches: 1 };
    }
  };

  const outcome = await batches.reduce<Promise<ExtractionOutcome>>(
    async (previous, batch) =>
      combineOutcomes(await previous, await processBatch(batch)),
    Promise.resolve(emptyOutcome()),
  );
  const summary: ExtractTopicsBatchedResult = {
    created: outcome.created,
    merged: outcome.merged,
    skipped: outcome.skipped,
    batches: outcome.batches,
    ...(outcome.failedBatches > 0 && {
      failedBatches: outcome.failedBatches,
    }),
    ...(outcome.failedItems > 0 && { failedItems: outcome.failedItems }),
  };

  if (outcome.created > 0 || outcome.merged > 0) {
    await context.messaging.send({
      type: TOPICS_BATCH_COMPLETED_EVENT,
      payload: summary,
      broadcast: true,
    });
  }

  return summary;
}

function splitBatchesByEntityCount(
  batches: BaseEntity[][],
  maxEntitiesPerBatch: number,
): BaseEntity[][] {
  if (maxEntitiesPerBatch <= 0) return batches;
  return batches.flatMap((batch) => {
    const chunks: BaseEntity[][] = [];
    for (let index = 0; index < batch.length; index += maxEntitiesPerBatch) {
      chunks.push(batch.slice(index, index + maxEntitiesPerBatch));
    }
    return chunks;
  });
}

function getBatchSourcePolicy(params: {
  batch: BaseEntity[];
  getEntityTypeConfig: (entityType: string) => {
    projectionSource?: boolean;
    projectionSourceRole?: ProjectionSourceRole;
  };
  sourceWeights: Record<string, number>;
  mintableEntityTypes: Set<string>;
  sourceRolePolicies: Record<ProjectionSourceRole, TopicSourceRolePolicy>;
  sourceRoleOverrides: Record<string, ProjectionSourceRole>;
}): { weight: number; canMint: boolean } {
  // Each deprecated field overrides only its own dimension: a config that
  // sets sourceWeights alone must not silently empty the mint allow-list.
  const hasLegacyWeights = Object.keys(params.sourceWeights).length > 0;
  const hasLegacyMintList = params.mintableEntityTypes.size > 0;

  return params.batch.reduce<{ weight: number; canMint: boolean }>(
    (policy, entity) => {
      const config = params.getEntityTypeConfig(entity.entityType);
      const role =
        params.sourceRoleOverrides[entity.entityType] ??
        config.projectionSourceRole ??
        (config.projectionSource === false ? "excluded" : "primary");
      const rolePolicy = params.sourceRolePolicies[role];
      const weight = hasLegacyWeights
        ? (params.sourceWeights[entity.entityType] ?? 1)
        : rolePolicy.weight;
      const canMint = hasLegacyMintList
        ? params.mintableEntityTypes.has(entity.entityType)
        : rolePolicy.canMint;
      return {
        weight: Math.max(policy.weight, weight),
        canMint: policy.canMint || canMint,
      };
    },
    { weight: 0, canMint: false },
  );
}

function getTopicSoftCeiling(
  sourceEntityCount: number,
  sourceRatio: number,
): number {
  return Math.min(24, Math.max(5, Math.ceil(sourceEntityCount / sourceRatio)));
}
