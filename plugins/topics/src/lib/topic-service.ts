import type { Logger, IEntityService } from "@brains/plugins";
import type { TopicEntity } from "../types";
import type { TopicMetadata, TopicSource } from "../schemas/topic";
import { TopicAdapter } from "./topic-adapter";

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
    summary: string;
    content: string;
    sources: TopicSource[];
    keywords: string[];
    relevanceScore: number;
  }): Promise<TopicEntity | null> {
    // Check if topic already exists
    const existing = await this.getTopic(params.title);
    if (existing) {
      this.logger.info("Topic already exists, updating instead", { 
        id: params.title 
      });
      
      // Merge new information with existing topic
      return this.updateTopic(params.title, {
        sources: params.sources,
        keywords: [
          ...new Set([
            ...existing.metadata.keywords,
            ...params.keywords,
          ]),
        ],
        relevanceScore: Math.max(
          existing.metadata.relevanceScore,
          params.relevanceScore,
        ),
      });
    }

    const now = new Date();

    const metadata: TopicMetadata = {
      keywords: params.keywords,
      relevanceScore: params.relevanceScore,
      firstSeen: now,
      lastSeen: now,
      mentionCount: params.sources.length,
    };

    // Create the structured content body
    const body = this.adapter.createTopicBody({
      summary: params.summary,
      content: params.content,
      references: params.sources,
    });

    try {
      const { entityId } = await this.entityService.createEntity({
        id: params.title, // Use title as the ID for topics
        entityType: "topic",
        content: body,
        metadata,
      });

      // Retrieve the created entity
      const topic = await this.entityService.getEntity<TopicEntity>(
        "topic",
        entityId,
      );

      if (topic) {
        this.logger.info("Created topic", { id: topic.id });
      }

      return topic;
    } catch (error) {
      // Handle case where another process created the topic concurrently
      if (error instanceof Error && error.message.includes("already exists")) {
        this.logger.info("Topic was created concurrently, fetching existing", { 
          id: params.title 
        });
        return this.getTopic(params.title);
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
      summary?: string;
      content?: string;
      sources?: TopicSource[];
      keywords?: string[];
      relevanceScore?: number;
    },
  ): Promise<TopicEntity | null> {
    const existing = await this.getTopic(id);
    if (!existing) {
      return null;
    }

    const parsed = this.adapter.parseTopicBody(existing.content);

    // Update body sections if provided
    const summary = updates.summary ?? parsed.summary;
    const content = updates.content ?? parsed.content;
    const sources = updates.sources ?? parsed.sources;

    // Update metadata
    const metadata: TopicMetadata = {
      ...existing.metadata,
      keywords: updates.keywords ?? existing.metadata.keywords,
      relevanceScore:
        updates.relevanceScore ?? existing.metadata.relevanceScore,
      lastSeen: new Date(),
    };

    if (updates.sources) {
      metadata.mentionCount =
        existing.metadata.mentionCount + updates.sources.length;
    }

    // Re-create the topic body using the adapter
    const newBody = this.adapter.createTopicBody({
      summary,
      content,
      references: sources,
    });

    // Update the entity
    const { entityId } = await this.entityService.updateEntity({
      ...existing,
      content: newBody,
      metadata,
    });

    // Retrieve the updated entity
    const updatedTopic = await this.entityService.getEntity<TopicEntity>(
      "topic",
      entityId,
    );

    if (updatedTopic) {
      this.logger.info("Updated topic", { id });
    }

    return updatedTopic;
  }

  /**
   * Get a topic by ID
   */
  public async getTopic(id: string): Promise<TopicEntity | null> {
    return this.entityService.getEntity<TopicEntity>("topic", id);
  }

  /**
   * List topics with optional filtering
   */
  public async listTopics(params?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TopicEntity[]> {
    const listOptions = {
      ...(params?.limit !== undefined && { limit: params.limit }),
      ...(params?.offset !== undefined && { offset: params.offset }),
    };

    const topics = await this.entityService.listEntities<TopicEntity>(
      "topic",
      listOptions,
    );

    // Filter by date range if provided
    if (params?.startDate || params?.endDate) {
      return topics.filter((topic) => {
        if (params.startDate && topic.metadata.lastSeen < params.startDate) {
          return false;
        }
        if (params.endDate && topic.metadata.lastSeen > params.endDate) {
          return false;
        }
        return true;
      });
    }

    return topics;
  }

  /**
   * Search topics by query
   */
  public async searchTopics(query: string, limit = 10): Promise<TopicEntity[]> {
    const results = await this.entityService.search<TopicEntity>(query, {
      types: ["topic"],
      limit,
    });

    return results.map((r) => r.entity);
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
    let totalMentions = 0;
    let maxRelevance = 0;
    let earliestSeen = target.metadata.firstSeen;
    let latestSeen = target.metadata.lastSeen;

    for (const topic of validTopics) {
      const parsed = this.adapter.parseTopicBody(topic.content);

      // Collect all sources
      allSources.push(...parsed.sources);

      if (topic.id !== target.id) {
        allContent.push(parsed.content);
      }

      topic.metadata.keywords.forEach((k) => allKeywords.add(k));
      maxRelevance = Math.max(maxRelevance, topic.metadata.relevanceScore);
      totalMentions += topic.metadata.mentionCount;

      if (topic.metadata.firstSeen < earliestSeen) {
        earliestSeen = topic.metadata.firstSeen;
      }
      if (topic.metadata.lastSeen > latestSeen) {
        latestSeen = topic.metadata.lastSeen;
      }
    }

    // Update target topic with merged data
    const targetParsed = this.adapter.parseTopicBody(target.content);
    const mergedContent = [targetParsed.content, ...allContent].join(
      "\n\n---\n\n",
    );

    // Deduplicate sources by id
    const uniqueSources = Array.from(
      new Map(allSources.map((s) => [s.id, s])).values(),
    );

    const merged = await this.updateTopic(target.id, {
      content: mergedContent,
      sources: uniqueSources,
      keywords: Array.from(allKeywords),
      relevanceScore: maxRelevance,
    });

    if (merged) {
      // Update metadata with correct dates and counts
      merged.metadata.firstSeen = earliestSeen;
      merged.metadata.lastSeen = latestSeen;
      merged.metadata.mentionCount = totalMentions;

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
