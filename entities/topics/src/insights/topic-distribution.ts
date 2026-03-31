import type { InsightHandler } from "@brains/plugins";
import type { TopicEntity } from "../schemas/topic";

export interface TopicDistributionEntry {
  topic: string;
  sourceCount: number;
  sourceTypes: string[];
}

/**
 * Create the topic-distribution insight handler.
 * Returns topics ranked by source count, with source types and orphaned topics.
 */
export function createTopicDistributionInsight(): InsightHandler {
  return async (entityService) => {
    if (!entityService.hasEntityType("topic")) {
      return { topics: [], orphanedTopics: [] };
    }

    const topics = await entityService.listEntities<TopicEntity>("topic");

    const distribution: TopicDistributionEntry[] = [];
    const orphanedTopics: { topic: string }[] = [];

    for (const topic of topics) {
      const sourceList = topic.metadata.sources ?? [];
      const sourceTypes = [...new Set(sourceList.map((s) => s.type))];

      if (sourceList.length === 0) {
        orphanedTopics.push({ topic: topic.id });
      }

      distribution.push({
        topic: topic.id,
        sourceCount: sourceList.length,
        sourceTypes,
      });
    }

    distribution.sort((a, b) => b.sourceCount - a.sourceCount);

    return { topics: distribution, orphanedTopics };
  };
}
