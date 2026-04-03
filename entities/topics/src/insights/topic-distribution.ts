import type { InsightHandler } from "@brains/plugins";
import type { TopicEntity } from "../schemas/topic";
import { TopicAdapter } from "../lib/topic-adapter";

export interface TopicDistributionEntry {
  topic: string;
  title: string;
  keywords: string[];
}

/**
 * Create the topic-distribution insight handler.
 * Returns topics with their titles and keywords.
 */
export function createTopicDistributionInsight(): InsightHandler {
  const adapter = new TopicAdapter();

  return async (entityService) => {
    if (!entityService.hasEntityType("topic")) {
      return { topics: [] };
    }

    const topics = await entityService.listEntities<TopicEntity>("topic");

    const distribution: TopicDistributionEntry[] = topics.map((topic) => {
      const parsed = adapter.parseTopicBody(topic.content);
      return {
        topic: topic.id,
        title: parsed.title,
        keywords: parsed.keywords,
      };
    });

    return { topics: distribution };
  };
}
