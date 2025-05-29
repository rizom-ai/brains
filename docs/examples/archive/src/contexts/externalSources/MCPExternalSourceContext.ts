/**
 * MCPExternalSourceContext - External Source Context using the simplified MCP design
 * 
 * This implementation uses the new composition-based MCPContext pattern
 * instead of the previous inheritance-based BaseContext approach.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance 
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ExternalSourceStorageAdapter } from '@/contexts/externalSources/externalSourceStorageAdapter';
import { ExternalSourceFormatter } from '@/contexts/externalSources/formatters';
import type { ExternalSearchOptions, ExternalSourceResult } from '@/contexts/externalSources/sources/externalSourceInterface';
import { type ExternalSourceToolContext, ExternalSourceToolService } from '@/contexts/externalSources/tools';
import type { ContextStatus, MCPContext, MCPFormatterInterface, MCPStorageInterface } from '@/contexts/MCPContext';
import { createContextFunctionality } from '@/contexts/MCPContext';
import type { SearchCriteria } from '@/contexts/storageInterface';
import { EmbeddingService } from '@/resources/ai/embedding';
import { Logger } from '@/utils/logger';


/**
 * Configuration for the MCPExternalSourceContext
 */
export interface MCPExternalSourceContextConfig extends Record<string, unknown> {
  /**
   * API key for embedding service
   */
  apiKey?: string;

  /**
   * NewsAPI key for news searches
   */
  newsApiKey?: string;

  /**
   * Enabled sources for searching
   */
  enabledSources?: string[];

  /**
   * Maximum results per search
   */
  maxResults?: number;

  /**
   * Cache TTL in seconds
   */
  cacheTtl?: number;

  /**
   * Name for the context (defaults to 'ExternalBrain')
   */
  name?: string;

  /**
   * Version for the context (defaults to '1.0.0')
   */
  version?: string;
}

/**
 * Dependencies for MCPExternalSourceContext
 */
export interface MCPExternalSourceContextDependencies {
  /** Storage adapter instance */
  storage?: ExternalSourceStorageAdapter;
  /** Formatter instance */
  formatter?: ExternalSourceFormatter;
  /** Embedding service instance */
  embeddingService?: EmbeddingService;
  /** Logger instance */
  logger?: Logger;
}

/**
 * External Source Context for searching and managing external knowledge sources
 * 
 * Also implements ExternalSourceToolContext for compatibility with ExternalSourceToolService during migration
 */
export class MCPExternalSourceContext implements MCPContext, ExternalSourceToolContext {
  private static instance: MCPExternalSourceContext | null = null;
  
  private logger: Logger;
  private storage: ExternalSourceStorageAdapter;
  private formatter: ExternalSourceFormatter;
  private embeddingService: EmbeddingService;
  
  // Context functionality from the utility
  private contextImpl: ReturnType<typeof createContextFunctionality>;
  
  // In-memory state for enabled sources
  private enabledSourcesOverride: string[] | null = null;
  
  /**
   * Private constructor - use getInstance or createFresh
   */
  private constructor(
    config: MCPExternalSourceContextConfig,
    dependencies?: MCPExternalSourceContextDependencies,
  ) {
    // Initialize dependencies
    this.logger = dependencies?.logger || Logger.getInstance();
    this.embeddingService = dependencies?.embeddingService || EmbeddingService.getInstance();
    
    // Initialize storage adapter with config
    this.storage = dependencies?.storage || ExternalSourceStorageAdapter.getInstance({
      apiKey: config.apiKey,
      newsApiKey: config.newsApiKey,
      enabledSources: config.enabledSources,
      maxResults: config.maxResults,
      cacheTtl: config.cacheTtl,
    });
    
    // Initialize formatter
    this.formatter = dependencies?.formatter || ExternalSourceFormatter.getInstance();
    
    // Create the context implementation using the utility function
    this.contextImpl = createContextFunctionality({
      name: config.name || 'ExternalBrain',
      version: config.version || '1.0.0',
      logger: this.logger,
    });

    // Initialize MCP resources and tools
    this.initializeMcpComponents();
    
    this.logger.debug('MCPExternalSourceContext initialized', {
      name: config.name || 'ExternalBrain',
      enabledSources: config.enabledSources,
      context: 'MCPExternalSourceContext',
    });
  }
  
