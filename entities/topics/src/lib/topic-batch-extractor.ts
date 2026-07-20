import type {
  BaseEntity,
  ContentVisibility,
  EntityPluginContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { ExtractedTopicData } from "../schemas/extraction";
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
}

const DEFAULT_SOURCE_WEIGHTS: Record<string, number> = {
  "anchor-profile": 1,
  post: 1,
  summary: 1,
  deck: 0.85,
  project: 0.8,
  link: 0.6,
  note: 0.6,
};

const DEFAULT_MINTABLE_ENTITY_TYPES = [
  "anchor-profile",
  "post",
  "summary",
  "deck",
  "project",
];

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
  const sourceWeights = {
    ...DEFAULT_SOURCE_WEIGHTS,
    ...(options.sourceWeights ?? {}),
  };
  const mintableEntityTypes = new Set(
    options.mintableEntityTypes ?? DEFAULT_MINTABLE_ENTITY_TYPES,
  );
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

  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const batch of batches) {
    logger.info(`Processing batch of ${batch.length} entities`);

    const batchContent = buildBatchPrompt(batch);
    const sourcePolicy = getBatchSourcePolicy(
      batch,
      sourceWeights,
      mintableEntityTypes,
    );
    const prompt = buildTopicExtractionPrompt({
      entityTitle: `Batch of ${batch.length} entities`,
      entityType: "batch",
      content: batchContent,
      existingTopicTitles,
    });

    try {
      const result = await context.ai.generate<{
        topics: ExtractedTopicData[];
      }>({
        prompt,
        templateName: "topics:extraction",
      });

      const topics = result.topics.filter(
        (topic) => topic.relevanceScore >= minRelevanceScore,
      );

      for (const topic of topics) {
        try {
          const weightedRelevance = topic.relevanceScore * sourcePolicy.weight;
          if (weightedRelevance < reinforceRelevanceThreshold) {
            skipped++;
            continue;
          }

          let distinctFromCandidate = false;
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

              if (synthesized.verdict === "distinct") {
                // The semantic index found a close neighbor, but the final
                // merge judge ruled this is a separate durable domain.
                distinctFromCandidate = true;
              } else {
                const mergedTopic = await topicService.applySynthesizedMerge({
                  existingId: candidate.topic.id,
                  synthesized: { ...synthesized, title: candidate.title },
                  visibility: targetVisibility,
                });

                if (!mergedTopic) {
                  throw new Error(`Failed to merge topic: ${topic.title}`);
                }

                inBatch.set(mergedTopic.id, mergedTopic);
                merged++;
                continue;
              }
            }
          }

          const atSoftCeiling =
            existingTopicTitles.length + inBatch.size >= topicSoftCeiling;
          const mayCreate =
            sourcePolicy.canMint &&
            weightedRelevance >= createRelevanceThreshold &&
            (!atSoftCeiling || distinctFromCandidate);
          if (!mayCreate) {
            skipped++;
            continue;
          }

          const slug = topicService.getTopicIdForTitle(
            topic.title,
            targetVisibility,
          );
          if (inBatch.has(slug)) {
            skipped++;
            continue;
          }

          const createResult = await topicService.createTopicOptimistic({
            title: topic.title,
            content: topic.content,
            visibility: targetVisibility,
          });
          if (createResult.topic) {
            inBatch.set(createResult.topic.id, createResult.topic);
          }
          if (createResult.created) {
            created++;
          } else {
            skipped++;
          }
        } catch (error) {
          logger.error("Topic batch item failed", {
            title: topic.title,
            error: getErrorMessage(error),
          });
        }
      }
    } catch (error) {
      logger.error("Batch topic extraction failed", {
        batchSize: batch.length,
        promptChars: prompt.length,
        error: getErrorMessage(error),
      });
    }
  }

  const summary: ExtractTopicsBatchedResult = {
    created,
    merged,
    skipped,
    batches: batches.length,
  };

  if (created > 0 || merged > 0) {
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

function getBatchSourcePolicy(
  batch: BaseEntity[],
  sourceWeights: Record<string, number>,
  mintableEntityTypes: Set<string>,
): { weight: number; canMint: boolean } {
  return batch.reduce<{ weight: number; canMint: boolean }>(
    (policy, entity) => {
      const weight = sourceWeights[entity.entityType] ?? 1;
      return {
        weight: Math.max(policy.weight, weight),
        canMint: policy.canMint || mintableEntityTypes.has(entity.entityType),
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
