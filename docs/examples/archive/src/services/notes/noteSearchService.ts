/**
 * Service for searching notes using various strategies
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import type { Note } from '@/models/note';
import type { ISearchService } from '@/services/interfaces/ISearchService';
import { ValidationError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';
import { isDefined, isNonEmptyString } from '@/utils/safeAccessUtils';
import { TextUtils } from '@/utils/textUtils';

import { NoteEmbeddingService } from './noteEmbeddingService';
import { NoteRepository } from './noteRepository';

/**
 * Search options for notes
 */
export interface NoteSearchOptions {
  query?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  semanticSearch?: boolean;
}

/**
 * Note search service configuration options
 */
export interface NoteSearchServiceConfig {
  /** Name of the entity being searched */
  entityName?: string;
}

/**
 * Note search service dependencies
 */
export interface NoteSearchServiceDependencies {
  /** Repository for accessing notes */
  repository: NoteRepository;
  /** Embedding service for semantic operations */
  embeddingService: NoteEmbeddingService;
  /** Logger instance */
  logger: Logger;
  /** TextUtils instance */
  textUtils: TextUtils;
}

/**
 * Service for searching notes using various strategies
 */
export class NoteSearchService implements ISearchService<Note> {
  /** The name of the entity being searched */
  protected entityName = 'note';
  
  /** Repository for accessing notes */
  protected repository: NoteRepository;
  
  /** Embedding service for semantic operations */
  protected embeddingService: NoteEmbeddingService;
  
  /** Logger instance */
  protected logger: Logger;
  
  /** Text utilities instance for text processing */
  private readonly textUtils: TextUtils;
  
  /**
   * Singleton instance of NoteSearchService
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: NoteSearchService | null = null;
  
  /**
   * Get the singleton instance of the service
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param config Optional configuration
   * @returns The singleton instance
   */
  public static getInstance(): NoteSearchService {
    if (!NoteSearchService.instance) {
      // Create with defaults if instance doesn't exist
      const logger = Logger.getInstance();
      
      const dependencies: NoteSearchServiceDependencies = {
        repository: NoteRepository.getInstance(),
        embeddingService: NoteEmbeddingService.getInstance(),
        logger: logger,
        textUtils: TextUtils.getInstance(),
      };
      
      NoteSearchService.instance = new NoteSearchService({ entityName: 'note' }, dependencies);
      logger.debug('NoteSearchService singleton instance created');
    }
    
    return NoteSearchService.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (NoteSearchService.instance) {
        // No specific cleanup needed for this service
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during NoteSearchService instance reset:', error);
    } finally {
      NoteSearchService.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('NoteSearchService singleton instance reset');
    }
  }
  
  /**
   * Create a fresh NoteSearchService instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param config Optional configuration
   * @returns A new NoteSearchService instance
   */
  public static createFresh(
    config: NoteSearchServiceConfig = { entityName: 'note' },
    dependencies?: NoteSearchServiceDependencies,
  ): NoteSearchService {
    if (dependencies) {
      // Use provided dependencies as-is
      dependencies.logger.debug('Creating fresh NoteSearchService instance');
      return new NoteSearchService(config, dependencies);
    } else {
      // Create default dependencies
      const logger = Logger.getInstance();
      logger.debug('Creating fresh NoteSearchService instance with default dependencies');
      
      const defaultDeps: NoteSearchServiceDependencies = {
        repository: NoteRepository.getInstance(),
        embeddingService: NoteEmbeddingService.getInstance(),
        logger: logger,
        textUtils: TextUtils.getInstance(),
      };
      
      return new NoteSearchService(config, defaultDeps);
    }
  }

  /**
   * Create a new NoteSearchService with injected dependencies
   * 
   * Note: When not testing, prefer using getInstance() or createFresh() factory methods
   * 
   * @param config Service configuration
   * @param dependencies Service dependencies
   */
  constructor(
    config: NoteSearchServiceConfig,
    dependencies: NoteSearchServiceDependencies,
  ) {
    this.entityName = config.entityName || 'note';
    this.repository = dependencies.repository;
    this.embeddingService = dependencies.embeddingService;
    this.logger = dependencies.logger;
    this.textUtils = dependencies.textUtils;
    
    dependencies.logger.debug('NoteSearchService instance created with dependencies');
  }

