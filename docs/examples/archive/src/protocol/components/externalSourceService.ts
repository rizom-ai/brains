/**
 * Service for handling external source interactions
 */

import { relevanceConfig } from '@/config';
import type { MCPExternalSourceContext } from '@/contexts';
import type { ExternalSourceResult } from '@/contexts/externalSources/sources';
import type { Note } from '@models/note';
import { Logger } from '@utils/logger';

import type { ProfileAnalyzer } from './profileAnalyzer';
import type { PromptFormatter } from './promptFormatter';

/**
 * Configuration options for ExternalSourceService
 */
export interface ExternalSourceServiceConfig {
  /** External source context for fetching information */
  externalContext: MCPExternalSourceContext;
  /** Profile analyzer for determining query relevance */
  profileAnalyzer: ProfileAnalyzer;
  /** Prompt formatter for calculating coverage */
  promptFormatter: PromptFormatter;
}

/**
 * Handles fetching and processing of external information
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class ExternalSourceService {
  /** The singleton instance */
  private static instance: ExternalSourceService | null = null;

  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  private externalContext: MCPExternalSourceContext;
  private profileAnalyzer: ProfileAnalyzer;
  private promptFormatter: PromptFormatter;

  /**
   * Get the singleton instance of ExternalSourceService
   * 
   * @param config Configuration options
   * @returns The singleton instance
   */
  public static getInstance(config: ExternalSourceServiceConfig): ExternalSourceService {
    if (!ExternalSourceService.instance) {
      ExternalSourceService.instance = new ExternalSourceService(
        config.externalContext,
        config.profileAnalyzer,
        config.promptFormatter,
      );
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceService singleton instance created');
    }
    
    return ExternalSourceService.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state
   */
  public static resetInstance(): void {
    ExternalSourceService.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ExternalSourceService singleton instance reset');
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param config Configuration options
   * @returns A new ExternalSourceService instance
   */
  public static createFresh(config: ExternalSourceServiceConfig): ExternalSourceService {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ExternalSourceService instance');
    
    return new ExternalSourceService(
      config.externalContext,
      config.profileAnalyzer,
      config.promptFormatter,
    );
  }

  /**
   * Private constructor to enforce factory method usage
   * 
   * @param externalContext External source context
   * @param profileAnalyzer Profile analyzer for relevance checks
   * @param promptFormatter Prompt formatter for coverage calculation
   */
  private constructor(
    externalContext: MCPExternalSourceContext, 
    profileAnalyzer: ProfileAnalyzer,
    promptFormatter: PromptFormatter,
  ) {
    this.externalContext = externalContext;
    this.profileAnalyzer = profileAnalyzer;
    this.promptFormatter = promptFormatter;
    
    this.logger.debug('ExternalSourceService initialized');
  }

  /**
   * Fetch relevant context from external sources
   * @param query The user query
   * @param limit Maximum number of results to return
   * @returns Array of external source results
   */
  async fetchExternalContext(query: string, limit: number = 3): Promise<ExternalSourceResult[]> {
    try {
      // Use semantic search for better results when comparing with internal notes
      const results = await this.externalContext.semanticSearch(query, limit);
      return results;
    } catch (error) {
      this.logger.error('Error fetching external context:', error);
      return [];
    }
  }

  /**
   * Determine if we should query external sources
   * @param query The user query
   * @param relevantNotes Notes from internal knowledge base
   * @returns Boolean indicating whether to query external sources
   */
  shouldQueryExternalSources(query: string, relevantNotes: Note[]): boolean {
    // Skip external sources for profile queries
    if (this.profileAnalyzer.isProfileQuery(query)) {
      return false;
    }

    // Always use external sources if no relevant notes found
    if (relevantNotes.length === 0) {
      return true;
    }

    // Look for explicit requests for external information
    const externalKeywords = [
      'search', 'external', 'online', 'web', 'internet', 'look up',
      'wikipedia', 'reference', 'latest', 'recent', 'current',
      'what is', 'who is', 'where is', 'when did', 'how to',
    ];

    const lowercaseQuery = query.toLowerCase();
    if (externalKeywords.some(keyword => lowercaseQuery.includes(keyword))) {
      return true;
    }

    // Calculate coverage of the query by internal notes
    // This is a heuristic and could be improved with semantic relevance
    let highestCoverage = 0;
    for (const note of relevantNotes) {
      const coverage = this.promptFormatter.calculateCoverage(query, note);
      highestCoverage = Math.max(highestCoverage, coverage);
    }

    // If internal notes have low coverage, use external sources
    return highestCoverage < relevanceConfig.externalSourcesThreshold;
  }
}