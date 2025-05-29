/**
 * ExternalSourceStorageAdapter for adapting external sources to the StorageInterface
 * 
 * This adapter bridges the StorageInterface pattern with specific 
 * external source implementations like Wikipedia and NewsAPI.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { EmbeddingService } from '@/resources/ai/embedding';
import { getEnv } from '@/utils/configUtils';
import { Logger } from '@/utils/logger';

import type { ListOptions, SearchCriteria, StorageInterface } from '../storageInterface';

import type {
  ExternalSearchOptions,
  ExternalSourceInterface,
  ExternalSourceResult,
} from './sources';
import { NewsApiSource, WikipediaSource } from './sources';

/**
 * Cache item for storing retrieved results
 */
interface CacheItem {
  data: ExternalSourceResult[];
  timestamp: number;
}

/**
 * Configuration for the adapter
 */
export interface ExternalSourceStorageConfig {
  /**
   * List of enabled source names
   */
  enabledSources?: string[];

  /**
   * Maximum results to return per search
   */
  maxResults?: number;

  /**
   * Cache time to live in milliseconds
   */
  cacheTtl?: number;

  /**
   * API key for embedding service
   */
  apiKey?: string;

  /**
   * NewsAPI key
   */
  newsApiKey?: string;
}

/**
 * Adapter to provide standard StorageInterface for external sources
 */
export class ExternalSourceStorageAdapter implements StorageInterface<ExternalSourceResult> {
  /** The singleton instance */
  private static instance: ExternalSourceStorageAdapter | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  /** Registered external source instances */
  private sources: Map<string, ExternalSourceInterface> = new Map();
  
  /** Cache for storing search results */
  private sourceCache: Map<string, CacheItem> = new Map();
  
  /**
   * Options with defaults
   */
  private options: Required<ExternalSourceStorageConfig>;

  /**
   * Create a new ExternalSourceStorageAdapter
   * @param config Configuration options
   */
  constructor(config: ExternalSourceStorageConfig = {}) {
    // Default options
    this.options = {
      enabledSources: config.enabledSources || ['Wikipedia', 'NewsAPI'],
      maxResults: config.maxResults || 10,
      cacheTtl: config.cacheTtl || 1000 * 60 * 60, // 1 hour by default
      apiKey: config.apiKey || '',
      newsApiKey: config.newsApiKey || getEnv('NEWSAPI_KEY') || '',
    };
    
    // Initialize the adapter
    this.initializeSources();
  }
  
  /**
   * Get the singleton instance of ExternalSourceStorageAdapter
   * 
   * @param config Optional configuration for the adapter
   * @returns The shared ExternalSourceStorageAdapter instance
   */
  public static getInstance(config?: ExternalSourceStorageConfig): ExternalSourceStorageAdapter {
    if (!ExternalSourceStorageAdapter.instance) {
      ExternalSourceStorageAdapter.instance = ExternalSourceStorageAdapter.createWithDependencies(config);
    }
    return ExternalSourceStorageAdapter.instance;
  }
  
