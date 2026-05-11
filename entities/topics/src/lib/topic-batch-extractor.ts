import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { generateIdFromText, getErrorMessage } from "@brains/utils";
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
  autoMerge?: boolean;
  mergeSimilarityThreshold?: number;
  /** Injected for tests. Constructed from context when omitted. */
  topicMergeSynthesizer?: ITopicMergeSynthesizer;
}

export interface ExtractTopicsBatchedResult {
  created: number;
  merged: number;
  skipped: number;
  batches: number;
}

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
  const autoMerge = options.autoMerge ?? false;
  const threshold = options.mergeSimilarityThreshold ?? 0.85;

  const batches = batchEntities(entities);
  const topicService = new TopicService(context.entityService, logger);
  const synthesizer =
    options.topicMergeSynthesizer ?? new TopicMergeSynthesizer(context, logger);

  const existingTopicTitles = await listExistingTopicTitles(
    context.entityService,
  );
  const inBatch = new Map<string, TopicEntity>();

  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const batch of batches) {
    logger.info(`Processing batch of ${batch.length} entities`);

    const batchContent = buildBatchPrompt(batch);
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
          if (autoMerge) {
            const candidate = await topicService.findMergeCandidate({
              incoming: topic,
              threshold,
              additionalCandidates: Array.from(inBatch.values()),
            });

            if (candidate) {
              const synthesized = await synthesizer.synthesize({
                existingTopic: candidate.topic,
                incomingTopic: topic,
              });

              const mergedTopic = await topicService.applySynthesizedMerge({
                existingId: candidate.topic.id,
                synthesized: { ...synthesized, title: candidate.title },
              });

              if (!mergedTopic) {
                throw new Error(`Failed to merge topic: ${topic.title}`);
              }

              inBatch.set(mergedTopic.id, mergedTopic);
              merged++;
              continue;
            }
          }

          const slug = generateIdFromText(topic.title);
          if (inBatch.has(slug)) {
            skipped++;
            continue;
          }

          const createResult = await topicService.createTopicOptimistic({
            title: topic.title,
            content: topic.content,
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
