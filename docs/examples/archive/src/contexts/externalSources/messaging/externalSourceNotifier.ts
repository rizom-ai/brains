/**
 * External Source Context Notifier
 * 
 * This module provides notification capabilities for the ExternalSourceContext,
 * allowing it to send notifications to other contexts when external source
 * operations occur.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates an instance with explicit dependencies
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator } from '@/protocol/messaging';
import { MessageFactory, NotificationType } from '@/protocol/messaging';
import { Logger } from '@/utils/logger';

import type { ExternalSourceResult } from '../sources';

/**
 * Notifier for external source-related events
 */
export class ExternalSourceNotifier {
  /**
   * Singleton instance of ExternalSourceNotifier
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ExternalSourceNotifier | null = null;
  
  /**
   * Get the singleton instance of the notifier
   * 
   * @param mediator The context mediator for sending notifications
   * @returns The shared ExternalSourceNotifier instance
   */
  public static getInstance(mediator?: ContextMediator): ExternalSourceNotifier {
    if (!ExternalSourceNotifier.instance && mediator) {
      ExternalSourceNotifier.instance = new ExternalSourceNotifier(mediator);
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceNotifier singleton instance created');
    } else if (!ExternalSourceNotifier.instance) {
      throw new Error('ExternalSourceNotifier.getInstance() called without required mediator');
    } else if (mediator) {
      // Log a warning if trying to get instance with different mediator
      const logger = Logger.getInstance();
      logger.warn('getInstance called with mediator but instance already exists. Mediator ignored.');
    }
    
    return ExternalSourceNotifier.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    ExternalSourceNotifier.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ExternalSourceNotifier singleton instance reset');
  }
  
  /**
   * Create a fresh notifier instance
   * 
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param mediator The context mediator for sending notifications
   * @returns A new ExternalSourceNotifier instance
   */
  public static createFresh(mediator: ContextMediator): ExternalSourceNotifier {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ExternalSourceNotifier instance');
    
    return new ExternalSourceNotifier(mediator);
  }
  
  /**
   * Create a new instance with explicit dependencies
   * 
   * Uses the configOrDependencies pattern for flexible dependency injection.
   * 
   * @param configOrDependencies Configuration or explicit dependencies
   * @returns A new ExternalSourceNotifier instance with the provided dependencies
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): ExternalSourceNotifier {
    const logger = Logger.getInstance();
    logger.debug('Creating ExternalSourceNotifier with dependencies');
    
    // Handle the case where dependencies are explicitly provided
    if ('mediator' in configOrDependencies) {
      const mediator = configOrDependencies['mediator'] as ContextMediator;
      return new ExternalSourceNotifier(mediator);
    }
    
    // Cannot create without a mediator
    throw new Error('ExternalSourceNotifier requires a mediator dependency');
  }
  
  private logger = Logger.getInstance();
  
  /**
   * Private constructor to enforce using factory methods
   * 
   * @param mediator Context mediator for sending notifications
   */
  private constructor(private mediator: ContextMediator) {}
  
  /**
   * Notify other contexts that external sources were searched
   * 
   * @param query The search query
   * @param results The search results
   */
  async notifyExternalSourceSearched(
    query: string, 
    results: ExternalSourceResult[],
  ): Promise<void> {
    try {
      // Only send if we have results to avoid unnecessary notifications
      if (results.length === 0) {
        this.logger.debug('No external search results to notify about');
        return;
      }
      
      const notification = MessageFactory.createNotification(
        ContextId.EXTERNAL_SOURCES,
        '*', // Broadcast to all interested contexts
        NotificationType.EXTERNAL_SOURCES_SEARCH, // Use specific notification type for search
        {
          action: 'search_completed',
          query,
          resultCount: results.length,
          sources: [...new Set(results.map(r => r.sourceType))],
          // Don't include full results to keep notification size reasonable
          topResults: results.slice(0, 3).map(r => ({
            title: r.title,
            source: r.source,
            sourceType: r.sourceType,
            timestamp: r.timestamp,
          })),
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`External search notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received external search notification');
      }
    } catch (error) {
      this.logger.error('Error sending external search notification:', error);
    }
  }
  
  /**
   * Notify other contexts that source availability has changed
   * 
   * @param availability Record mapping source names to availability status
   */
  async notifySourceAvailabilityChanged(
    availability: Record<string, boolean>,
  ): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.EXTERNAL_SOURCES,
        '*', // Broadcast to all interested contexts
        NotificationType.EXTERNAL_SOURCES_AVAILABILITY, // Use specific notification type for availability
        {
          action: 'availability_changed',
          sourceAvailability: availability,
          timestamp: new Date().toISOString(),
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Source availability notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received source availability notification');
      }
    } catch (error) {
      this.logger.error('Error sending source availability notification:', error);
    }
  }
}