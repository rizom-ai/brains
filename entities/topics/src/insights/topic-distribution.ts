import type { InsightHandler } from "@brains/plugins";

/**
 * Create the topic-distribution insight handler.
 * Returns topics ranked by source count, with source types and orphaned topics.
 */
export function createTopicDistributionInsight(): InsightHandler {
  return async (entityService) => {
    if (!entityService.hasEntityType("topic")) {
      return { topics: [], orphanedTopics: [] };
    }

    const topics = await entityService.listEntities("topic");

    interface TopicEntry {
      topic: string;
      sourceCount: number;
      sourceTypes: string[];
    }

    interface OrphanedEntry {
      topic: string;
    }

    const distribution: TopicEntry[] = [];
    const orphanedTopics: OrphanedEntry[] = [];

    for (const topic of topics) {
      const sources = topic.metadata["sources"];
      const sourceList = Array.isArray(sources) ? sources : [];

      const sourceTypes = [
        ...new Set(
          sourceList
            .map((s: Record<string, unknown>) => s["type"])
            .filter((t): t is string => typeof t === "string"),
        ),
      ];

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
