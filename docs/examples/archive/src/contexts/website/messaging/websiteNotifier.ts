/**
 * Website Context Notifier
 * 
 * This module provides notification capabilities for the WebsiteContext,
 * allowing it to send notifications to other contexts when websites are
 * generated or deployed.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator } from '@/protocol/messaging';
import { MessageFactory, NotificationType } from '@/protocol/messaging';
import { Logger } from '@/utils/logger';

/**
 * Notifier for website-related events
 */
export class WebsiteNotifier {
  private logger = Logger.getInstance();
  
  /**
   * Create a new website notifier
   * 
   * @param mediator Context mediator for sending notifications
   */
  constructor(private mediator: ContextMediator) {}
  
  /**
   * Notify other contexts that a website was generated
   * 
   * @param websiteId The ID of the generated website
   * @param metadata Additional metadata about the website
   */
  async notifyWebsiteGenerated(websiteId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.WEBSITE,
        '*', // Broadcast to all interested contexts
        NotificationType.WEBSITE_GENERATED,
        {
          id: websiteId,
          timestamp: new Date(),
          ...metadata,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Website generated notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received website generated notification');
      }
    } catch (error) {
      this.logger.error('Error sending website generated notification:', error);
    }
  }
  
  /**
   * Notify other contexts that a website was deployed
   * 
   * @param websiteId The ID of the deployed website
   * @param deploymentUrl The URL of the deployed website
   * @param metadata Additional metadata about the deployment
   */
  async notifyWebsiteDeployed(
    websiteId: string, 
    deploymentUrl: string, 
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.WEBSITE,
        '*', // Broadcast to all interested contexts
        NotificationType.WEBSITE_DEPLOYED,
        {
          id: websiteId,
          url: deploymentUrl,
          timestamp: new Date(),
          ...metadata,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Website deployed notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received website deployed notification');
      }
    } catch (error) {
      this.logger.error('Error sending website deployed notification:', error);
    }
  }
}