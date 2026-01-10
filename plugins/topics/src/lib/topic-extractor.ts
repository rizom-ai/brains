import type { ServicePluginContext, BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { TopicSource } from "../schemas/topic";
import type { ExtractedTopicData } from "../schemas/extraction";

/**
 * Extracted topic with sources
 */
export interface ExtractedTopic extends ExtractedTopicData {
  sources: TopicSource[];
}

/**
 * Service for extracting topics from entities using AI
 */
export class TopicExtractor {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {}

  /**
   * Extract topics from an entity (post, link, summary, etc.)
   */
  public async extractFromEntity(
    entity: BaseEntity,
    minRelevanceScore: number,
  ): Promise<ExtractedTopic[]> {
    // Return empty for empty content
    if (!entity.content || entity.content.trim() === "") {
      this.logger.debug("Skipping topic extraction for empty entity", {
        entityId: entity.id,
        entityType: entity.entityType,
      });
      return [];
    }

    this.logger.info("Extracting topics from entity", {
      entityId: entity.id,
      entityType: entity.entityType,
      contentLength: entity.content.length,
      minRelevanceScore,
    });

    try {
      // Get entity title from metadata or use id as fallback
      const metadataTitle = entity.metadata["title"];
      const entityTitle =
        typeof metadataTitle === "string" ? metadataTitle : entity.id;

      // Build source reference for this entity
      // Get slug from metadata, fallback to id
      const metadataSlug = entity.metadata["slug"];
      const entitySlug =
        typeof metadataSlug === "string" ? metadataSlug : entity.id;

      const source: TopicSource = {
        slug: entitySlug,
        title: entityTitle,
        type: entity.entityType,
        entityId: entity.id,
        contentHash: entity.contentHash,
      };

      // Use AI service to extract topics from entity content
      const prompt = `Content Title: ${entityTitle}
Content Type: ${entity.entityType}

Content:
${entity.content}`;

      const result = await this.context.generateContent<{
        topics: ExtractedTopicData[];
      }>({
        prompt,
        templateName: "topics:extraction",
      });

      const extractedData = result.topics;

      // Filter by relevance score and deduplicate by title
      const topicMap = new Map<string, ExtractedTopic>();

      for (const data of extractedData) {
        if (data.relevanceScore >= minRelevanceScore) {
          const existing = topicMap.get(data.title);
          if (!existing || data.relevanceScore > existing.relevanceScore) {
            topicMap.set(data.title, {
              ...data,
              sources: [source],
            });
          }
        }
      }

      const relevantTopics = Array.from(topicMap.values());

      this.logger.debug(
        `Extracted ${relevantTopics.length} relevant topics from entity`,
        {
          entityId: entity.id,
          entityType: entity.entityType,
          topicsCount: relevantTopics.length,
        },
      );

      return relevantTopics;
    } catch (error) {
      this.logger.error("Failed to extract topics from entity", {
        entityId: entity.id,
        entityType: entity.entityType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
