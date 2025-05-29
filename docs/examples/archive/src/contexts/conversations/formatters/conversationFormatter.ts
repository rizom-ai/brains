/**
 * ConversationFormatter for formatting conversations
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * 
 * Implements the FormatterInterface for consistent formatting operations
 */
import type { FormatterInterface } from '@/contexts/formatterInterface';
import type { ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

import type { ConversationSummary } from '../storage/conversationStorage';

/**
 * Formatting options for conversations
 */
export interface FormattingOptions {
  includeTimestamps?: boolean;
  includeMetadata?: boolean;
  format?: 'text' | 'markdown' | 'json' | 'html';
  anchorName?: string;
  anchorId?: string;
  highlightAnchor?: boolean;
}

/**
 * Interface for formatted turn with all possible fields
 */
interface FormattedTurn {
  id?: string;
  query: string;
  response: string;
  userId?: string;
  userName?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
  isAnchor?: boolean;
  anchorName?: string;
}

/**
 * Interface for formatted summary with all possible fields
 */
interface FormattedSummary {
  id: string;
  index: number;
  content: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Service for formatting conversations in different output formats
 * Follows the Component Interface Standardization pattern
 * Implements the FormatterInterface
 */
export class ConversationFormatter implements FormatterInterface<ConversationTurn[], string> {
  /** The singleton instance */
  private static instance: ConversationFormatter | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.logger.debug('ConversationFormatter initialized', { context: 'ConversationFormatter' });
  }
  
  /**
   * Get the singleton instance of ConversationFormatter
   * 
   * @returns The shared ConversationFormatter instance
   */
  public static getInstance(): ConversationFormatter {
    if (!ConversationFormatter.instance) {
      ConversationFormatter.instance = new ConversationFormatter();
    }
    return ConversationFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @returns A new ConversationFormatter instance
   */
  public static createFresh(): ConversationFormatter {
    return new ConversationFormatter();
  }
  
  /**
   * Format method implementing FormatterInterface
   * @param data The data to format (conversation turns)
   * @param options Optional formatting options
   * @returns Formatted string representation of the conversation
   */
  format(data: ConversationTurn[], options?: FormattingOptions): string {
    return this.formatTurns(data, options || {});
  }
  /**
   * Format turns for display or export
   * @param turns Turns to format
   * @param options Formatting options
   * @returns Formatted string
   */
  formatTurns(turns: ConversationTurn[], options: FormattingOptions = {}): string {
    if (turns.length === 0) {
      return '';
    }

    const format = options.format || 'text';

    // Sort turns by timestamp
    const sortedTurns = [...turns].sort(
      (a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      },
    );

    switch (format) {
    case 'markdown':
      return this.formatTurnsAsMarkdown(sortedTurns, options);
    case 'json':
      return this.formatTurnsAsJson(sortedTurns, options);
    case 'html':
      return this.formatTurnsAsHtml(sortedTurns, options);
    case 'text':
    default:
      return this.formatTurnsAsText(sortedTurns, options);
    }
  }

  /**
   * Format summaries for display
   * @param summaries Summaries to format
   * @param options Formatting options
   * @returns Formatted string
   */
  formatSummaries(summaries: ConversationSummary[], options: FormattingOptions = {}): string {
    if (summaries.length === 0) {
      return '';
    }

    const format = options.format || 'text';

    // Sort summaries by creation date
    const sortedSummaries = [...summaries].sort(
      (a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      },
    );

    switch (format) {
    case 'markdown':
      return this.formatSummariesAsMarkdown(sortedSummaries, options);
    case 'json':
      return this.formatSummariesAsJson(sortedSummaries, options);
    case 'html':
      return this.formatSummariesAsHtml(sortedSummaries, options);
    case 'text':
    default:
      return this.formatSummariesAsText(sortedSummaries, options);
    }
  }

  /**
   * Format a complete conversation history with summaries and turns
   * @param turns Conversation turns
   * @param summaries Conversation summaries
   * @param options Formatting options
   * @returns Formatted conversation
   */
  formatConversation(
    turns: ConversationTurn[], 
    summaries: ConversationSummary[], 
    options: FormattingOptions = {},
  ): string {
    const format = options.format || 'text';
    const summariesText = this.formatSummaries(summaries, options);
    const turnsText = this.formatTurns(turns, options);

    switch (format) {
    case 'markdown':
      return summaries.length > 0 
        ? `## Conversation Summaries\n\n${summariesText}\n\n## Recent Conversation\n\n${turnsText}` 
        : `## Conversation\n\n${turnsText}`;
    case 'html':
      return summaries.length > 0
        ? `<h2>Conversation Summaries</h2>${summariesText}<h2>Recent Conversation</h2>${turnsText}`
        : `<h2>Conversation</h2>${turnsText}`;
    case 'json':
      return JSON.stringify({
        summaries: summaries.length > 0 ? JSON.parse(summariesText) : [],
        turns: turns.length > 0 ? JSON.parse(turnsText) : [],
      }, null, 2);
    case 'text':
    default:
      return summaries.length > 0
        ? `CONVERSATION SUMMARIES:\n\n${summariesText}\n\nRECENT CONVERSATION:\n\n${turnsText}`
        : `CONVERSATION:\n\n${turnsText}`;
    }
  }

  /**
   * Format history for inclusion in prompts
   * @param turns Active conversation turns
   * @param summaries Conversation summaries
   * @param options Options for formatting
   * @returns Formatted history string
   */
  formatHistoryForPrompt(
    turns: ConversationTurn[], 
    summaries: ConversationSummary[],
    options: FormattingOptions = {},
  ): string {
    let historyText = '';
    
    // Add summaries first (oldest to newest)
    if (summaries.length > 0) {
      historyText += 'CONVERSATION SUMMARIES:\n';
      
      // Sort summaries by timestamp (oldest first)
      const sortedSummaries = [...summaries].sort(
        (a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        },
      );
      
      sortedSummaries.forEach((summary, index) => {
        historyText += `Summary ${index + 1}: ${summary.content}\n\n`;
      });
      
      historyText += 'RECENT CONVERSATION:\n';
    }
    
    // Add active turns
    if (turns.length === 0) {
      return historyText;
    }
    
    // Format each turn with user attribution and anchor highlighting
    const formattedTurns = turns.map(turn => {
      // Format user query
      let userPrefix = turn.userName || 'User';
      
      // Highlight anchor if requested and this is the anchor user
      if (options.highlightAnchor && options.anchorId && 
          turn.userId && turn.userId === options.anchorId) {
        userPrefix = `${options.anchorName || 'Host'} (${turn.userName || 'User'})`;
      }
      
      return `${userPrefix}: ${turn.query}\nAssistant: ${turn.response}`;
    });
    
    historyText += formattedTurns.join('\n\n') + '\n\n';
    
    return historyText;
  }

  /**
   * Format turns as plain text
   */
  private formatTurnsAsText(turns: ConversationTurn[], options: FormattingOptions): string {
    return turns.map(turn => {
      let text = '';

      // Add timestamp if requested
      if (options.includeTimestamps && turn.timestamp) {
        const timestamp = new Date(turn.timestamp).toISOString();
        text += `[${timestamp}] `;
      }

      // Format user and response
      let userPrefix = turn.userName || 'User';
      
      // Highlight anchor if requested and this is the anchor user
      if (options.highlightAnchor && options.anchorId && 
          turn.userId && turn.userId === options.anchorId) {
        userPrefix = `${options.anchorName || 'Host'} (${turn.userName || 'User'})`;
      }
      
      text += `${userPrefix}: ${turn.query}\nAssistant: ${turn.response}`;

      // Add metadata if requested
      if (options.includeMetadata && turn.metadata) {
        text += `\nMetadata: ${JSON.stringify(turn.metadata)}`;
      }

      return text;
    }).join('\n\n');
  }

  /**
   * Format turns as markdown
   */
  private formatTurnsAsMarkdown(turns: ConversationTurn[], options: FormattingOptions): string {
    return turns.map(turn => {
      let text = '';

      // Add timestamp if requested
      if (options.includeTimestamps && turn.timestamp) {
        const timestamp = new Date(turn.timestamp).toISOString();
        text += `_${timestamp}_\n\n`;
      }

      // Format user and response
      let userPrefix = turn.userName || 'User';
      
      // Highlight anchor if requested and this is the anchor user
      if (options.highlightAnchor && options.anchorId && 
          turn.userId && turn.userId === options.anchorId) {
        userPrefix = `**${options.anchorName || 'Host'}** (${turn.userName || 'User'})`;
      }
      
      text += `**${userPrefix}**: ${turn.query}\n\n**Assistant**: ${turn.response}`;

      // Add metadata if requested
      if (options.includeMetadata && turn.metadata) {
        text += `\n\n<details>\n<summary>Metadata</summary>\n\n\`\`\`json\n${JSON.stringify(turn.metadata, null, 2)}\n\`\`\`\n</details>`;
      }

      return text;
    }).join('\n\n---\n\n');
  }

  /**
   * Format turns as HTML
   */
  private formatTurnsAsHtml(turns: ConversationTurn[], options: FormattingOptions): string {
    return turns.map(turn => {
      let text = '<div class="conversation-turn">';

      // Add timestamp if requested
      if (options.includeTimestamps && turn.timestamp) {
        const timestamp = new Date(turn.timestamp).toISOString();
        text += `<div class="timestamp">${timestamp}</div>`;
      }

      // Format user and response
      let userPrefix = turn.userName || 'User';
      let userClass = 'user';
      
      // Highlight anchor if requested and this is the anchor user
      if (options.highlightAnchor && options.anchorId && 
          turn.userId && turn.userId === options.anchorId) {
        userPrefix = `${options.anchorName || 'Host'} (${turn.userName || 'User'})`;
        userClass = 'anchor-user';
      }
      
      text += `<div class="${userClass}"><span class="username">${userPrefix}:</span> ${turn.query}</div>`;
      text += `<div class="assistant"><span class="username">Assistant:</span> ${turn.response}</div>`;

      // Add metadata if requested
      if (options.includeMetadata && turn.metadata) {
        text += `<details class="metadata"><summary>Metadata</summary><pre>${JSON.stringify(turn.metadata, null, 2)}</pre></details>`;
      }

      text += '</div>';
      return text;
    }).join('');
  }


  /**
   * Format turns as JSON
   */
  private formatTurnsAsJson(turns: ConversationTurn[], options: FormattingOptions): string {
    const formattedTurns = turns.map(turn => {
      const formattedTurn: FormattedTurn = {
        id: turn.id,
        query: turn.query,
        response: turn.response,
      };

      // Add optional fields
      if (turn.userId) formattedTurn.userId = turn.userId;
      if (turn.userName) formattedTurn.userName = turn.userName;
      
      // Add timestamp if requested
      if (options.includeTimestamps && turn.timestamp) {
        formattedTurn.timestamp = turn.timestamp;
      }

      // Add metadata if requested
      if (options.includeMetadata && turn.metadata) {
        formattedTurn.metadata = turn.metadata;
      }

      // Add anchor information if relevant
      if (options.highlightAnchor && options.anchorId && 
          turn.userId && turn.userId === options.anchorId) {
        formattedTurn.isAnchor = true;
        formattedTurn.anchorName = options.anchorName || 'Host';
      }

      return formattedTurn;
    });

    return JSON.stringify(formattedTurns, null, 2);
  }

  /**
   * Format summaries as text
   */
  private formatSummariesAsText(summaries: ConversationSummary[], options: FormattingOptions): string {
    return summaries.map((summary, index) => {
      let text = `Summary ${index + 1}: ${summary.content}`;

      // Add timestamp if requested
      if (options.includeTimestamps && summary.createdAt) {
        const timestamp = new Date(summary.createdAt).toISOString();
        text = `[${timestamp}] ${text}`;
      }

      // Add metadata if requested
      if (options.includeMetadata && summary.metadata) {
        text += `\nMetadata: ${JSON.stringify(summary.metadata)}`;
      }

      return text;
    }).join('\n\n');
  }

  /**
   * Format summaries as markdown
   */
  private formatSummariesAsMarkdown(summaries: ConversationSummary[], options: FormattingOptions): string {
    return summaries.map((summary, index) => {
      let text = `### Summary ${index + 1}\n\n${summary.content}`;

      // Add timestamp if requested
      if (options.includeTimestamps && summary.createdAt) {
        const timestamp = new Date(summary.createdAt).toISOString();
        text = `_${timestamp}_\n\n${text}`;
      }

      // Add metadata if requested
      if (options.includeMetadata && summary.metadata) {
        text += `\n\n<details>\n<summary>Metadata</summary>\n\n\`\`\`json\n${JSON.stringify(summary.metadata, null, 2)}\n\`\`\`\n</details>`;
      }

      return text;
    }).join('\n\n');
  }

  /**
   * Format summaries as HTML
   */
  private formatSummariesAsHtml(summaries: ConversationSummary[], options: FormattingOptions): string {
    return summaries.map((summary, index) => {
      let text = `<div class="summary"><h3>Summary ${index + 1}</h3>`;

      // Add timestamp if requested
      if (options.includeTimestamps && summary.createdAt) {
        const timestamp = new Date(summary.createdAt).toISOString();
        text += `<div class="timestamp">${timestamp}</div>`;
      }

      text += `<div class="content">${summary.content}</div>`;

      // Add metadata if requested
      if (options.includeMetadata && summary.metadata) {
        text += `<details class="metadata"><summary>Metadata</summary><pre>${JSON.stringify(summary.metadata, null, 2)}</pre></details>`;
      }

      text += '</div>';
      return text;
    }).join('');
  }

  /**
   * Format summaries as JSON
   */
  private formatSummariesAsJson(summaries: ConversationSummary[], options: FormattingOptions): string {
    const formattedSummaries = summaries.map((summary, index) => {
      const formattedSummary: FormattedSummary = {
        id: summary.id,
        index,
        content: summary.content,
      };

      // Add timestamp if requested
      if (options.includeTimestamps && summary.createdAt) {
        formattedSummary.createdAt = summary.createdAt;
      }

      // Add metadata if requested
      if (options.includeMetadata && summary.metadata) {
        formattedSummary.metadata = summary.metadata;
      }

      return formattedSummary;
    });

    return JSON.stringify(formattedSummaries, null, 2);
  }
}