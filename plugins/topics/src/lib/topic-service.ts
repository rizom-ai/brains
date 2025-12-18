import type { Logger, IEntityService, SearchResult } from "@brains/plugins";
import type { TopicEntity } from "../types";
import type { TopicMetadata, TopicSource } from "../schemas/topic";
import { TopicAdapter } from "./topic-adapter";
import { generateIdFromText, computeContentHash } from "@brains/utils";

/**
 * Service for managing topics
 */
export class TopicService {
  private adapter: TopicAdapter;

  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.adapter = new TopicAdapter();
  }

  /**
   * Create a new topic (with deduplication)
   */
  public async createTopic(params: {
    title: string;
    content: string;
    sources: TopicSource[];
    keywords: string[];
  }): Promise<TopicEntity | null> {
    // Generate a proper slug ID from the title
    const topicId = generateIdFromText(params.title);

    // Check if topic already exists
    const existing = await this.getTopic(topicId);
    if (existing) {
      this.logger.info("Topic already exists, updating instead", {
        id: topicId,
        title: params.title,
      });

      // Merge new information with existing topic
      const parsed = this.adapter.parseTopicBody(existing.content);
      return this.updateTopic(topicId, {
        sources: params.sources,
        keywords: [...new Set([...parsed.keywords, ...params.keywords])],
      });
    }

    const metadata: TopicMetadata = {};

    // Create the structured content body with the actual title
    const body = this.adapter.createTopicBody({
      title: params.title,
      content: params.content,
      keywords: params.keywords,
      sources: params.sources,
    });

    try {
      const { entityId } = await this.entityService.createEntity({
        id: topicId,
        entityType: "topic",
        content: body,
        metadata,
      });

      // Entity is created asynchronously, so we construct the expected entity
      // rather than trying to fetch it immediately (it won't be in DB yet)
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
      // Handle case where another process created the topic concurrently
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

  /**
   * Update an existing topic
   */
  public async updateTopic(
    id: string,
    updates: {
      content?: string;
      sources?: TopicSource[];
      keywords?: string[];
    },
  ): Promise<TopicEntity | null> {
    const existing = await this.getTopic(id);
    if (!existing) {
      return null;
    }

    const parsed = this.adapter.parseTopicBody(existing.content);

    // Update body sections if provided
    const title = parsed.title; // Keep the original title
    const content = updates.content ?? parsed.content;
    const keywords = updates.keywords ?? parsed.keywords;

    // Deduplicate sources by slug using a Map
    const sourcesMap = new Map(parsed.sources.map((s) => [s.slug, s]));
    if (updates.sources) {
      updates.sources.forEach((source) => sourcesMap.set(source.slug, source));
    }
    const sources = Array.from(sourcesMap.values());

    // Metadata stays empty
    const metadata: TopicMetadata = {};

    // Re-create the topic body using the adapter
    const newBody = this.adapter.createTopicBody({
      title,
      content,
      keywords,
      sources,
    });

    // Update the entity
    const { entityId } = await this.entityService.updateEntity({
      ...existing,
      content: newBody,
      metadata,
    });

    // Entity is updated asynchronously, so we construct the expected entity
    // rather than trying to fetch it immediately (it won't be in DB yet)
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

  /**
   * Get a topic by ID
   */
  public async getTopic(id: string): Promise<TopicEntity | null> {
    return this.entityService.getEntity<TopicEntity>("topic", id);
  }

  /**
   * List topics with pagination
   */
  public async listTopics(params?: {
    limit?: number;
    offset?: number;
  }): Promise<TopicEntity[]> {
    const listOptions = {
      ...(params?.limit !== undefined && { limit: params.limit }),
      ...(params?.offset !== undefined && { offset: params.offset }),
    };

    return this.entityService.listEntities<TopicEntity>("topic", listOptions);
  }

  /**
   * Search topics by query
   */
  public async searchTopics(
    query: string,
    limit = 10,
  ): Promise<SearchResult<TopicEntity>[]> {
    return this.entityService.search<TopicEntity>(query, {
      types: ["topic"],
      limit,
    });
  }

  /**
   * Delete a topic
   */
  public async deleteTopic(id: string): Promise<boolean> {
    const result = await this.entityService.deleteEntity("topic", id);
    if (result) {
      this.logger.info("Deleted topic", { id });
    }
    return result;
  }

  /**
   * Merge multiple topics into one
   */
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

    // Use first topic as target if not specified
    const target = targetId
      ? validTopics.find((t) => t.id === targetId)
      : validTopics[0];

    if (!target) {
      this.logger.error("Target topic not found", { targetId });
      return null;
    }

    // Combine all sources and content
    const allSources: TopicSource[] = [];
    const allContent: string[] = [];
    const allKeywords = new Set<string>();

    for (const topic of validTopics) {
      const parsed = this.adapter.parseTopicBody(topic.content);

      // Collect all sources
      allSources.push(...parsed.sources);

      if (topic.id !== target.id) {
        allContent.push(parsed.content);
      }

      // Collect keywords from parsed body
      parsed.keywords.forEach((k) => allKeywords.add(k));
    }

    // Update target topic with merged data
    const targetParsed = this.adapter.parseTopicBody(target.content);
    const mergedContent = [targetParsed.content, ...allContent].join(
      "\n\n---\n\n",
    );

    // Deduplicate sources by slug using a Map
    const sourcesMap = new Map(allSources.map((s) => [s.slug, s]));
    const uniqueSources = Array.from(sourcesMap.values());

    const merged = await this.updateTopic(target.id, {
      content: mergedContent,
      sources: uniqueSources,
      keywords: Array.from(allKeywords),
    });

    if (merged) {
      // Delete other topics
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