  /**
   * Search entities using various search strategies
   * @param options Search options
   * @returns Array of matching entities
   */
  async search(options: NoteSearchOptions): Promise<Note[]> {
    // Validate options parameter
    if (!options || typeof options !== 'object') {
      throw new ValidationError(`Invalid ${this.entityName} search options`, { optionsType: typeof options });
    }
    
    try {
      // Safely extract options with defaults
      const limit = isDefined(options.limit) ? Math.max(1, Math.min(options.limit, 100)) : 10;
      const offset = isDefined(options.offset) ? Math.max(0, options.offset) : 0;
      const semanticSearch = options.semanticSearch !== false; // Default to true
      
      // Handle query safely, ensuring it's a string
      const query = isNonEmptyString(options.query) ? options.query : undefined;
      
      // Ensure tags is an array if present and filter out invalid tags
      const tags = Array.isArray(options.tags) 
        ? options.tags.filter(isNonEmptyString)
        : undefined;
        
      this.logger.debug(`Searching ${this.entityName}s with: ${JSON.stringify({
        query: query?.substring(0, 30) + (query && query.length > 30 ? '...' : ''),
        tagsCount: tags?.length,
        limit,
        offset,
        semanticSearch,
      })}`);

      // If semantic search is enabled and there's a query, perform vector search
      if (semanticSearch && query) {
        const results = await this.semanticSearch(query, tags, limit, offset);
        this.logger.info(`Semantic search found ${results.length} ${this.entityName} results`);
        return results;
      }

      // Otherwise, fall back to keyword search
      const results = await this.keywordSearch(query, tags, limit, offset);
      
      this.logger.info(`Keyword search found ${results.length} ${this.entityName} results`);
      return results;
    } catch (error) {
      this.logger.warn(`Search error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Search notes with various strategies
   * @param options Search options including query, tags, limit, offset, and search type
   * @returns Array of matching notes
   */
  async searchNotes(options: NoteSearchOptions): Promise<Note[]> {
    return this.search(options);
  }

  /**
   * Search using traditional keyword matching
   * @param query Optional search query
   * @param tags Optional tags to filter by
   * @param limit Maximum results to return
   * @param offset Pagination offset
   * @returns Array of matching notes
   */
  protected async keywordSearch(
    query?: string,
    tags?: string[],
    limit = 10,
    offset = 0,
  ): Promise<Note[]> {
    try {
      this.logger.debug(`Performing keyword search with query: ${query}, tags: ${tags?.join(', ')}`);
      return await this.repository.search({ query, tags, limit, offset });
    } catch (error) {
      this.logger.error(`Keyword search failed: ${error instanceof Error ? error.message : String(error)}`);
      return this.repository.getRecentNotes(limit);
    }
  }

  /**
   * Search using vector similarity
   * @param query The search query
   * @param tags Optional tags to filter by
   * @param limit Maximum number of results
   * @param offset Pagination offset
   * @returns Array of matching notes
   */
  protected async semanticSearch(
    query: string,
    tags?: string[],
    limit = 10,
    offset = 0,
  ): Promise<Note[]> {
    try {
      if (!isNonEmptyString(query)) {
        throw new ValidationError('Empty query for semantic search');
      }

      // Apply safe limits
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);

      // Generate embedding for the query
      const embedding = await this.embeddingService.generateEmbedding(query);

      // Search for similar notes
      const scoredNotes = await this.embeddingService.searchSimilarNotes(embedding, safeLimit + safeOffset);

      // Filter by tags if provided
      const filteredNotes = isDefined(tags) && tags.length > 0
        ? scoredNotes.filter(note => {
          if (!Array.isArray(note.tags)) return false;
          return tags.some(tag => note.tags?.includes(tag));
        })
        : scoredNotes;

      // Apply pagination
      const paginatedNotes = filteredNotes.slice(safeOffset, safeOffset + safeLimit);

      // Return notes without the score property
      return paginatedNotes.map(({ score: _score, ...note }) => note);
    } catch (error) {
      // Log but don't fail - fall back to keyword search
      this.logger.error(`Error in semantic search: ${error instanceof Error ? error.message : String(error)}`);

      // Try keyword search as fallback
      this.logger.debug('Falling back to keyword search');
      return this.keywordSearch(query, tags, limit, offset);
    }
  }

  /**
   * Find related notes for a note
   * @param noteId ID of the note to find related notes for
   * @param maxResults Maximum number of results to return
   * @returns Array of related notes
   */
  async findRelated(noteId: string, maxResults = 5): Promise<Note[]> {
    try {
      // Apply safe limits
      const safeMaxResults = Math.max(1, Math.min(maxResults || 5, 50));
      
      // Try semantic similarity
      const relatedNotes = await this.embeddingService.findRelatedNotes(noteId, safeMaxResults);

      if (relatedNotes.length > 0) {
        // Remove score property before returning
        return relatedNotes.map(({ score: _score, ...note }) => note);
      }

      // Fall back to recent notes if no semantic results or an error occurs
      this.logger.debug('No semantic related notes found, returning recent notes');
      return this.repository.getRecentNotes(safeMaxResults);
    } catch (error) {
      this.logger.error(`Error finding related notes: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.debug(`Falling back to recent notes with limit ${maxResults}`);
      return this.repository.getRecentNotes(maxResults);
    }
  }

  /**
   * Extract keywords from text
   * @param text The text to extract keywords from
   * @param maxKeywords Maximum number of keywords to extract (default: 10)
   * @returns Array of extracted keywords
   */
  protected extractKeywords(text: string, maxKeywords = 10): string[] {
    if (!isNonEmptyString(text)) {
      this.logger.debug('Empty text provided for keyword extraction');
      return [];
    }

    try {
      // Apply safe limits with defaults
      const safeMaxKeywords = Math.max(1, Math.min(maxKeywords || 10, 50));

      // Use TextUtils instance to extract keywords
      const keywords = this.textUtils.extractKeywords(text, safeMaxKeywords);
      
      const validKeywords = Array.isArray(keywords) ? keywords.filter(isNonEmptyString) : [];
      this.logger.debug(`Extracted ${validKeywords.length} keywords from text`);

      // Ensure we return a valid array
      return validKeywords;
    } catch (error) {
      this.logger.warn(`Error extracting keywords: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Calculate tag match score between two sets of tags
   * @param sourceTags First set of tags
   * @param targetTags Second set of tags
   * @returns Match score (higher is better match)
   */
  protected calculateTagMatchScore(sourceTags: string[], targetTags: string[]): number {
    if (!isDefined(sourceTags) || !isDefined(targetTags) || 
        sourceTags.length === 0 || targetTags.length === 0) {
      return 0;
    }
    
    return sourceTags.reduce((count, sourceTag) => {
      // Direct match (exact tag match)
      const directMatch = targetTags.includes(sourceTag);

      // Partial match (tag contains or is contained by a target tag)
      const partialMatch = !directMatch && targetTags.some(targetTag =>
        sourceTag.includes(targetTag) || targetTag.includes(sourceTag),
      );

      return count + (directMatch ? 1 : partialMatch ? 0.5 : 0);
    }, 0);
  }

  /**
   * Filter and remove duplicate entities from results
   * @param results Array of entities to deduplicate
   * @param getEntityId Function to get entity ID
   * @param excludeId Optional ID to exclude from results
   * @returns Deduplicated array of entities
   */
  protected deduplicateResults<T>(
    results: T[], 
    getEntityId: (entity: T) => string,
    excludeId?: string,
  ): T[] {
    return results.reduce<T[]>((unique, entity) => {
      const id = getEntityId(entity);
      if (
        (!excludeId || id !== excludeId) && 
        !unique.some(existing => getEntityId(existing) === id)
      ) {
        unique.push(entity);
      }
      return unique;
    }, []);
  }
}