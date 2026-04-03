import type { IEntityService, SearchResult } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { TopicEntity } from "../types";
import type { TopicMetadata } from "../schemas/topic";
import { TopicAdapter } from "./topic-adapter";
import { generateIdFromText } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";

export class TopicService {
  private adapter: TopicAdapter;

  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.adapter = new TopicAdapter();
  }

  public async createTopic(params: {
    title: string;
    content: string;
    keywords: string[];
  }): Promise<TopicEntity | null> {
    const topicId = generateIdFromText(params.title);

    // If topic exists by slug, skip (preserves user edits)
    const existing = await this.getTopic(topicId);
    if (existing) {
      this.logger.debug("Topic already exists, skipping", {
        id: topicId,
        title: params.title,
      });
      return existing;
    }

    const metadata: TopicMetadata = {};

    const body = this.adapter.createTopicBody({
      title: params.title,
      content: params.content,
      keywords: params.keywords,
    });

    try {
      const { entityId } = await this.entityService.createEntity({
        id: topicId,
        entityType: "topic",
        content: body,
        metadata,
      });

      const topic: TopicEntity = {
        id: entityId,
        entityType: "topic",
        content: body,
        contentHash: computeContentHash(body),
        metadata,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      this.logger.debug("Created topic", {
        id: topic.id,
        title: params.title,
      });

      return topic;
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        this.logger.debug("Topic was created concurrently, fetching existing", {
          id: topicId,
          title: params.title,
        });
        return this.getTopic(topicId);
      }
      throw error;
    }
  }

  public async updateTopic(
    id: string,
    updates: {
      content?: string;
      keywords?: string[];
    },
  ): Promise<TopicEntity | null> {
    const existing = await this.getTopic(id);
    if (!existing) {
      return null;
    }

    const parsed = this.adapter.parseTopicBody(existing.content);

    const title = parsed.title;
    const content = updates.content ?? parsed.content;
    const keywords = updates.keywords ?? parsed.keywords;

    const metadata: TopicMetadata = {};

    const newBody = this.adapter.createTopicBody({
      title,
      content,
      keywords,
    });

    const { entityId } = await this.entityService.updateEntity({
      ...existing,
      content: newBody,
      metadata,
    });

    const updatedTopic: TopicEntity = {
      ...existing,
      id: entityId,
      content: newBody,
      contentHash: computeContentHash(newBody),
      metadata,
      updated: new Date().toISOString(),
    };

    this.logger.info("Updated topic", { id });

    return updatedTopic;
  }

  public async getTopic(id: string): Promise<TopicEntity | null> {
    return this.entityService.getEntity<TopicEntity>("topic", id);
  }

  public async listTopics(params?: {
    limit?: number;
    offset?: number;
  }): Promise<TopicEntity[]> {
    return this.entityService.listEntities<TopicEntity>("topic", params);
  }

  public async searchTopics(
    query: string,
    limit = 10,
  ): Promise<SearchResult<TopicEntity>[]> {
    return this.entityService.search<TopicEntity>(query, {
      types: ["topic"],
      limit,
    });
  }

  public async deleteTopic(id: string): Promise<boolean> {
    const result = await this.entityService.deleteEntity("topic", id);
    if (result) {
      this.logger.info("Deleted topic", { id });
    }
    return result;
  }

  public async mergeTopics(
    topicIds: string[],
    targetId?: string,
  ): Promise<TopicEntity | null> {
    const topics = await Promise.all(topicIds.map((id) => this.getTopic(id)));
    const validTopics = topics.filter((t): t is TopicEntity => t !== null);

    if (validTopics.length < 2) {
      this.logger.warn("Not enough valid topics to merge", { topicIds });
      return null;
    }

    const target = targetId
      ? validTopics.find((t) => t.id === targetId)
      : validTopics[0];

    if (!target) {
      this.logger.error("Target topic not found", { targetId });
      return null;
    }

    const allContent: string[] = [];
    const allKeywords = new Set<string>();

    for (const topic of validTopics) {
      const parsed = this.adapter.parseTopicBody(topic.content);

      if (topic.id !== target.id) {
        allContent.push(parsed.content);
      }

      parsed.keywords.forEach((k) => allKeywords.add(k));
    }

    const targetParsed = this.adapter.parseTopicBody(target.content);
    const mergedContent = [targetParsed.content, ...allContent].join(
      "\n\n---\n\n",
    );

    const merged = await this.updateTopic(target.id, {
      content: mergedContent,
      keywords: Array.from(allKeywords),
    });

    if (merged) {
      for (const topic of validTopics) {
        if (topic.id !== target.id) {
          await this.deleteTopic(topic.id);
        }
      }

      this.logger.info("Merged topics", {
        mergedInto: target.id,
        deletedIds: topicIds.filter((id) => id !== target.id),
      });
    }

    return merged;
  }
}
