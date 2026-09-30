import type { InsightHandler } from "@brains/plugins";
import { topicEntitySchema } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { getTopicTitle } from "../lib/topic-presenter";

type InsightEntityService = Parameters<InsightHandler>[0];

export interface TopicDistributionEntry {
  topic: string;
  title: string;
}

export interface TopicDistributionOptions {
  /** Whether topics are extracted from entities of this type. */
  isSourceType: (type: string, entityService: InsightEntityService) => boolean;
  autoExtraction: boolean;
}

/**
 * Create the topic-distribution insight handler.
 * Returns topics with their titles. With no visible topics but visible source
 * content, it says so: extraction runs in the background, and an empty list
 * would otherwise read as "nothing written".
 */
export function createTopicDistributionInsight(
  options: TopicDistributionOptions,
): InsightHandler {
  return async (entityService, visibilityScope) => {
    if (!entityService.hasEntityType(TOPIC_ENTITY_TYPE)) {
      return { topics: [] };
    }

    const topics = await entityService.listEntities(
      {
        entityType: TOPIC_ENTITY_TYPE,
        options: { filter: { visibilityScope } },
      },
      topicEntitySchema,
    );

    const distribution: TopicDistributionEntry[] = topics.map((topic) => ({
      topic: topic.id,
      title: getTopicTitle(topic),
    }));
    if (distribution.length > 0) return { topics: distribution };

    const counts = await Promise.all(
      entityService
        .getEntityTypes()
        .filter((type) => options.isSourceType(type, entityService))
        .map((entityType) =>
          entityService.countEntities({
            entityType,
            options: { filter: { visibilityScope } },
          }),
        ),
    );
    const sourceEntities = counts.reduce((sum, count) => sum + count, 0);
    if (sourceEntities === 0) return { topics: [] };

    const reason = options.autoExtraction
      ? "Topics have not been extracted yet; extraction runs in the background."
      : "Automatic topic extraction is off.";
    return {
      topics: [],
      unextracted: {
        sourceEntities,
        hint: `${reason} ${sourceEntities} visible ${sourceEntities === 1 ? "entity exists" : "entities exist"}: use system_search to answer from the content itself.`,
      },
    };
  };
}
