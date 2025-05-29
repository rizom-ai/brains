/**
 * ConversationMcpFormatter for formatting conversations specifically for MCP responses
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

import type { ConversationSummary } from '../storage/conversationStorage';

// Interface for MCP-formatted conversation response
export interface McpFormattedConversation {
  id: string;
  interfaceType: 'cli' | 'matrix';
  roomId: string;
  createdAt: Date;
  updatedAt: Date;
  turnCount: number;
  summaryCount: number;
  statistics: Record<string, unknown>;
  turns?: ConversationTurn[];
  turnPreview?: ConversationTurn[];
  summaries?: Array<Partial<ConversationSummary & { turnCount?: number }>>;
  raw?: Record<string, unknown>;
}

// Interface for MCP-formatted turns response
export interface McpFormattedTurns {
  conversationId: string;
  turnCount: number;
  statistics: Record<string, unknown>;
  turns: Array<Partial<ConversationTurn>>;
}

// Interface for MCP-formatted summaries response
export interface McpFormattedSummaries {
  conversationId: string;
  summaryCount: number;
  timeline: {
    points: Array<Record<string, unknown>>;
    count: number;
  };
  summaries: Array<Partial<ConversationSummary & { turnCount?: number }>>;
}

/**
 * MCP-specific formatting options
 */
export interface McpFormattingOptions {
  includeFullMetadata?: boolean;
  includeFullTurns?: boolean;
  includeRawContent?: boolean;
}

/**
 * Specialized formatter for MCP protocol responses
 * Follows the Component Interface Standardization pattern
 */
