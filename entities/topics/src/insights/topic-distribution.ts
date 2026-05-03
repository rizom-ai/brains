import type { InsightHandler } from "@brains/plugins";
import type { TopicEntity } from "../schemas/topic";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { TopicAdapter } from "../lib/topic-adapter";

export interface TopicDistributionEntry {
  topic: string;
  title: string;
}

/**
 * Create the topic-distribution insight handler.
 * Returns topics with their titles.
 */
export function createTopicDistributionInsight(): InsightHandler {
  const adapter = new TopicAdapter();

  return async (entityService) => {
    if (!entityService.hasEntityType(TOPIC_ENTITY_TYPE)) {
      return { topics: [] };
    }

    const topics =
      await entityService.listEntities<TopicEntity>(TOPIC_ENTITY_TYPE);

    const distribution: TopicDistributionEntry[] = topics.map((topic) => {
      const parsed = adapter.parseTopicBody(topic.content);
      return {
        topic: topic.id,
        title: parsed.title,
      };
    });

    return { topics: distribution };
  };
}
