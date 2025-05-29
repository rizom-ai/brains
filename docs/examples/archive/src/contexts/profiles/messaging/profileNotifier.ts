/**
 * Profile Notifier
 * 
 * Sends notifications about profile events to other contexts.
 */

import type { Profile } from '@/models/profile';
import type { ContextMediator } from '@/protocol/messaging/contextMediator';
import { MessageFactory } from '@/protocol/messaging/messageFactory';
import { NotificationType } from '@/protocol/messaging/messageTypes';
import { Logger } from '@/utils/logger';

/**
 * Options for ProfileNotifier
 */
export interface ProfileNotifierOptions {
  mediator?: ContextMediator;
}

/**
 * Sends notifications about profile events
 */
export class ProfileNotifier {
  private static instance: ProfileNotifier | null = null;
  
  /** Context mediator */
  private mediator: ContextMediator;
  
  /** Logger instance */
  private logger: Logger;
  
  /**
   * Private constructor to enforce getInstance() usage
   */
  private constructor(mediator: ContextMediator) {
    this.mediator = mediator;
    this.logger = Logger.getInstance();
    
    this.logger.debug('ProfileNotifier initialized', { context: 'ProfileNotifier' });
  }
  
  /**
   * Get the singleton instance
   * 
   * @param mediator Context mediator
   * @returns The singleton instance
   */
  public static getInstance(mediator: ContextMediator): ProfileNotifier {
    if (!ProfileNotifier.instance) {
      ProfileNotifier.instance = new ProfileNotifier(mediator);
    }
    return ProfileNotifier.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    ProfileNotifier.instance = null;
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: ProfileNotifierOptions): ProfileNotifier {
    if (!options.mediator) {
      throw new Error('Context mediator is required');
    }
    
    return new ProfileNotifier(options.mediator);
  }
  
  /**
   * Notify other contexts about a profile update
   * 
   * @param profile Updated profile
   * @returns Notification success status
   */
  public async notifyProfileUpdated(profile: Profile): Promise<boolean> {
    try {
      this.logger.debug('Sending profile updated notification', { context: 'ProfileNotifier' });
      
      // Use a constant for the context ID
      const PROFILE_CONTEXT_ID = 'profile-context';
      const message = MessageFactory.createNotification(
        PROFILE_CONTEXT_ID,
        PROFILE_CONTEXT_ID, // Used as targetContext for broadcast
        NotificationType.PROFILE_UPDATED,
        { profile },
      );
      
      await this.mediator.sendNotification(message);
      return true;
    } catch (error) {
      this.logger.error('Error sending profile updated notification', { error, context: 'ProfileNotifier' });
      return false;
    }
  }
  
  /**
   * Notify other contexts about a profile creation
   * 
   * @param profile Created profile
   * @returns Notification success status
   */
  public async notifyProfileCreated(profile: Profile): Promise<boolean> {
    try {
      this.logger.debug('Sending profile created notification', { context: 'ProfileNotifier' });
      
      // Use a constant for the context ID
      const PROFILE_CONTEXT_ID = 'profile-context';
      const message = MessageFactory.createNotification(
        PROFILE_CONTEXT_ID,
        PROFILE_CONTEXT_ID, // Used as targetContext for broadcast
        NotificationType.PROFILE_UPDATED,
        { profile },
      );
      
      await this.mediator.sendNotification(message);
      return true;
    } catch (error) {
      this.logger.error('Error sending profile created notification', { error, context: 'ProfileNotifier' });
      return false;
    }
  }
}