  /**
   * Factory method that resolves dependencies and creates a new instance
   * 
   * @param config Configuration options
   * @returns A new ExternalSourceStorageAdapter instance with resolved dependencies
   */
  public static createWithDependencies(config?: ExternalSourceStorageConfig): ExternalSourceStorageAdapter {
    return new ExternalSourceStorageAdapter(config);
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ExternalSourceStorageAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Optional configuration for the adapter
   * @returns A new ExternalSourceStorageAdapter instance
   */
  public static createFresh(config?: ExternalSourceStorageConfig): ExternalSourceStorageAdapter {
    return new ExternalSourceStorageAdapter(config);
  }
  
  /**
   * Initialize the sources based on configuration
   * @private
   */
  private initializeSources(): void {
    // Create embedding service using the standard interface pattern - no params
    const embeddingService = EmbeddingService.getInstance();
    
    // Create and register Wikipedia source with standard pattern
    const wikipediaSource = WikipediaSource.createFresh({ embeddingService });
    this.registerSource(wikipediaSource);

    // Create and register NewsAPI source if key is provided
    if (this.options.newsApiKey) {
      const newsApiSource = NewsApiSource.createFresh({
        apiKey: this.options.newsApiKey,
        embeddingService,
      });
      this.registerSource(newsApiSource);
      this.logger.debug('NewsAPI source registered', { context: 'ExternalSourceStorage' });
    }
  }

  /**
   * Register a new external source
   * @param source The source to register
   */
  registerSource(source: ExternalSourceInterface): void {
    this.sources.set(source.name, source);
    this.logger.debug(`Registered external source: ${source.name}`, { context: 'ExternalSourceStorage' });
  }

  /**
   * Get the available sources that are enabled
   * @returns Array of enabled external sources
   */
  getEnabledSources(): ExternalSourceInterface[] {
    if (!this.options.enabledSources || this.options.enabledSources.length === 0) {
      return Array.from(this.sources.values());
    }

    return this.options.enabledSources
      .map(name => this.sources.get(name))
      .filter(source => source !== undefined) as ExternalSourceInterface[];
  }

  /**
   * Create method (not applicable for external sources)
   * @returns Empty string since creating items is not supported
   */
  async create(_item: Partial<ExternalSourceResult>): Promise<string> {
    // External sources are read-only, so this is a no-op
    return '';
  }

  /**
   * Read a specific result by ID
   * @param id The ID to look for
   * @returns Promise that resolves to the result or null if not found
   */
  async read(id: string): Promise<ExternalSourceResult | null> {
    // Check cache first for any items with this ID
    for (const cached of this.sourceCache.values()) {
      // External source results don't reliably have IDs, but we use title as a unique identifier
      const item = cached.data.find(result =>
        'id' in result && (result as { id: string }).id === id);
      if (item) return item;
    }

    // No result found
    return null;
  }

  /**
   * Update is not supported for external sources
   */
  async update(_id: string, _updates: Partial<ExternalSourceResult>): Promise<boolean> {
    // External sources are read-only, so this is a no-op
    return false;
  }

  /**
   * Delete is not supported for external sources
   */
  async delete(_id: string): Promise<boolean> {
    // External sources are read-only, so this is a no-op
    return false;
  }

  /**
   * Search across all enabled external sources
   * @param criteria Search criteria including query and options
   * @returns Promise that resolves to an array of results
   */
  async search(criteria: SearchCriteria): Promise<ExternalSourceResult[]> {
    const query = criteria['query'] as string;
    if (!query) {
      return [];
    }

    // Map criteria to source-specific options
    const options: ExternalSearchOptions = {
      query,
      limit: (criteria['limit'] as number) || Math.ceil(this.options.maxResults / Math.max(1, this.getEnabledSources().length)),
      addEmbeddings: (criteria['addEmbeddings'] as boolean) || false,
    };

    this.logger.info(`Searching external sources for: "${query}"`, { context: 'ExternalSourceStorage' });

    // Check cache first
    const cacheKey = this.getCacheKey(query, options);
    const cachedResults = this.getCachedResults(cacheKey);
    if (cachedResults) {
      this.logger.debug(`Using cached results for: "${query}"`, { context: 'ExternalSourceStorage' });
      return cachedResults;
    }

    const enabledSources = this.getEnabledSources();
    if (enabledSources.length === 0) {
      this.logger.warn('No enabled external sources found', { context: 'ExternalSourceStorage' });
      return [];
    }

    // Search all enabled sources in parallel
    const searchPromises = enabledSources.map(source =>
      source.search(options)
        .catch(error => {
          this.logger.error(`Error searching ${source.name}`, { error, context: 'ExternalSourceStorage' });
          return [] as ExternalSourceResult[];
        }),
    );

    const results = await Promise.all(searchPromises);
    const allResults = results.flat();

    // Sort by confidence and limit total results
    const sortedResults = allResults
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.options.maxResults);

    // Cache results
    this.cacheResults(cacheKey, sortedResults);

    this.logger.info(`Found ${sortedResults.length} results from external sources`, { context: 'ExternalSourceStorage' });
    return sortedResults;
  }

  /**
   * List external source results (returns recent cache entries)
   * @param options Options for listing results
   * @returns Promise that resolves to an array of results
   */
  async list(options?: ListOptions): Promise<ExternalSourceResult[]> {
    // Return most recent cached results (if any)
    if (this.sourceCache.size > 0) {
      // Get most recent cache entries
      const entries = Array.from(this.sourceCache.entries());

      // Sort by timestamp (newest first)
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

      // Get the most recent entry
      const recentEntry = entries[0];
      if (recentEntry) {
        const limit = options?.limit || 10;
        return recentEntry[1].data.slice(0, limit);
      }
    }

    return [];
  }

  /**
   * Count external source results (based on enabled sources)
   * @returns Promise that resolves to the count
   */
  async count(): Promise<number> {
    return this.getEnabledSources().length;
  }

  /**
   * Check availability of all sources
   * @returns Map of source names to availability status
   */
  async checkSourcesAvailability(): Promise<Record<string, boolean>> {
    const availabilityMap: Record<string, boolean> = {};

    // If no sources, return empty object
    if (this.sources.size === 0) {
      return availabilityMap;
    }

    // Check each source in parallel
    const checkPromises: Promise<void>[] = [];

    for (const [name, source] of this.sources.entries()) {
      checkPromises.push(
        source.checkAvailability()
          .then(available => {
            availabilityMap[name] = available;
          })
          .catch(() => {
            availabilityMap[name] = false;
          }),
      );
    }

    await Promise.all(checkPromises);
    return availabilityMap;
  }

  /**
   * Create a cache key for a query and options
   */
  private getCacheKey(query: string, options: Partial<ExternalSearchOptions>): string {
    return `${query}:${JSON.stringify(options)}`;
  }

  /**
   * Get cached results if they exist and are not expired
   */
  private getCachedResults(cacheKey: string): ExternalSourceResult[] | null {
    const cached = this.sourceCache.get(cacheKey);

    if (!cached) return null;

    const now = Date.now();
    const isExpired = now - cached.timestamp > this.options.cacheTtl;

    if (isExpired) {
      this.sourceCache.delete(cacheKey);
      return null;
    }

    return cached.data;
  }

  /**
   * Cache search results
   */
  private cacheResults(cacheKey: string, results: ExternalSourceResult[]): void {
    this.sourceCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });

    // Prune cache if it gets too large
    if (this.sourceCache.size > 100) {
      this.pruneCache();
    }
  }

  /**
   * Remove oldest items from cache
   */
  private pruneCache(): void {
    // Get entries from cache
    const entries = Array.from(this.sourceCache.entries());

    // Sort by age (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20% of entries
    const removeCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      if (entries[i]) {
        this.sourceCache.delete(entries[i][0]);
      }
    }

    this.logger.debug(`Pruned ${removeCount} items from external source cache`, { context: 'ExternalSourceStorage' });
  }
}