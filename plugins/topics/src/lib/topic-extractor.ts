import type { Logger, ServicePluginContext, BaseEntity } from "@brains/plugins";
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
      const source: TopicSource = {
        id: entity.id,
        title: entityTitle,
        type: entity.entityType,
      };

      // Use AI service to extract topics from entity content
      const prompt = `You are an expert at analyzing content and extracting key topics.

Analyze the following content and extract the main topics discussed.

For each topic, provide:
1. A SHORT, CATEGORICAL title (15-40 chars max) - Use broad categories, not specific descriptions
   Good examples: "Machine Learning", "API Design", "Team Collaboration", "User Experience"
   Bad examples: "Discussion about implementing new features", "How to improve communication"
2. A brief summary (2-3 sentences)
3. The main content points discussed
4. 5-10 relevant keywords that are DIRECTLY related to the topic content
5. A relevance score from 0 to 1 (based on depth of discussion, importance, and actionability)

IMPORTANT: Create DISTINCT topics. Only group content that is truly about the same subject.

Content Title: ${entityTitle}
Content Type: ${entity.entityType}

Content:
${entity.content}

Return an array of topics in the required JSON format.`;

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
