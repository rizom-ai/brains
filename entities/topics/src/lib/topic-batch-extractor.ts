import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import type { ExtractedTopicData } from "../schemas/extraction";
import { batchEntities } from "./batch-entities";
import { buildTopicExtractionPrompt } from "./extraction-prompt";
import { TopicService } from "./topic-service";
import { TopicIndex } from "./topic-index";
import { TOPICS_BATCH_COMPLETED_EVENT } from "./constants";

/**
 * Build the prompt content for a batch of entities.
 * Each entity is numbered, typed, titled, and separated by dividers.
 * Anchor profile is included as an entity when in includeEntityTypes.
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
}

/**
 * Extract topics from entities in batches.
 *
 * Groups entities into token-budget-aware batches, makes one LLM call
 * per batch, deduplicates topics by slug, creates topic entities.
 */
export async function extractTopicsBatched(
  entities: BaseEntity[],
  context: EntityPluginContext,
  logger: Logger,
  options: ExtractTopicsBatchedOptions = {},
): Promise<{ created: number; skipped: number; batches: number }> {
  if (entities.length === 0) {
    return { created: 0, skipped: 0, batches: 0 };
  }

  const batches = batchEntities(entities);
  const topicService = new TopicService(context.entityService, logger);
  const topicIndex = await TopicIndex.create(topicService);

  let created = 0;
  let skipped = 0;

  for (const batch of batches) {
    logger.info(`Processing batch of ${batch.length} entities`);

    const batchContent = buildBatchPrompt(batch);
    const existingTopicTitles = topicIndex.getTitles();
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
        (topic) => topic.relevanceScore >= (options.minRelevanceScore ?? 0),
      );

      for (const topic of topics) {
        if (topicIndex.hasSlug(topic.title)) {
          skipped++;
          continue;
        }

        const createResult = await topicService.createTopicOptimistic({
          title: topic.title,
          content: topic.content,
        });

        if (createResult.topic) {
          topicIndex.set(createResult.topic);
        }

        if (createResult.created) {
          created++;
        } else {
          skipped++;
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

  const result = { created, skipped, batches: batches.length };

  if (created > 0) {
    await context.messaging.send({
      type: TOPICS_BATCH_COMPLETED_EVENT,
      payload: result,
      broadcast: true,
    });
  }

  return result;
}
