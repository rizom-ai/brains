/**
 * Conversation Tools for MCP
 * 
 * This file contains the tool definitions for the ConversationContext
 * following the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { z } from 'zod';

import type { ResourceDefinition } from '@/contexts/contextInterface';
import type { ConversationInfo } from '@/contexts/conversations/storage/conversationStorage';
import type { ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

/**
 * Interface that defines the required methods for tool service operations.
 * This interface is implemented by MCPConversationContext and provides the contract
 * that the tool service expects from a conversation context.
 */
export interface ConversationToolServiceContext {
  createConversation(title?: string): Promise<string>;
  addMessage(conversationId: string, message: { query: string; response: string; userId?: string; userName?: string }): Promise<ConversationTurn>;
  listConversations(options?: { limit?: number; offset?: number }): Promise<{ conversations: ConversationInfo[]; total: number }>;
  exportConversation(conversationId: string, format?: 'json' | 'markdown'): Promise<string>;
}

/**
 * Schema for create conversation tool parameters
 */
const CreateConversationSchema = z.object({
  title: z.string().optional().describe('Title for the new conversation'),
});

/**
 * Schema for add message tool parameters
 */
const AddMessageSchema = z.object({
  conversationId: z.string().describe('ID of the conversation to add message to'),
  query: z.string().describe('User query'),
  response: z.string().describe('Assistant response'),
  userId: z.string().optional().describe('User ID'),
  userName: z.string().optional().describe('User name'),
});

/**
 * Schema for list conversations tool parameters
 */
const ListConversationsSchema = z.object({
  limit: z.number().optional().describe('Maximum number of conversations to return'),
  offset: z.number().optional().describe('Offset for pagination'),
});

/**
 * Schema for export conversation tool parameters
 */
const ExportConversationSchema = z.object({
  conversationId: z.string().describe('ID of the conversation to export'),
  format: z.enum(['json', 'markdown']).optional().default('json').describe('Export format'),
});

/**
 * Configuration options for ConversationToolService
 */
export interface ConversationToolServiceConfig {
  // Add any configuration options if needed
  /** Optional configuration placeholder */
  placeholder?: never;
}

/**
 * Dependencies for ConversationToolService
 */
export interface ConversationToolServiceDependencies {
  /** Logger instance */
  logger?: Logger;
}

/**
 * Service responsible for providing MCP tools for conversations
 * Follows the Component Interface Standardization pattern
 */
export class ConversationToolService {
  /** The singleton instance */
  private static instance: ConversationToolService | null = null;
  
  /** Logger instance for this class */
  private readonly logger: Logger;
  
  /**
   * Get the singleton instance of ConversationToolService
   * 
   * @param _config Optional configuration (reserved for future use)
   * @returns The shared ConversationToolService instance
   */
  public static getInstance(_config?: ConversationToolServiceConfig): ConversationToolService {
    if (!ConversationToolService.instance) {
      ConversationToolService.instance = new ConversationToolService(_config);
    } else if (_config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    return ConversationToolService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationToolService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param _config Optional configuration (reserved for future use)
   * @returns A new ConversationToolService instance
   */
  public static createFresh(_config?: ConversationToolServiceConfig): ConversationToolService {
    return new ConversationToolService(_config);
  }
  
  /**
   * Create a new conversation tool service with explicit dependencies
   * 
   * @param _config Optional configuration (reserved for future use)
   * @param dependencies External dependencies to inject
   * @returns A new ConversationToolService instance
   */
  public static createWithDependencies(
    _config?: ConversationToolServiceConfig,
    dependencies?: Partial<ConversationToolServiceDependencies>,
  ): ConversationToolService {
    return new ConversationToolService(
      _config,
      {
        logger: dependencies?.logger,
      },
    );
  }
  
  /**
   * Private constructor to enforce factory methods
   * 
   * @param _config Optional configuration (reserved for future use)
   * @param dependencies Optional dependencies
   */
  private constructor(
    _config?: ConversationToolServiceConfig,
    dependencies?: ConversationToolServiceDependencies,
  ) {
    this.logger = dependencies?.logger || Logger.getInstance();
    
    this.logger.debug('ConversationToolService initialized', { context: 'ConversationToolService' });
  }
  
  /**
   * Get the MCP tools for the conversation context
   * 
   * @param context The conversation context
   * @returns Array of MCP tools
   */
  getTools(context: ConversationToolServiceContext): ResourceDefinition[] {
    return [
      // create_conversation
      this.createConversationTool(context),
      
      // add_message
      this.addMessageTool(context),
      
      // list_conversations
      this.listConversationsTool(context),
      
      // export_conversation
      this.exportConversationTool(context),
    ];
  }
  
  /**
   * Create the create conversation tool
   * 
   * @param context The conversation context
   * @returns The tool definition
   */
  private createConversationTool(context: ConversationToolServiceContext): ResourceDefinition {
    return {
      protocol: 'tool',
      path: 'create_conversation',
      name: 'create_conversation',
      description: 'Create a new conversation',
      inputSchema: CreateConversationSchema,
      handler: async (params: Record<string, unknown>) => {
        const { title } = CreateConversationSchema.parse(params);
        const conversationId = await context.createConversation(title);
        return { conversationId };
      },
    };
  }
  
  /**
   * Create the add message tool
   * 
   * @param context The conversation context
   * @returns The tool definition
   */
  private addMessageTool(context: ConversationToolServiceContext): ResourceDefinition {
    return {
      protocol: 'tool',
      path: 'add_message',
      name: 'add_message',
      description: 'Add a message to a conversation',
      inputSchema: AddMessageSchema,
      handler: async (params: Record<string, unknown>) => {
        const { conversationId, query, response, userId, userName } = AddMessageSchema.parse(params);
        const message = await context.addMessage(conversationId, { query, response, userId, userName });
        return { message };
      },
    };
  }
  
  /**
   * Create the list conversations tool
   * 
   * @param context The conversation context
   * @returns The tool definition
   */
  private listConversationsTool(context: ConversationToolServiceContext): ResourceDefinition {
    return {
      protocol: 'tool',
      path: 'list_conversations',
      name: 'list_conversations',
      description: 'List all conversations',
      inputSchema: ListConversationsSchema,
      handler: async (params: Record<string, unknown>) => {
        const { limit, offset } = ListConversationsSchema.parse(params);
        const result = await context.listConversations({ limit, offset });
        return result;
      },
    };
  }
  
  /**
   * Create the export conversation tool
   * 
   * @param context The conversation context
   * @returns The tool definition
   */
  private exportConversationTool(context: ConversationToolServiceContext): ResourceDefinition {
    return {
      protocol: 'tool',
      path: 'export_conversation',
      name: 'export_conversation',
      description: 'Export a conversation',
      inputSchema: ExportConversationSchema,
      handler: async (params: Record<string, unknown>) => {
        const { conversationId, format } = ExportConversationSchema.parse(params);
        const exported = await context.exportConversation(conversationId, format);
        return { content: exported };
      },
    };
  }
}