import type { InsightHandler } from "@brains/plugins";
import { topicEntitySchema } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { getTopicTitle } from "../lib/topic-presenter";

export interface TopicDistributionEntry {
  topic: string;
  title: string;
}

/**
 * Create the topic-distribution insight handler.
 * Returns topics with their titles.
 */
export function createTopicDistributionInsight(): InsightHandler {
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

    return { topics: distribution };
  };
}
