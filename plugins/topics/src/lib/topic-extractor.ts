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
   * Extract topics from recent messages using a sliding window approach
   */
  public async extractFromRecentMessages(
    windowSize: number,
    minRelevanceScore: number,
  ): Promise<ExtractedTopic[]> {
    this.logger.info("Extracting topics from recent messages", {
      windowSize,
      minRelevanceScore,
    });

    // Get all active conversations
    const conversations = await this.context.searchConversations("");
    
    if (conversations.length === 0) {
      this.logger.info("No conversations found");
      return [];
    }

    // Collect the most recent messages across all conversations
    const allRecentMessages: Array<{
      conversationId: string;
      messages: Message[];
    }> = [];

    for (const conversation of conversations) {
      const messages = await this.context.getRecentMessages(
        conversation.id,
        windowSize, // Get exactly windowSize messages
      );

      if (messages.length > 0) {
        allRecentMessages.push({
          conversationId: conversation.id,
          messages,
        });
      }
    }

    if (allRecentMessages.length === 0) {
      this.logger.info("No recent messages found");
      return [];
    }

    const topics: ExtractedTopic[] = [];

    // Process each conversation's window
    for (const { conversationId, messages } of allRecentMessages) {
      // Only process if we have enough messages for meaningful extraction
      if (messages.length < windowSize / 2) {
        continue;
      }

      // Extract topics using AI
      const extractedTopics = await this.extractTopicsWithAI(
        conversationId,
        messages,
        new Date(),
      );

      // Filter by relevance score and add to results
      const relevantTopics = extractedTopics.filter(
        (topic) => topic.relevanceScore >= minRelevanceScore,
      );

      topics.push(...relevantTopics);
    }

    this.logger.info(
      `Extracted ${topics.length} topics from ${allRecentMessages.length} conversation windows`,
    );
    return topics;
  }

  /**
   * Extract topics from a conversation using AI
   */
  private async extractTopicsWithAI(
    conversationId: string,
    messages: Message[],
    startTime: Date,
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
1. A clear, concise title (max 100 chars)
2. A brief summary (2-3 sentences)
3. The main content points discussed
4. 5-10 relevant keywords
5. A relevance score from 0 to 1 (based on depth of discussion, importance, and actionability)

Conversation:
${conversationText}

Return an array of topics in the required JSON format.`;

      const result = await this.context.generateContent<{
        topics: ExtractedTopicData[];
      }>({
        prompt,
        templateName: "topics:extraction",
      });

      const extractedData = result.topics;

      // Create ExtractedTopic objects with sources
      const topics: ExtractedTopic[] = [];

      for (const data of extractedData) {
        // Create topic source reference
        const source: TopicSource = {
          type: "conversation",
          id: conversationId,
          timestamp: messages[0]?.timestamp
            ? new Date(messages[0].timestamp)
            : startTime,
          context: data.summary.substring(0, 200),
        };

        topics.push({
          ...data,
          sources: [source],
        });
      }

      return topics;
    } catch (error) {
      this.logger.error("Failed to extract topics with AI", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
