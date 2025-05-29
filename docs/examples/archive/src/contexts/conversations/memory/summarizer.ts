/**
 * Conversation Summarizer for Tiered Memory
 */
import { nanoid } from 'nanoid';

import type { ConversationSummary, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { ResourceRegistry } from '@/resources';
import { type DefaultResponseType } from '@/resources/ai/interfaces';
import logger from '@/utils/logger';

/**
 * Configuration options for ConversationSummarizer
 */
export interface ConversationSummarizerOptions {
  anthropicApiKey?: string;
}

/**
 * Service for summarizing conversation turns
 */
export class ConversationSummarizer {
  private static instance: ConversationSummarizer | null = null;
  private resourceRegistry: ResourceRegistry;

  /**
   * Get the singleton instance of ConversationSummarizer
   * @param options Configuration options
   * @returns The shared instance
   */
  public static getInstance(options?: ConversationSummarizerOptions): ConversationSummarizer {
    if (!ConversationSummarizer.instance) {
      ConversationSummarizer.instance = new ConversationSummarizer(options);
    }
    return ConversationSummarizer.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationSummarizer.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options?: ConversationSummarizerOptions): ConversationSummarizer {
    return new ConversationSummarizer(options);
  }

  /**
   * Create a new summarizer
   * @param options Configuration options including optional API key for Claude
   * @private Private constructor to enforce getInstance() usage
   */
  private constructor(_options?: ConversationSummarizerOptions) {
    // Initialize the ResourceRegistry
    this.resourceRegistry = ResourceRegistry.getInstance();
  }

  /**
   * Summarize a sequence of conversation turns
   * @param turns The conversation turns to summarize
   * @returns A summary object
   */
  async summarizeTurns(turns: ConversationTurn[]): Promise<ConversationSummary> {
    if (!turns || turns.length === 0) {
      throw new Error('Cannot summarize empty turns array');
    }

    // Sort turns by timestamp to ensure chronological order
    const sortedTurns = [...turns].sort((a, b) => {
      const aTime = a.timestamp ? a.timestamp.getTime() : 0;
      const bTime = b.timestamp ? b.timestamp.getTime() : 0;
      return aTime - bTime;
    });

    const turnTexts = sortedTurns.map(turn => {
      const userPrefix = turn.userName || 'User';
      return `${userPrefix}: ${turn.query}\nAssistant: ${turn.response}`;
    });

    // Combine turns and create a prompt
    const conversationText = turnTexts.join('\n\n');
    const prompt = this.createSummarizationPrompt(conversationText);

    try {
      // Get Claude model from the ResourceRegistry
      const claude = this.resourceRegistry.getClaudeModel();
      
      // Get summary from Claude
      const response = await claude.complete<DefaultResponseType>({
        systemPrompt: this.getSystemPrompt(),
        userPrompt: prompt,
      });

      // Create summary object
      const summary: ConversationSummary = {
        id: `summ-${nanoid()}`,
        timestamp: new Date(),
        content: response.object.answer.trim(),
        startTurnIndex: 0, // These will be set by the caller
        endTurnIndex: turns.length - 1,
        startTimestamp: sortedTurns[0].timestamp,
        endTimestamp: sortedTurns[sortedTurns.length - 1].timestamp,
        turnCount: turns.length,
        metadata: {
          originalTurnIds: sortedTurns.map(turn => turn.id),
        },
      };

      return summary;
    } catch (error) {
      logger.error('Failed to generate conversation summary:', error);
      
      // Fallback to a basic summary if the model fails
      return this.createFallbackSummary(sortedTurns);
    }
  }

  /**
   * Create a system prompt for summarization
   */
  private getSystemPrompt(): string {
    return `You are a specialized AI assistant that creates concise, informative summaries of conversations. 
    Your task is to extract the key points, main topics, and important details from a conversation between a user and an assistant.
    Your summary should:
    - Be under 250 words
    - Highlight the main topics discussed
    - Note any important decisions, information, or action items
    - Capture the overall flow of the conversation
    - Maintain an objective, neutral tone
    - Focus on factual content rather than opinions
    - Exclude any irrelevant or redundant information
    
    You MUST maintain the third-person perspective and avoid adding your own commentary or analysis.`;
  }

  /**
   * Create a prompt for summarizing conversation text
   */
  private createSummarizationPrompt(conversationText: string): string {
    return `Please summarize the following conversation, focusing on the key topics and important details:

${conversationText}

Summary:`;
  }

  /**
   * Create a fallback summary if the model fails
   */
  private createFallbackSummary(turns: ConversationTurn[]): ConversationSummary {
    // Create a basic summary from the first and last few turns
    const topics = new Set<string>();
    
    // Extract potential topics from the first 3 words of each query
    turns.forEach(turn => {
      const words = turn.query.split(/\s+/).slice(0, 3);
      if (words.length > 0 && words[0].length > 3) {
        topics.add(words[0]);
      }
    });
    
    const topicsList = Array.from(topics).slice(0, 5).join(', ');
    const firstQuery = turns[0].query.length > 50 
      ? turns[0].query.substring(0, 50) + '...' 
      : turns[0].query;
    
    const lastQuery = turns[turns.length - 1].query.length > 50 
      ? turns[turns.length - 1].query.substring(0, 50) + '...' 
      : turns[turns.length - 1].query;
    
    const content = `This conversation contains ${turns.length} turns, starting with "${firstQuery}" and ending with "${lastQuery}". Topics include: ${topicsList || 'various subjects'}.`;

    return {
      id: `summ-${nanoid()}`,
      timestamp: new Date(),
      content,
      startTurnIndex: 0,
      endTurnIndex: turns.length - 1,
      startTimestamp: turns[0].timestamp,
      endTimestamp: turns[turns.length - 1].timestamp,
      turnCount: turns.length,
      metadata: {
        isFallback: true,
        originalTurnIds: turns.map(turn => turn.id),
      },
    };
  }
}