  /**
   * Initialize MCP components (resources and tools)
   */
  private initializeMcpComponents(): void {
    // Register resources
    this.contextImpl.resources.push(
      {
        protocol: 'external',
        path: 'search',
        handler: async (_params, query) => {
          const searchQuery = query?.['query'] as string;
          const limit = query?.['limit'] as number || 5;
          
          const results = await this.search(searchQuery, { limit });
          
          return {
            query: searchQuery,
            count: results.length,
            results: results.map(r => ({
              title: r.title,
              content: r.content,
              source: r.source,
              url: r.url,
              timestamp: r.timestamp,
            })),
          };
        },
        name: 'Search External Sources',
        description: 'Search across external knowledge sources',
      },
      
      {
        protocol: 'external',
        path: 'sources',
        handler: async () => {
          const sources = this.getEnabledSources();
          return {
            sources: sources.map(source => ({
              name: source.name,
              enabled: source.enabled,
              available: true,
            })),
          };
        },
        name: 'List Sources',
        description: 'List available external sources',
      },
    );
    
    // Register tools using the tool service pattern
    const toolService = ExternalSourceToolService.getInstance();
    const tools = toolService.getTools(this);
    
    // Convert tools to the expected format
    tools.forEach(tool => {
      this.contextImpl.tools.push({
        ...tool,
        name: tool.name || 'unknown',
        description: tool.description || '',
      });
    });
    
    this.logger.debug('Initialized MCP components', {
      resourceCount: this.contextImpl.resources.length,
      toolCount: this.contextImpl.tools.length,
      context: 'MCPExternalSourceContext',
    });
  }
  
  // MCPContext interface implementation - delegate to contextImpl
  
  async initialize(): Promise<boolean> {
    return this.contextImpl.initialize();
  }
  
  
  getContextName(): string {
    return this.contextImpl.getContextName();
  }
  
  getContextVersion(): string {
    return this.contextImpl.getContextVersion();
  }
  
  isReady(): boolean {
    return this.contextImpl.isReady();
  }
  
  getStatus(): ContextStatus {
    return this.contextImpl.getStatus();
  }
  
  cleanup(): Promise<void> {
    return this.contextImpl.cleanup();
  }
  
  getStorage(): MCPStorageInterface {
    return {
      create: async () => {
        // External sources are read-only
        throw new Error('External sources are read-only');
      },
      
      read: async () => {
        // Cannot read individual external sources by ID
        throw new Error('External sources do not support direct read by ID');
      },
      
      update: async () => {
        // External sources are read-only
        throw new Error('External sources are read-only');
      },
      
      delete: async () => {
        // External sources are read-only
        throw new Error('External sources are read-only');
      },
      
      search: async (query: Record<string, unknown>) => {
        const searchQuery = query['query'] as string;
        const limit = query['limit'] as number || 5;
        const addEmbeddings = query['addEmbeddings'] as boolean || false;
        
        const results = await this.storage.search({
          query: searchQuery,
          limit,
          addEmbeddings,
        });
        
        return results as unknown as Record<string, unknown>[];
      },
      
      list: async () => {
        // List available sources instead
        const sources = this.getEnabledSources();
        return sources.map(source => ({
          name: source.name,
          available: true,
        }));
      },
      
      count: async () => {
        return this.getEnabledSources().length;
      },
    };
  }
  
  getFormatter(): MCPFormatterInterface {
    return {
      format: (data: unknown, options?: Record<string, unknown>) => {
        return this.formatter.format(data as ExternalSourceResult[], options);
      },
    };
  }
  
  registerOnServer(server: McpServer): boolean {
    return this.contextImpl.registerOnServer(server);
  }
  
  getMcpServer(): McpServer {
    return this.contextImpl.getMcpServer();
  }
  
  getCapabilities(): {
    resources: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    tools: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    features: string[];
    } {
    return this.contextImpl.getCapabilities();
  }
  
  // Singleton pattern implementation
  