export class ConversationMcpFormatter {
  /** The singleton instance */
  private static instance: ConversationMcpFormatter | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.logger.debug('ConversationMcpFormatter initialized', { context: 'ConversationMcpFormatter' });
  }
  
  /**
   * Get the singleton instance of ConversationMcpFormatter
   * 
   * @returns The shared ConversationMcpFormatter instance
   */
  public static getInstance(): ConversationMcpFormatter {
    if (!ConversationMcpFormatter.instance) {
      ConversationMcpFormatter.instance = new ConversationMcpFormatter();
    }
    return ConversationMcpFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationMcpFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @returns A new ConversationMcpFormatter instance
   */
  public static createFresh(): ConversationMcpFormatter {
    return new ConversationMcpFormatter();
  }
  /**
   * Format a conversation for MCP resource response
   * @param conversation The conversation to format
   * @param turns The conversation turns
   * @param summaries The conversation summaries
   * @param options Formatting options
   * @returns Formatted conversation object for MCP response
   */
  formatConversationForMcp(
    conversation: Conversation,
    turns: ConversationTurn[],
    summaries: ConversationSummary[],
    options: McpFormattingOptions = {},
  ): McpFormattedConversation {
    // Base conversation data
    const formatted: McpFormattedConversation = {
      id: conversation.id,
      interfaceType: conversation.interfaceType,
      roomId: conversation.roomId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      turnCount: turns.length,
      summaryCount: summaries.length,
      statistics: this.calculateConversationStats(turns),
    };

    // Add turns if requested (or add a limited preview)
    if (options.includeFullTurns) {
      formatted.turns = turns;
    } else {
      // Include just a preview of the first and last few turns
      formatted.turnPreview = this.createTurnPreview(turns);
    }

    // Add summaries if they exist
    if (summaries.length > 0) {
      formatted.summaries = options.includeFullMetadata
        ? summaries.map(s => ({...s, turnCount: s.turnCount || 0}))
        : summaries.map((s) => ({
          id: s.id,
          content: s.content,
          createdAt: s.createdAt,
          turnCount: s.turnCount || 0,
        }));
    }

    // Add raw content if requested (useful for debugging)
    if (options.includeRawContent) {
      formatted.raw = {
        conversation,
        turns,
        summaries,
      };
    }

    return formatted;
  }

  /**
   * Format turns for MCP resource response
   * @param turns The turns to format
   * @param options Formatting options
   * @returns Formatted turns object for MCP response
   */
  formatTurnsForMcp(
    conversationId: string,
    turns: ConversationTurn[],
    options: McpFormattingOptions = {},
  ): McpFormattedTurns {
    // Sort turns by timestamp
    const sortedTurns = [...turns].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });

    // Create the formatted response
    const formatted: McpFormattedTurns = {
      conversationId,
      turnCount: turns.length,
      statistics: this.calculateConversationStats(turns),
      turns: [], // Will be populated below
    };

    // Add turns with appropriate level of detail
    if (options.includeFullMetadata) {
      formatted.turns = sortedTurns;
    } else {
      // Remove detailed metadata for a more concise response
      formatted.turns = sortedTurns.map((turn) => ({
        id: turn.id,
        timestamp: turn.timestamp,
        query: turn.query,
        response: turn.response,
        userName: turn.userName,
      }));
    }

    return formatted;
  }

  /**
   * Format summaries for MCP resource response
   * @param conversationId The conversation ID
   * @param summaries The summaries to format
   * @param options Formatting options
   * @returns Formatted summaries object for MCP response
   */
  formatSummariesForMcp(
    conversationId: string,
    summaries: ConversationSummary[],
    options: McpFormattingOptions = {},
  ): McpFormattedSummaries {
    // Sort summaries by creation date
    const sortedSummaries = [...summaries].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    // Create the formatted response
    const formatted: McpFormattedSummaries = {
      conversationId,
      summaryCount: summaries.length,
      timeline: this.createSummaryTimeline(sortedSummaries),
      summaries: [], // Will be populated below
    };

    // Add summaries with appropriate level of detail
    if (options.includeFullMetadata) {
      formatted.summaries = sortedSummaries.map(s => ({...s, turnCount: s.turnCount || 0}));
    } else {
      // Remove detailed metadata for a more concise response
      formatted.summaries = sortedSummaries.map((summary) => ({
        id: summary.id,
        content: summary.content,
        createdAt: summary.createdAt,
        turnCount: summary.turnCount || 0,
      }));
    }

    return formatted;
  }

  /**
   * Calculate conversation statistics from turns
   * @param turns Conversation turns
   * @returns Statistics object
   */
  private calculateConversationStats(turns: ConversationTurn[]): Record<string, unknown> {
    if (turns.length === 0) {
      return {
        empty: true,
        avgQueryLength: 0,
        avgResponseLength: 0,
        totalQueryLength: 0,
        totalResponseLength: 0,
        userNameCounts: {},
      };
    }

    // Calculate query and response lengths
    const queryLengths = turns.map((t) => t.query.length);
    const responseLengths = turns.map((t) => t.response.length);
    const totalQueryLength = queryLengths.reduce((sum, len) => sum + len, 0);
    const totalResponseLength = responseLengths.reduce((sum, len) => sum + len, 0);
    const avgQueryLength = totalQueryLength / turns.length;
    const avgResponseLength = totalResponseLength / turns.length;

    // Count turns by user
    const userNameCounts: Record<string, number> = {};
    for (const turn of turns) {
      const userName = turn.userName || 'Unknown';
      userNameCounts[userName] = (userNameCounts[userName] || 0) + 1;
    }

    // Calculate time span if timestamps are available
    let timeSpan = null;
    const timestamps = turns
      .filter((t) => t.timestamp)
      .map((t) => (t.timestamp ? new Date(t.timestamp).getTime() : 0))
      .sort();

    if (timestamps.length >= 2) {
      const first = timestamps[0];
      const last = timestamps[timestamps.length - 1];
      const durationMs = last - first;
      timeSpan = {
        firstTimestamp: new Date(first),
        lastTimestamp: new Date(last),
        durationMinutes: Math.round(durationMs / 60000),
        durationHours: Math.round(durationMs / 3600000 * 10) / 10,
      };
    }

    return {
      avgQueryLength,
      avgResponseLength,
      totalQueryLength,
      totalResponseLength,
      userNameCounts,
      timeSpan,
    };
  }

  /**
   * Create a preview of turns by selecting first, last, and key turns
   * @param turns All conversation turns
   * @returns A smaller set of representative turns
   */
  private createTurnPreview(turns: ConversationTurn[]): ConversationTurn[] {
    if (turns.length <= 5) {
      return [...turns];
    }

    // Get the first two turns, last two turns, and a middle turn
    const firstTurns = turns.slice(0, 2);
    const lastTurns = turns.slice(-2);
    const middleTurn = turns[Math.floor(turns.length / 2)];

    return [...firstTurns, middleTurn, ...lastTurns];
  }

  /**
   * Create a timeline representation of conversation summaries
   * @param summaries Sorted summaries
   * @returns Timeline object with key points
   */
  private createSummaryTimeline(summaries: ConversationSummary[]): {
    points: Array<Record<string, unknown>>;
    count: number;
  } {
    const timePoints = summaries.map((summary) => ({
      id: summary.id,
      time: summary.createdAt,
      turnCount: summary.turnCount || 0,
      textPreview: summary.content.substring(0, 100) + (summary.content.length > 100 ? '...' : ''),
    }));

    return {
      points: timePoints,
      count: timePoints.length,
    };
  }
}