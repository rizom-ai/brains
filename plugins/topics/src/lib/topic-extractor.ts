import type { Logger, ServicePluginContext, Message } from "@brains/plugins";
import type { TopicSource } from "../schemas/topic";
import type { ExtractedTopicData } from "../schemas/extraction";

/**
 * Extracted topic with sources
 */
export interface ExtractedTopic extends ExtractedTopicData {
  sources: TopicSource[];
}

/**
 * Service for extracting topics from conversations using AI
 */
export class TopicExtractor {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly logger: Logger,
  ) {}

  /**
   * Extract topics from a specific conversation window
   */
  public async extractFromConversationWindow(
    conversationId: string,
    startIdx: number,
    endIdx: number,
    minRelevanceScore: number,
  ): Promise<ExtractedTopic[]> {
    this.logger.info("Extracting topics from conversation window", {
      conversationId,
      startIdx,
      endIdx,
      minRelevanceScore,
    });

    // Get messages for the specified window using range
    const messages = await this.context.getMessages(conversationId, {
      range: { start: startIdx, end: endIdx },
    });

    return this.extractFromMessages(
      conversationId,
      messages,
      minRelevanceScore,
    );
  }

  /**
   * Extract topics from provided messages
   */
  public async extractFromMessages(
    conversationId: string,
    messages: Message[],
    minRelevanceScore: number,
  ): Promise<ExtractedTopic[]> {
    if (messages.length === 0) {
      this.logger.info("No messages provided for extraction");
      return [];
    }

    // Extract topics
    const extractedTopics = await this.extractTopics(conversationId, messages);

    // Filter by relevance score and deduplicate by title
    const topicMap = new Map<string, ExtractedTopic>();

    for (const topic of extractedTopics) {
      if (topic.relevanceScore >= minRelevanceScore) {
        const existing = topicMap.get(topic.title);
        if (!existing || topic.relevanceScore > existing.relevanceScore) {
          topicMap.set(topic.title, topic);
        }
      }
    }

    const relevantTopics = Array.from(topicMap.values());

    this.logger.debug(
      `Extracted ${relevantTopics.length} relevant topics from ${messages.length} messages`,
    );
    return relevantTopics;
  }

  /**
   * Extract topics from a conversation
   */
  private async extractTopics(
    conversationId: string,
    messages: Message[],
  ): Promise<ExtractedTopic[]> {
    // Prepare conversation text for AI analysis
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    try {
      // Use AI service with schema through context
      const prompt = `You are an expert at analyzing conversations and extracting key topics.
      
Analyze the following conversation and extract the main topics discussed.

For each topic, provide:
1. A SHORT, CATEGORICAL title (15-40 chars max) - Use broad categories, not specific descriptions
   Good examples: "Product Strategy", "Team Collaboration", "API Design", "User Feedback"
   Bad examples: "Discussion about implementing new features for the dashboard", "How to improve team communication"
2. A brief summary (2-3 sentences)
3. The main content points discussed
4. 5-10 relevant keywords that are DIRECTLY related to the topic content
5. A relevance score from 0 to 1 (based on depth of discussion, importance, and actionability)

IMPORTANT: Create DISTINCT topics. Only group content that is truly about the same subject.

Conversation:
${conversationText}

Return an array of topics in the required JSON format.`;

      const result = await this.context.generateContent<{
        topics: ExtractedTopicData[];
      }>({
        prompt,
        templateName: "topics:extraction",
        conversationHistory: conversationId,
      });

      const extractedData = result.topics;

      // Create ExtractedTopic objects with sources
      const topics: ExtractedTopic[] = [];

      for (const data of extractedData) {
        // Create topic source reference - just the conversation ID
        topics.push({
          ...data,
          sources: [conversationId],
        });
      }

      return topics;
    } catch (error) {
      this.logger.error("Failed to extract topics with AI", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
