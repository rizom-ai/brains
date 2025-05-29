/**
 * External Source Manager for BrainProtocol
 * Manages external knowledge sources
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import type { MCPExternalSourceContext } from '@/contexts';
import type { ExternalSourceResult } from '@/contexts/externalSources/sources';
import type { Note } from '@/models/note';
import { ExternalSourceService } from '@/protocol/components/externalSourceService';
import type { ProfileAnalyzer } from '@/protocol/components/profileAnalyzer';
import type { PromptFormatter } from '@/protocol/components/promptFormatter';
import { Logger } from '@/utils/logger';

import type { IExternalSourceManager } from '../types';

/**
 * Configuration options for ExternalSourceManager
 */
export interface ExternalSourceManagerConfig {
  /** External source context instance */
  externalSourceContext: MCPExternalSourceContext | null;
  /** Profile analyzer for relevance checks */
  profileAnalyzer: ProfileAnalyzer;
  /** Prompt formatter for excerpts */
  promptFormatter: PromptFormatter;
  /** Whether external sources are enabled */
  enabled?: boolean;
}

/**
 * Manages external knowledge sources
 */
export class ExternalSourceManager implements IExternalSourceManager {
  /**
   * Singleton instance of ExternalSourceManager
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ExternalSourceManager | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  private externalSourceService: ExternalSourceService | null;
  private enabled: boolean;

  /**
   * Get the singleton instance of ExternalSourceManager
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param config Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(config: ExternalSourceManagerConfig): ExternalSourceManager {
    if (!ExternalSourceManager.instance) {
      ExternalSourceManager.instance = new ExternalSourceManager(
        config.externalSourceContext,
        config.profileAnalyzer,
        config.promptFormatter,
        config.enabled,
      );
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceManager singleton instance created');
    } else if (config && Object.keys(config).length > 0) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return ExternalSourceManager.instance;
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
      if (ExternalSourceManager.instance && ExternalSourceManager.instance.externalSourceService) {
        // Any cleanup needed for the service would go here
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during ExternalSourceManager instance reset:', error);
    } finally {
      ExternalSourceManager.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceManager singleton instance reset');
    }
  }

  /**
   * Create a fresh ExternalSourceManager instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param config Configuration options
   * @returns A new ExternalSourceManager instance
   */
  public static createFresh(config: ExternalSourceManagerConfig): ExternalSourceManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ExternalSourceManager instance');
    
    return new ExternalSourceManager(
      config.externalSourceContext,
      config.profileAnalyzer,
      config.promptFormatter,
      config.enabled,
    );
  }

  /**
   * Create a new external source manager
   * 
   * Note: When not testing, prefer using getInstance() or createFresh() factory methods
   * 
   * @param externalSourceContext External source context
   * @param profileAnalyzer Profile analyzer for relevance checks
   * @param promptFormatter Prompt formatter for excerpts
   * @param enabled Whether external sources are enabled
   */
  public constructor(
    externalSourceContext: MCPExternalSourceContext | null,
    profileAnalyzer: ProfileAnalyzer,
    promptFormatter: PromptFormatter,
    enabled: boolean = false,
  ) {
    this.enabled = enabled;
    
    // Initialize the service if we have a context
    if (externalSourceContext) {
      this.externalSourceService = ExternalSourceService.getInstance({
        externalContext: externalSourceContext,
        profileAnalyzer,
        promptFormatter,
      });
      this.logger.debug('External source manager initialized with service');
    } else {
      this.externalSourceService = null;
      this.logger.debug('External source manager initialized without service');
    }
  }

  /**
   * Check if external sources are enabled
   * @returns Whether external sources are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable external sources
   * @param enabled Whether to enable external sources
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`External sources ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get external results for a query
   * @param query Query to get results for
   * @param relevantNotes Relevant notes for the query
   * @returns External results or null
   */
  async getExternalResults(query: string, relevantNotes: Note[]): Promise<ExternalSourceResult[] | null> {
    // If not enabled or no service, return null
    if (!this.enabled || !this.externalSourceService) {
      this.logger.debug('External sources are disabled or service not initialized');
      return null;
    }
    
    // Check if we should query external sources
    const shouldQueryExternal = this.externalSourceService.shouldQueryExternalSources(query, relevantNotes);
    
    if (shouldQueryExternal) {
      this.logger.info('Querying external sources for additional context');
      try {
        const results = await this.externalSourceService.fetchExternalContext(query);
        
        if (results && results.length > 0) {
          this.logger.info(`Found ${results.length} relevant external sources`);
          return results;
        } else {
          this.logger.debug('No relevant external sources found');
        }
      } catch (error) {
        this.logger.error('Error fetching external context:', error);
      }
    } else {
      this.logger.debug('External sources query not needed based on relevant notes');
    }
    
    return null;
  }
}