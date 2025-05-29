/**
 * TieredMemoryManager for managing conversation memory tiers
 */
import { nanoid } from 'nanoid';

import { ConversationSummarizer } from '@/contexts/conversations/memory/summarizer';
import type { 
  ConversationStorage, 
  ConversationSummary, 
} from '@/contexts/conversations/storage/conversationStorage';
import type { ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import logger from '@/utils/logger';

/**
 * Configuration for TieredMemoryManager
 */
export interface TieredMemoryConfig {
  maxActiveTurns: number;
  maxSummaries: number;
  summaryTurnCount: number;
  maxArchivedTurns: number;
  maxTokens: number;
  relevanceDecay: number;
}

/**
 * Tiered history response structure
 */
export interface TieredHistory {
  activeTurns: ConversationTurn[];
  summaries: ConversationSummary[];
  archivedTurns: ConversationTurn[];
}

/**
 * Options for TieredMemoryManager
 */
export interface TieredMemoryManagerOptions {
  storage: ConversationStorage;
  config?: Partial<TieredMemoryConfig>;
}

/**
 * Manager for tiered conversation memory (active, summary, archive)
 */
export class TieredMemoryManager {
  private static instance: TieredMemoryManager | null = null;
  private storage: ConversationStorage;
  private summarizer: ConversationSummarizer;
  private config: TieredMemoryConfig;

  /**
   * Get the singleton instance of TieredMemoryManager
   * @param options Configuration options
   * @returns The shared instance
   */
  public static getInstance(options?: TieredMemoryManagerOptions): TieredMemoryManager {
    if (!TieredMemoryManager.instance) {
      if (!options?.storage) {
        throw new Error('TieredMemoryManager requires a storage implementation');
      }
      TieredMemoryManager.instance = new TieredMemoryManager(options);
    } else if (options) {
      // If instance exists and options are provided, update the config
      if (options.config) {
        TieredMemoryManager.instance.setConfig(options.config);
      }
    }
    return TieredMemoryManager.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    TieredMemoryManager.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: TieredMemoryManagerOptions): TieredMemoryManager {
    return new TieredMemoryManager(options);
  }

  /**
   * Create a new TieredMemoryManager
   * @private Private constructor to enforce getInstance() usage
   */
  private constructor(options?: TieredMemoryManagerOptions) {
    if (!options?.storage) {
      throw new Error('TieredMemoryManager requires a storage implementation');
    }
    
    this.storage = options.storage;
    this.summarizer = ConversationSummarizer.getInstance();
    this.config = {
      maxActiveTurns: options.config?.maxActiveTurns || 10,
      maxSummaries: options.config?.maxSummaries || 3,
      summaryTurnCount: options.config?.summaryTurnCount || 5,
      maxArchivedTurns: options.config?.maxArchivedTurns || 50,
      maxTokens: options.config?.maxTokens || 2000,
      relevanceDecay: options.config?.relevanceDecay || 0.9,
    };
  }

  /**
   * Check if a conversation needs summarization and perform it if needed
   * @param conversationId Conversation ID to check
   * @returns true if summarization was performed
   */
  async checkAndSummarize(conversationId: string): Promise<boolean> {
    const conversation = await this.storage.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found`);
    }

    // Get all turns for the conversation
    const turns = await this.storage.getTurns(conversationId);
    
    // Active turns are the ones not associated with any summary
    const activeTurns = turns.filter(turn => !turn.metadata?.['summaryId']);
    
    // Check if we need to summarize based on the number of active turns
    if (activeTurns.length <= this.config.maxActiveTurns) {
      return false;
    }

    return this.summarizeOldestActiveTurns(conversationId, activeTurns);
  }

  /**
   * Force summarization of a conversation's active turns
   * @param conversationId Conversation ID to summarize
   * @returns true if summarization was performed
   */
  async forceSummarize(conversationId: string): Promise<boolean> {
    const turns = await this.storage.getTurns(conversationId);
    const activeTurns = turns.filter(turn => !turn.metadata?.['summaryId']);
    
    if (activeTurns.length < 2) {
      logger.warn(`Not enough active turns to summarize for conversation ${conversationId}`);
      return false;
    }

    return this.summarizeOldestActiveTurns(conversationId, activeTurns);
  }

  /**
   * Summarize the oldest active turns in a conversation
   * @param conversationId Conversation ID
   * @param activeTurns Active turns in the conversation
   * @returns true if summarization was successful
   */
  private async summarizeOldestActiveTurns(
    conversationId: string, 
    activeTurns: ConversationTurn[],
  ): Promise<boolean> {
    try {
      // Determine how many turns to summarize (keeping the most recent ones)
      const turnsToSummarize = Math.min(
        this.config.summaryTurnCount,
        activeTurns.length - Math.floor(this.config.maxActiveTurns * 0.8),
      );
      
      if (turnsToSummarize < 2) {
        // Need at least 2 turns to make a meaningful summary
        return false;
      }
      
      // Get the oldest turns to summarize (by timestamp)
      const sortedTurns = [...activeTurns].sort(
        (a, b) => {
          const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return aTime - bTime;
        },
      );
      const turnsToProcess = sortedTurns.slice(0, turnsToSummarize);
      
      // Create a summary
      const summary = await this.summarizer.summarizeTurns(turnsToProcess);
      
      // Add the summary to the storage
      const summaryId = await this.storage.addSummary(conversationId, {
        id: summary.id || `sum-${nanoid()}`,
        conversationId,
        content: summary.content,
        startTurnId: turnsToProcess[0].id || '',
        endTurnId: turnsToProcess[turnsToProcess.length - 1].id || '',
        createdAt: new Date(),
        metadata: {
          turnCount: turnsToProcess.length,
          originalTurnIds: turnsToProcess.map(turn => turn.id),
        },
      });
      
      // Update each turn with the summary ID in its metadata
      for (const turn of turnsToProcess) {
        if (turn.id) {
          await this.storage.updateTurn(turn.id, {
            metadata: {
              ...turn.metadata,
              summaryId,
              isActive: false,
            },
          });
        }
      }
      
      logger.debug(`Summarized ${turnsToSummarize} turns for conversation ${conversationId}`);
      return true;
    } catch (error) {
      logger.error(`Error summarizing turns for conversation ${conversationId}:`, error);
      return false;
    }
  }

  /**
   * Get the tiered history for a conversation
   * @param conversationId Conversation ID
   * @returns Object containing active turns, summaries, and archived turns
   */
  async getTieredHistory(conversationId: string): Promise<TieredHistory> {
    // Get all turns for the conversation
    const allTurns = await this.storage.getTurns(conversationId);
    
    // Separate turns into active and archived based on metadata
    const activeTurns = allTurns.filter(turn => 
      !turn.metadata?.['summaryId'] && turn.metadata?.['isActive'] !== false,
    );
    
    const archivedTurns = allTurns.filter(turn => 
      turn.metadata?.['summaryId'] || turn.metadata?.['isActive'] === false,
    );
    
    // Get summaries
    const summaries = await this.storage.getSummaries(conversationId);
    
    // Sort turns by timestamp
    activeTurns.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    
    archivedTurns.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    
    return {
      // Apply the maximum limit to active turns
      activeTurns: activeTurns.slice(-this.config.maxActiveTurns),
      summaries,
      // Apply the maximum limit to archived turns
      archivedTurns: archivedTurns.slice(-this.config.maxArchivedTurns),
    };
  }

  /**
   * Format the tiered history into a string for use in prompts
   * @param conversationId Conversation ID
   * @param maxTokens Maximum tokens to include (approximate)
   * @returns Formatted history string
   */
  async formatHistoryForPrompt(conversationId: string, maxTokens?: number): Promise<string> {
    const tokenLimit = maxTokens || this.config.maxTokens;
    const { activeTurns, summaries } = await this.getTieredHistory(conversationId);
    
    let historyText = '';
    let estimatedTokens = 0;
    
    // Add summaries first (oldest to newest)
    if (summaries.length > 0) {
      historyText += 'CONVERSATION SUMMARIES:\n';
      
      // Sort summaries by timestamp (oldest first)
      const sortedSummaries = [...summaries].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      
      for (const summary of sortedSummaries) {
        const summaryText = `Summary: ${summary.content}\n\n`;
        const summaryTokens = this.estimateTokenCount(summaryText);
        
        if (estimatedTokens + summaryTokens <= tokenLimit) {
          historyText += summaryText;
          estimatedTokens += summaryTokens;
        } else {
          // If we can't fit all summaries, include at least a truncated version of the most recent
          if (sortedSummaries.indexOf(summary) === sortedSummaries.length - 1) {
            const truncatedSummary = this.truncateToTokens(
              summaryText, 
              tokenLimit - estimatedTokens,
            );
            historyText += truncatedSummary;
            estimatedTokens += this.estimateTokenCount(truncatedSummary);
          }
          break;
        }
      }
      
      historyText += 'RECENT CONVERSATION:\n';
    }
    
    // Add active turns (newest last)
    if (activeTurns.length > 0) {
      // Format each turn
      const formattedTurns = activeTurns.map(turn => {
        const userPrefix = turn.userName || 'User';
        return `${userPrefix}: ${turn.query}\nAssistant: ${turn.response}`;
      });
      
      // Calculate how many turns we can fit
      let includedText = '';
      
      // Process turns in reverse order to prioritize recent turns
      for (let i = formattedTurns.length - 1; i >= 0; i--) {
        const turnText = formattedTurns[i] + '\n\n';
        const turnTokens = this.estimateTokenCount(turnText);
        
        if (estimatedTokens + turnTokens <= tokenLimit) {
          includedText = turnText + includedText; // Prepend to maintain order
          estimatedTokens += turnTokens;
        } else {
          break;
        }
      }
      
      historyText += includedText;
    }
    
    return historyText.trim();
  }

  /**
   * Set configuration for the tiered memory
   * @param config Configuration to apply
   */
  setConfig(config: Partial<TieredMemoryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): TieredMemoryConfig {
    return { ...this.config };
  }

  /**
   * Simple estimation of token count (approximation only)
   * @param text Text to estimate
   * @returns Approximate token count
   */
  private estimateTokenCount(text: string): number {
    // Simple approximation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to a target token count
   * @param text Text to truncate
   * @param targetTokens Target token count
   * @returns Truncated text
   */
  private truncateToTokens(text: string, targetTokens: number): string {
    // Simple approximation: truncate to character count
    const charLimit = targetTokens * 4;
    
    if (text.length <= charLimit) {
      return text;
    }
    
    return text.substring(0, charLimit) + '...';
  }
}