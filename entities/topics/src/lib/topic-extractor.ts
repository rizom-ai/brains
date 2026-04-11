import { getErrorMessage } from "@brains/utils";
import type { EntityPluginContext, BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExtractedTopicData } from "../schemas/extraction";
import {
  buildTopicExtractionPrompt,
  listExistingTopicTitles,
} from "./extraction-prompt";

/**
 * Extracted topic — title, description, keywords, relevance score.
 */
export type ExtractedTopic = ExtractedTopicData;

/**
 * Service for extracting topics from entities using AI
 */
export class TopicExtractor {
  constructor(
    private readonly context: EntityPluginContext,
    private readonly logger: Logger,
  ) {}

  /**
   * Extract topics from an entity (post, link, summary, etc.)
   */
  public async extractFromEntity(
    entity: BaseEntity,
    minRelevanceScore: number,
  ): Promise<ExtractedTopic[]> {
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
      const metadataTitle = entity.metadata["title"];
      const entityTitle =
        typeof metadataTitle === "string" ? metadataTitle : entity.id;
      const existingTopicTitles = await listExistingTopicTitles(
        this.context.entityService,
      );

      const prompt = buildTopicExtractionPrompt({
        entityTitle,
        entityType: entity.entityType,
        content: entity.content,
        existingTopicTitles,
      });

      const result = await this.context.ai.generate<{
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
            topicMap.set(data.title, data);
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
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
