import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { v4 as uuidv4 } from 'uuid';

import { type TieredHistory, type TieredMemoryConfig, TieredMemoryManager } from '@/contexts/conversations/memory/tieredMemoryManager';
import type { ConversationNotifier } from '@/contexts/conversations/messaging/conversationNotifier';
import type { 
  ConversationInfo,
  ConversationStorage,
  NewConversation,
  SearchCriteria,
} from '@/contexts/conversations/storage/conversationStorage';
import { InMemoryStorage } from '@/contexts/conversations/storage/inMemoryStorage';
import type { 
  ContextCapabilities, 
  ContextStatus, 
  MCPContext,
  MCPFormatterInterface,
  MCPStorageInterface,
  ResourceDefinition,
} from '@/contexts/MCPContext';
import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { AppError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';

import { ConversationToolService, type ConversationToolServiceContext } from './tools';

// Bridge interface during migration - supports both ConversationContext and MCPConversationContext
export interface ConversationToolContext {
  getActiveConversationId(): string | null;
  setActiveConversation(conversationId: string): void;
  createConversation(title?: string): Promise<string>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<boolean>;
  deleteConversation(conversationId: string): Promise<boolean>;
  listConversations(options?: { limit?: number; offset?: number }): Promise<{ conversations: ConversationInfo[]; total: number }>;
  addMessage(conversationId: string, message: { query: string; response: string; userId?: string; userName?: string }): Promise<ConversationTurn>;
  searchConversations(query: string, options?: { tags?: string[]; limit?: number }): Promise<ConversationInfo[]>;
  
  // These methods would typically be on the services, but we expose them here for compatibility
  generateEmbeddingsForConversation(conversationId: string): Promise<{ updated: number; failed: number }>;
  getSummary(conversationId: string): Promise<string>;
  exportConversation(conversationId: string, format?: 'json' | 'markdown'): Promise<string>;
  
  // Tiered memory methods
  formatHistoryForPrompt(conversationId: string, maxTokens?: number): Promise<string>;
  getFlatHistory(conversationId: string): Promise<ConversationTurn[]>;
  getTieredHistory(conversationId: string): Promise<TieredHistory>;
  
  // Room lookup method
  getConversationIdByRoom(roomId: string, interfaceType?: 'cli' | 'matrix'): Promise<string | null>;
}

export interface MCPConversationContextOptions {
  name?: string;
  version?: string;
  storage: ConversationStorage;
  notifier?: ConversationNotifier;
  logger?: Logger;
  tieredMemoryConfig?: Partial<TieredMemoryConfig>;
}

/**
 * MCPConversationContext - Simplified conversation context implementation following MCPContext pattern
 * 
 * This implementation:
 * - Follows the MCPContext interface pattern (no BaseContext inheritance)
 * - Implements ConversationToolContext for gradual migration support
 * - Implements ConversationToolServiceContext for tool service compatibility
 * - Integrates with MCP servers through registerOnServer
 * - Uses composition over inheritance
 */
export class MCPConversationContext implements MCPContext, ConversationToolContext, ConversationToolServiceContext {
  private static instance: MCPConversationContext | null = null;
  
  private name: string;
  private version: string;
  private server: McpServer | null = null;
  private initialized = false;
  private activeConversationId: string | null = null;
  private logger: Logger;

  // Core services
  private storage: ConversationStorage;
  private notifier?: ConversationNotifier;
  private tieredMemoryManager: TieredMemoryManager;

  // MCP resources and tools
  private resources: ResourceDefinition[] = [];
  private tools: ResourceDefinition[] = [];

  private constructor(options: MCPConversationContextOptions) {
    this.name = options.name || 'ConversationContext';
    this.version = options.version || '1.0.0';
    this.storage = options.storage;
    this.notifier = options.notifier;
    this.logger = options.logger || Logger.getInstance();
    
    // Initialize tiered memory manager with provided config or defaults
    this.tieredMemoryManager = TieredMemoryManager.getInstance({
      storage: this.storage,
      config: options.tieredMemoryConfig,
    });
  }

  // MCPContext interface implementation
  public getContextName(): string {
    return this.name;
  }

  public getContextVersion(): string {
    return this.version;
  }

  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      // Following the MCPNoteContext pattern - we implement what we need directly
      // without trying to reuse the old BaseContext-based services
      
      // Setup basic MCP resources
      this.resources = [
        {
          protocol: 'conversation',
          path: '/conversations',
          name: 'conversations',
          description: 'Access conversation data',
          handler: async () => {
            const conversations = await this.storage.findConversations({});
            return { conversations };
          },
        },
      ];
      
      // Setup basic MCP tools
      // Get the tool service instance
      const toolService = ConversationToolService.getInstance();
      
      // Register conversation tools using the tool service
      this.tools = toolService.getTools(this);

      this.initialized = true;
      this.logger.debug(`${this.name} initialized successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to initialize ${this.name}`, { error });
      throw new AppError(`Failed to initialize ${this.name}`, 'INITIALIZATION_ERROR', error as Record<string, unknown>);
    }
  }

  public isReady(): boolean {
    return this.initialized;
  }

  public getStatus(): ContextStatus {
    return {
      name: this.name,
      version: this.version,
      ready: this.initialized,
      activeConversationId: this.activeConversationId,
      resourceCount: this.resources.length,
      toolCount: this.tools.length,
    };
  }

  /**
   * Get the underlying conversation storage
   * This is needed for services that require the raw ConversationStorage interface
   */
  public getConversationStorage(): ConversationStorage {
    return this.storage;
  }

  public getStorage(): MCPStorageInterface {
    // Create an adapter that implements MCPStorageInterface using ConversationStorage
    return {
      create: async (item: Record<string, unknown>) => {
        const conversation: NewConversation = {
          interfaceType: 'cli',
          roomId: (item['roomId'] as string) || uuidv4(),
          startedAt: new Date(),
          updatedAt: new Date(),
          metadata: item['metadata'] as Record<string, unknown>,
        };
        return await this.storage.createConversation(conversation);
      },
      read: async (id: string) => {
        const conversation = await this.storage.getConversation(id);
        return conversation ? conversation as unknown as Record<string, unknown> : null;
      },
      update: async (id: string, updates: Record<string, unknown>) => {
        return await this.storage.updateConversation(id, updates as Partial<Conversation>);
      },
      delete: async (id: string) => {
        return await this.storage.deleteConversation(id);
      },
      search: async (criteria: Record<string, unknown>) => {
        const results = await this.storage.findConversations(criteria as SearchCriteria);
        return results as unknown as Record<string, unknown>[];
      },
      list: async (options?: { limit?: number; offset?: number }) => {
        const results = await this.storage.findConversations({ 
          limit: options?.limit, 
          offset: options?.offset, 
        });
        return results as unknown as Record<string, unknown>[];
      },
      count: async (criteria?: Record<string, unknown>) => {
        const results = await this.storage.findConversations(criteria as SearchCriteria || {});
        return results.length;
      },
    };
  }

  public getFormatter(): MCPFormatterInterface {
    // Return a simple JSON formatter for now
    return {
      format: (data: unknown) => {
        return JSON.stringify(data, null, 2);
      },
    };
  }

  public registerOnServer(server: McpServer): boolean {
    try {
      this.server = server;
      
      // Register resources
      for (const resource of this.resources) {
        const resourceName = resource.name || `${this.name}_${resource.path}`;
        const description = resource.description || `Resource for ${resource.path}`;
        
        const handler = (uri: URL, extra: Record<string, unknown>) => {
          const queryParams: Record<string, unknown> = {};
          if (uri.search) {
            uri.searchParams.forEach((value, key) => {
              queryParams[key] = value;
            });
          }
          
          return resource.handler(extra, queryParams).then(result => ({
            contents: [{
              text: JSON.stringify(result),
              uri: uri.toString(),
            }],
          }));
        };
        
        server.resource(resourceName, resource.path, { description }, handler);
      }
      
      // Register tools
      for (const tool of this.tools) {
        const toolName = tool.name || `${this.name}_${tool.path}`;
        const description = tool.description || `Tool for ${tool.path}`;
        
        const handler = (extra: Record<string, unknown>) => {
          const params = extra['params'] || {};
          const query = extra['query'] || {};
          
          return tool.handler(params as Record<string, unknown>, query as Record<string, unknown>)
            .then(result => ({
              content: [{
                type: 'text' as const,
                text: typeof result === 'string' ? result : JSON.stringify(result),
              }],
            }));
        };
        
        server.tool(toolName, description, handler);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error registering ${this.name} on server`, { error });
      return false;
    }
  }

  public getMcpServer(): McpServer {
    if (!this.server) {
      throw new AppError('MCP server not registered', 'NOT_INITIALIZED');
    }
    return this.server;
  }

  public getCapabilities(): ContextCapabilities {
    return {
      resources: [...this.resources],
      tools: [...this.tools],
      features: ['conversation-management', 'message-history', 'summaries', 'embeddings'],
    };
  }

  public async cleanup(): Promise<void> {
    this.logger.debug(`Cleaning up ${this.name}`);
    this.initialized = false;
    this.server = null;
    this.resources = [];
    this.tools = [];
  }

  // ConversationToolContext interface implementation
  public getActiveConversationId(): string | null {
    return this.activeConversationId;
  }

  public setActiveConversation(conversationId: string): void {
    this.activeConversationId = conversationId;
  }

  public async createConversation(title?: string): Promise<string> {
    const conversation: NewConversation = {
      interfaceType: 'cli',
      roomId: uuidv4(),
      startedAt: new Date(),
      updatedAt: new Date(),
      metadata: { title: title || `Conversation ${new Date().toLocaleDateString()}` },
    };

    const conversationId = await this.storage.createConversation(conversation);
    
    if (this.notifier) {
      // Get the full conversation and notify
      const fullConversation = await this.storage.getConversation(conversationId);
      if (fullConversation) {
        await this.notifier.notifyConversationStarted(fullConversation);
      }
    }

    return conversationId;
  }

  public async getConversation(conversationId: string): Promise<Conversation | null> {
    return await this.storage.getConversation(conversationId);
  }

  public async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<boolean> {
    updates.updatedAt = new Date();
    const success = await this.storage.updateConversation(conversationId, updates);
    
    if (success && this.notifier) {
      const conversation = await this.storage.getConversation(conversationId);
      if (conversation) {
        // Using notifyConversationStarted as a proxy for update notifications
        await this.notifier.notifyConversationStarted(conversation);
      }
    }

    return success;
  }

  public async deleteConversation(conversationId: string): Promise<boolean> {
    const success = await this.storage.deleteConversation(conversationId);
    
    if (success && this.notifier) {
      // Use notifyConversationCleared with the conversationId
      await this.notifier.notifyConversationCleared(conversationId);
    }

    // Clear active conversation if it was deleted
    if (this.activeConversationId === conversationId) {
      this.activeConversationId = null;
    }

    return success;
  }

  public async listConversations(options?: { limit?: number; offset?: number }): Promise<{ conversations: ConversationInfo[]; total: number }> {
    const conversations = await this.storage.findConversations({
      limit: options?.limit,
      offset: options?.offset,
    });

    return {
      conversations,
      total: conversations.length,
    };
  }

  public async addMessage(conversationId: string, message: { query: string; response: string; userId?: string; userName?: string }): Promise<ConversationTurn> {
    const turn: ConversationTurn = {
      id: uuidv4(),
      query: message.query,
      response: message.response,
      timestamp: new Date(),
      userId: message.userId,
      userName: message.userName,
      metadata: {},
    };

    const turnId = await this.storage.addTurn(conversationId, turn);
    turn.id = turnId;

    // Check if we need to summarize after adding the new turn
    // Only do this if the conversation exists (handle test scenarios gracefully)
    const conversation = await this.storage.getConversation(conversationId);
    if (conversation) {
      await this.tieredMemoryManager.checkAndSummarize(conversationId);
    }

    if (this.notifier) {
      // No specific message notification in the interface, but we could notify about conversation update
      if (conversation) {
        await this.notifier.notifyConversationStarted(conversation);
      }
    }

    return turn;
  }

  public async searchConversations(query: string, options?: { tags?: string[]; limit?: number }): Promise<ConversationInfo[]> {
    return await this.storage.findConversations({
      query,
      limit: options?.limit,
    });
  }

  public async generateEmbeddingsForConversation(_conversationId: string): Promise<{ updated: number; failed: number }> {
    // This would typically be implemented by the memory service
    return { updated: 0, failed: 0 };
  }

  public async getSummary(conversationId: string): Promise<string> {
    const summaries = await this.storage.getSummaries(conversationId);
    if (summaries.length > 0) {
      return summaries[0].content;
    }
    return 'No summary available';
  }

  public async getConversationIdByRoom(roomId: string, interfaceType?: 'cli' | 'matrix'): Promise<string | null> {
    return await this.storage.getConversationByRoom(roomId, interfaceType);
  }

  public async exportConversation(conversationId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const conversation = await this.storage.getConversation(conversationId);
    if (!conversation) {
      throw new AppError(`Conversation ${conversationId} not found`, 'NOT_FOUND');
    }

    const turns = await this.storage.getTurns(conversationId);

    if (format === 'markdown') {
      let markdown = `# ${conversation.metadata?.['title'] || 'Conversation'}\n\n`;
      markdown += `Created: ${conversation.createdAt}\n`;
      markdown += `Updated: ${conversation.updatedAt}\n\n`;
      
      for (const turn of turns) {
        markdown += `## User (${turn.timestamp})\n\n`;
        markdown += `${turn.query}\n\n`;
        markdown += `## Assistant (${turn.timestamp})\n\n`;
        markdown += `${turn.response}\n\n`;
      }
      
      return markdown;
    }

    // Default JSON export
    return JSON.stringify({ conversation, turns }, null, 2);
  }

  // Tiered memory methods
  public async formatHistoryForPrompt(conversationId: string, maxTokens?: number): Promise<string> {
    return await this.tieredMemoryManager.formatHistoryForPrompt(conversationId, maxTokens);
  }

  public async getFlatHistory(conversationId: string): Promise<ConversationTurn[]> {
    const tieredHistory = await this.tieredMemoryManager.getTieredHistory(conversationId);
    
    // Combine summaries and active turns into a flat history
    const flatHistory: ConversationTurn[] = [];
    
    // Add summarized turns as pseudo-turns
    for (const summary of tieredHistory.summaries) {
      flatHistory.push({
        id: summary.id,
        query: `[Summary of ${summary.turnCount} turns]`,
        response: summary.content,
        timestamp: summary.createdAt,
        metadata: {
          isSummary: true,
          originalTurnIds: summary.metadata?.['originalTurnIds'],
        },
      });
    }
    
    // Add active turns
    flatHistory.push(...tieredHistory.activeTurns);
    
    // Sort by timestamp
    flatHistory.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
    
    return flatHistory;
  }

  public getTieredHistory(conversationId: string): Promise<TieredHistory> {
    return this.tieredMemoryManager.getTieredHistory(conversationId);
  }

  // Singleton pattern
  public static getInstance(options?: MCPConversationContextOptions): MCPConversationContext {
    if (!MCPConversationContext.instance) {
      // Provide default storage if none specified
      const defaultOptions: MCPConversationContextOptions = options || {
        storage: InMemoryStorage.getInstance(),
      };
      MCPConversationContext.instance = new MCPConversationContext(defaultOptions);
    }
    return MCPConversationContext.instance;
  }

  public static resetInstance(): void {
    MCPConversationContext.instance = null;
  }

  public static createFresh(options: MCPConversationContextOptions): MCPConversationContext {
    return new MCPConversationContext(options);
  }
}