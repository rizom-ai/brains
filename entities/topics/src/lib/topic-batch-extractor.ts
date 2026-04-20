import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage, generateIdFromText } from "@brains/utils";
import type { ExtractedTopicData } from "../schemas/extraction";
import { batchEntities } from "./batch-entities";
import {
  buildTopicExtractionPrompt,
  listExistingTopicTitles,
} from "./extraction-prompt";
import { TopicService } from "./topic-service";

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
): Promise<{ created: number; skipped: number; batches: number }> {
  if (entities.length === 0) {
    return { created: 0, skipped: 0, batches: 0 };
  }

  const batches = batchEntities(entities);
  const topicService = new TopicService(context.entityService, logger);

  let created = 0;
  let skipped = 0;

  for (const batch of batches) {
    logger.info(`Processing batch of ${batch.length} entities`);

    const batchContent = buildBatchPrompt(batch);
    const existingTopicTitles = await listExistingTopicTitles(
      context.entityService,
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

      for (const topic of result.topics) {
        const slug = generateIdFromText(topic.title);
        const existing = await topicService.getTopic(slug);

        if (existing) {
          skipped++;
          continue;
        }

        await topicService.createTopic({
          title: topic.title,
          content: topic.content,
        });
        created++;
      }
    } catch (error) {
      logger.error("Batch topic extraction failed", {
        batchSize: batch.length,
        promptChars: prompt.length,
        error: getErrorMessage(error),
      });
    }
  }

  return { created, skipped, batches: batches.length };
}
