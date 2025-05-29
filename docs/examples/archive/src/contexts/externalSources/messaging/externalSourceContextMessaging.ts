/**
 * Messaging-Enabled External Source Context
 * 
 * This module extends the MCPExternalSourceContext with messaging capabilities,
 * allowing it to participate in cross-context communication.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator, DataRequestMessage, NotificationMessage } from '@/protocol/messaging';
import { MessageFactory } from '@/protocol/messaging';
import { Logger } from '@/utils/logger';

import type { MCPExternalSourceContext } from '../MCPExternalSourceContext';
import type { ExternalSourceInterface, ExternalSourceResult } from '../sources';

import { ExternalSourceMessageHandler } from './externalSourceMessageHandler';
import { ExternalSourceNotifier } from './externalSourceNotifier';

/**
 * Messaging-enabled extension of MCPExternalSourceContext
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class MCPExternalSourceContextMessaging {
  /**
   * Singleton instance of MCPExternalSourceContextMessaging
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: MCPExternalSourceContextMessaging | null = null;
  
  /**
   * Get the singleton instance of MCPExternalSourceContextMessaging
   * 
   * @param externalSourceContext The external source context to extend
   * @param mediator The context mediator for messaging
   * @returns The shared MCPExternalSourceContextMessaging instance
   */
  public static getInstance(
    externalSourceContext: MCPExternalSourceContext,
    mediator: ContextMediator,
  ): MCPExternalSourceContextMessaging {
    if (!MCPExternalSourceContextMessaging.instance) {
      MCPExternalSourceContextMessaging.instance = new MCPExternalSourceContextMessaging(
        externalSourceContext,
        mediator,
      );
      
      const logger = Logger.getInstance();
      logger.debug('MCPExternalSourceContextMessaging singleton instance created');
    }
    
    return MCPExternalSourceContextMessaging.instance;
  }
  
  /**
   * Reset the singleton instance
   */
  public static resetInstance(): void {
    MCPExternalSourceContextMessaging.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('MCPExternalSourceContextMessaging singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param externalSourceContext The external source context to extend
   * @param mediator The context mediator for messaging
   * @returns A new MCPExternalSourceContextMessaging instance
   */
  public static createFresh(
    externalSourceContext: MCPExternalSourceContext,
    mediator: ContextMediator,
  ): MCPExternalSourceContextMessaging {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh MCPExternalSourceContextMessaging instance');
    
    return new MCPExternalSourceContextMessaging(externalSourceContext, mediator);
  }
  
  private logger = Logger.getInstance();
  private notifier: ExternalSourceNotifier;
  
  /**
   * Create a messaging-enabled wrapper for an MCPExternalSourceContext
   * 
   * @param externalSourceContext The external source context to extend
   * @param mediator The context mediator for messaging
   */
  /**
   * Create with dependencies constructor
   *
   * @param configOrDependencies Configuration or explicit dependencies
   * @returns A new MCPExternalSourceContextMessaging instance
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): MCPExternalSourceContextMessaging {
    const logger = Logger.getInstance();
    logger.debug('Creating MCPExternalSourceContextMessaging with dependencies');
    
    // Handle case where dependencies are explicitly provided
    if ('externalSourceContext' in configOrDependencies && 'mediator' in configOrDependencies) {
      const externalSourceContext = configOrDependencies['externalSourceContext'] as MCPExternalSourceContext;
      const mediator = configOrDependencies['mediator'] as ContextMediator;
      
      return new MCPExternalSourceContextMessaging(externalSourceContext, mediator);
    }
    
    // Cannot create without required dependencies
    throw new Error('MCPExternalSourceContextMessaging requires externalSourceContext and mediator dependencies');
  }

  /**
   * Private constructor to enforce using factory methods
   *
   * @param externalSourceContext The external source context to extend
   * @param mediator The context mediator for messaging
   */
  private constructor(
    private externalSourceContext: MCPExternalSourceContext,
    mediator: ContextMediator,
  ) {
    // Create notifier using the standardized pattern
    this.notifier = ExternalSourceNotifier.getInstance(mediator);
    
    // Register message handler using the Component Interface Standardization pattern
    // Create the handler using the singleton approach for consistency
    const handler = ExternalSourceMessageHandler.getInstance(externalSourceContext);
    mediator.registerHandler(ContextId.EXTERNAL_SOURCES, async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        return handler.handleRequest(message as DataRequestMessage);
      } else if (message.category === 'notification' && 'notificationType' in message) {
        await handler.handleNotification(message as NotificationMessage);
        
        // Return acknowledgment for notifications
        return MessageFactory.createAcknowledgment(
          ContextId.EXTERNAL_SOURCES,
          message.sourceContext || '*',
          message.id || 'unknown',
          'processed',
        );
      }
      
      // Default return value for unrecognized message format
      return MessageFactory.createErrorResponse(
        ContextId.EXTERNAL_SOURCES,
        message.sourceContext || '*',
        message.id || 'unknown',
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    });
    
    this.logger.debug('MCPExternalSourceContextMessaging initialized');
  }
  
  /**
   * Get the underlying external source context
   * @returns The external source context
   */
  getContext(): MCPExternalSourceContext {
    return this.externalSourceContext;
  }
  
  /**
   * Delegate methods to the original context
   */
  
  /**
   * Check if the external source service is enabled
   * This is an adapter method implemented at the messaging layer
   * @returns True if at least one external source is enabled
   */
  isEnabled(): boolean {
    // If we have any enabled sources, the service is considered enabled
    return this.externalSourceContext.getEnabledSources().length > 0;
  }
  
  /**
   * Enable or disable the external source service
   * This is an adapter method implemented at the messaging layer
   * @param enabled Whether the service should be enabled
   */
  setEnabled(_enabled: boolean): void {
    // This is a no-op since enabling/disabling is handled at the source level
    // through the storage adapter by adding/removing sources from the enabled list
    this.logger.debug('setEnabled called - no-op at messaging layer');
  }
  
  /**
   * Get a source by name
   * This is an adapter method implemented at the messaging layer
   * @param name Name of the source to retrieve
   * @returns The source if found, or null if not found
   */
  getSourceByName(name: string): ExternalSourceInterface | null {
    // Find the source by name in the enabled sources
    const sources = this.externalSourceContext.getEnabledSources();
    const source = sources.find(s => s.name === name);
    
    // The enabled sources don't provide the full ExternalSourceInterface implementation
    // Return null since we can't provide the full interface
    if (source) {
      Logger.getInstance().warn(`Source ${name} found but doesn't implement ExternalSourceInterface`);
    }
    return null;
  }
  
  // addSource method removed - external sources must be configured on initialization
  
  /**
   * Remove a source by name
   * This is an adapter method implemented at the messaging layer
   * @param name Name of the source to remove
   * @returns True if the source was removed, false otherwise
   */
  removeSource(_name: string): boolean {
    // External sources cannot be removed at runtime, only disabled
    // This would require updating the storage adapter's configuration
    this.logger.warn('removeSource called - not supported at runtime');
    return false;
  }
  
  /**
   * Get names of all available sources
   * This is an adapter method implemented at the messaging layer
   * @returns Array of source names
   */
  getAvailableSources(): string[] {
    // Map the enabled sources to their names
    const sources = this.externalSourceContext.getEnabledSources();
    return sources.map(source => source.name);
  }
  
  /**
   * Search external sources for information
   * Delegates to the underlying context's search method and sends notification
   * @param query The search query
   * @returns Promise that resolves to an array of results
   */
  async searchExternalSources(query: string): Promise<ExternalSourceResult[]> {
    // Delegate to the search method, which is actually available
    const results = await this.externalSourceContext.search(query);
    
    // Notify other contexts about the search
    await this.notifier.notifyExternalSourceSearched(query, results);
    
    return results;
  }
  
  /**
   * Check availability of all sources
   * Delegates to the underlying context's checkSourcesAvailability method
   * and sends notification
   * @returns Record mapping source names to availability status
   */
  async checkSourcesAvailability(): Promise<Record<string, boolean>> {
    const availability = await this.externalSourceContext.checkSourcesAvailability();
    
    // Notify other contexts about source availability changes
    await this.notifier.notifySourceAvailabilityChanged(availability);
    
    return availability;
  }
  
  /**
   * Perform semantic search on external sources
   * Delegates to the underlying context's semanticSearch method
   * and sends notification
   * @param query The search query
   * @param limit Maximum number of results to return
   * @returns Promise that resolves to an array of semantically relevant results
   */
  async semanticSearch(query: string, limit?: number): Promise<ExternalSourceResult[]> {
    const results = await this.externalSourceContext.semanticSearch(query, limit);
    
    // Notify other contexts about the search
    await this.notifier.notifyExternalSourceSearched(query, results);
    
    return results;
  }
}