  /**
   * Get the singleton instance of MCPExternalSourceContext
   * 
   * @param config Configuration options
   * @returns The singleton instance
   */
  static getInstance(config?: MCPExternalSourceContextConfig): MCPExternalSourceContext {
    if (!MCPExternalSourceContext.instance) {
      MCPExternalSourceContext.instance = MCPExternalSourceContext.createFresh(config || {});
      
      const logger = Logger.getInstance();
      logger.debug('MCPExternalSourceContext singleton instance created');
    } else if (config) {
      // Log at debug level if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.debug('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return MCPExternalSourceContext.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  static resetInstance(): void {
    if (MCPExternalSourceContext.instance) {
      // Any cleanup needed before destroying the instance
      const logger = Logger.getInstance();
      logger.debug('MCPExternalSourceContext singleton instance reset');
      
      MCPExternalSourceContext.instance = null;
    }
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Configuration options
   * @param dependencies Optional dependencies
   * @returns A new MCPExternalSourceContext instance
   */
  static createFresh(
    config: MCPExternalSourceContextConfig,
    dependencies?: MCPExternalSourceContextDependencies,
  ): MCPExternalSourceContext {
    const logger = dependencies?.logger || Logger.getInstance();
    logger.debug('Creating fresh MCPExternalSourceContext instance');
    
    return new MCPExternalSourceContext(config, dependencies);
  }
  
  // Core functionality methods
  
  /**
   * Search external sources
   * 
   * @param query The search query
   * @param options Search options
   * @returns Array of search results
   */
  async search(query: string, options: Partial<ExternalSearchOptions> = {}): Promise<ExternalSourceResult[]> {
    // Build SearchCriteria object for storage adapter
    const searchCriteria: SearchCriteria = {
      query,
      limit: options.limit,
      addEmbeddings: options.addEmbeddings,
    };
    
    // If we have enabled sources override, add it to the criteria
    if (this.enabledSourcesOverride !== null) {
      searchCriteria['sources'] = this.enabledSourcesOverride;
    }
      
    return this.storage.search(searchCriteria);
  }
  
  /**
   * Perform semantic search across external sources
   * 
   * @param query The search query
   * @param limit Maximum number of results
   * @returns Array of semantically similar results
   */
  async semanticSearch(query: string, limit: number = 5): Promise<ExternalSourceResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      
      // Get all results with embeddings
      const results = await this.search(query, {
        limit: limit * 3, // Get more results to filter
        addEmbeddings: true,
      });
      
      // Calculate similarity scores and sort
      const scoredResults = results
        .filter(result => result.embedding)
        .map(result => {
          const similarity = this.embeddingService.calculateSimilarity(queryEmbedding, result.embedding!);
          return { result, similarity };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ result }) => result);
      
      return scoredResults;
    } catch (error) {
      this.logger.error('Error performing semantic search', { error, context: 'MCPExternalSourceContext' });
      // Fall back to regular search
      return this.search(query, { limit });
    }
  }
  
  /**
   * Get list of enabled sources
   * 
   * @returns Array of enabled source information
   */
  getEnabledSources(): { name: string; enabled: boolean }[] {
    // Use the override if set, otherwise get from storage
    const sources = this.enabledSourcesOverride !== null 
      ? this.enabledSourcesOverride.map(name => ({ name, enabled: true }))
      : this.storage.getEnabledSources();
      
    return sources.map(source => ({
      name: typeof source === 'string' ? source : source.name,
      enabled: true,
    }));
  }
  
  /**
   * Update enabled sources list
   * 
   * @param sourceNames Array of source names to enable
   */
  async updateEnabledSources(sourceNames: string[]): Promise<void> {
    // Update the in-memory override
    this.enabledSourcesOverride = [...sourceNames];
    
    this.logger.debug('Updated enabled sources in memory', {
      sourceNames,
      previousSources: this.enabledSourcesOverride,
      context: 'MCPExternalSourceContext',
    });
  }
  
  /**
   * Check if sources are available
   * 
   * @returns Status of each source
   */
  async checkSourcesAvailability(): Promise<Record<string, boolean>> {
    return this.storage.checkSourcesAvailability();
  }
  
}