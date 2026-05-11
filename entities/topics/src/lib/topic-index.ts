import { generateIdFromText } from "@brains/utils";
import type { TopicEntity } from "../types";
import type { ExtractedTopicData } from "../schemas/extraction";
import { TopicAdapter } from "./topic-adapter";
import type { TopicMergeCandidate, TopicService } from "./topic-service";
import { scoreTopicSimilarity } from "./topic-merge";

interface TopicIndexEntry {
  topic: TopicEntity;
  title: string;
}

/**
 * In-memory index of existing topic IDs/titles for one extraction or
 * processing wave. Callers must update it after every create/merge.
 */
export class TopicIndex {
  private readonly entries = new Map<string, TopicIndexEntry>();
  private readonly adapter = new TopicAdapter();

  private constructor(topics: TopicEntity[]) {
    for (const topic of topics) {
      this.set(topic);
    }
  }

  public static async create(topicService: TopicService): Promise<TopicIndex> {
    const topics = await topicService.listTopics();
    return new TopicIndex(topics);
  }

  public getTitles(): string[] {
    return Array.from(this.entries.values()).map((entry) => entry.title);
  }

  public hasSlug(title: string): boolean {
    return this.entries.has(generateIdFromText(title));
  }

  public set(topic: TopicEntity): void {
    const parsed = this.adapter.parseTopicBody(topic.content);
    this.entries.set(topic.id, {
      topic,
      title: parsed.title,
    });
  }

  public findMergeCandidate(
    incoming: Pick<ExtractedTopicData, "title">,
    threshold: number,
  ): TopicMergeCandidate | null {
    let bestCandidate: TopicMergeCandidate | null = null;

    for (const entry of this.entries.values()) {
      const score = scoreTopicSimilarity(incoming, { title: entry.title });
      if (score < threshold) continue;
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          topic: entry.topic,
          title: entry.title,
          score,
        };
      }
    }

    return bestCandidate;
  }
}
