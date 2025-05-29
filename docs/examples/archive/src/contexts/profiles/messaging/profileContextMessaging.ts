/**
 * Profile Context Messaging
 * 
 * This module integrates ProfileContext with the messaging system,
 * wrapping the original context and adding notification capabilities.
 */

import type { MCPProfileContext } from '@/contexts/profiles';
import type { LinkedInProfile } from '@/models/linkedInProfile';
import type { Note } from '@/models/note';
import type { Profile } from '@/models/profile';
import type { ContextMediator } from '@/protocol/messaging/contextMediator';
import { Logger } from '@/utils/logger';

import { ProfileMessageHandler } from './profileMessageHandler';
import { ProfileNotifier } from './profileNotifier';

/**
 * Messaging wrapper for ProfileContext
 * Delegates operations to the original context and adds notification capabilities
 */
export class ProfileContextMessaging {
  /** Original MCP profile context */
  private profileContext: MCPProfileContext;
  
  /** Context mediator for messaging */
  private mediator: ContextMediator;
  
  /** Profile notifier */
  private notifier: ProfileNotifier;
  
  /** Logger instance */
  private logger: Logger;
  
  /**
   * Create a new ProfileContextMessaging instance
   * 
   * @param profileContext Original MCP profile context to wrap
   * @param mediator Context mediator for messaging
   */
  constructor(profileContext: MCPProfileContext, mediator: ContextMediator) {
    this.profileContext = profileContext;
    this.mediator = mediator;
    this.logger = Logger.getInstance();
    
    // Create the notifier
    this.notifier = ProfileNotifier.getInstance(mediator);
    
    // Create and register the message handler
    const handler = ProfileMessageHandler.getInstance(profileContext);
    // Register the handler with the mediator using the profile context ID
    const PROFILE_CONTEXT_ID = 'profile-context';
    mediator.registerHandler(PROFILE_CONTEXT_ID, handler.handleMessage.bind(handler));
    
    this.logger.debug('ProfileContextMessaging initialized', { context: 'ProfileContextMessaging' });
  }
  
  /**
   * Get the wrapped profile context
   * @returns Original profile context
   */
  getContext(): MCPProfileContext {
    return this.profileContext;
  }
  
  /**
   * Get the user profile
   * @returns User profile or null
   */
  async getProfile(): Promise<Profile | null> {
    return this.profileContext.getProfile();
  }
  
  /**
   * Save the user profile
   * Notifies other contexts about the profile change
   * 
   * @param profile Profile to save
   * @returns Success status
   */
  async saveProfile(profile: Profile): Promise<boolean> {
    try {
      const success = await this.profileContext.saveProfile(profile);
      
      if (success) {
        // Notify about profile creation/update
        await this.notifier.notifyProfileUpdated(profile);
      }
      
      return success;
    } catch (error) {
      this.logger.error('Error in saveProfile with messaging', { error, context: 'ProfileContextMessaging' });
      return false;
    }
  }
  
  /**
   * Update the user profile
   * Notifies other contexts about the profile change
   * 
   * @param data Partial profile data to update
   * @returns Success status
   */
  async updateProfile(data: Partial<Profile>): Promise<boolean> {
    try {
      const success = await this.profileContext.updateProfile(data);
      
      if (success) {
        // Get the updated profile to include in notification
        const updatedProfile = await this.profileContext.getProfile();
        if (updatedProfile) {
          await this.notifier.notifyProfileUpdated(updatedProfile);
        }
      }
      
      return success;
    } catch (error) {
      this.logger.error('Error in updateProfile with messaging', { error, context: 'ProfileContextMessaging' });
      return false;
    }
  }
  
  /**
   * Send data to another context through the mediator
   * @param targetContext The target context ID
   * @param requestType The type of request
   * @param data The data to send
   * @returns The response from the target context
   */
  async sendRequest(targetContext: string, requestType: string, data?: Record<string, unknown>): Promise<unknown> {
    // Use the profile context ID
    const PROFILE_CONTEXT_ID = 'profile-context';
    return this.mediator.sendRequest(this.mediator.createDataRequest(
      PROFILE_CONTEXT_ID,
      targetContext,
      requestType,
      data || {},
    ));
  }
  
  /**
   * Get profile as a note (for interoperability)
   * @returns Profile as note or null
   */
  async getProfileAsNote(): Promise<Note | null> {
    return this.profileContext.getProfileAsNote();
  }
  
  
  /**
   * Migrate a LinkedIn profile to our new format
   * Notifies other contexts about the profile change
   * 
   * @param linkedInProfile LinkedIn profile to migrate
   * @returns Success status
   */
  async migrateLinkedInProfile(linkedInProfile: LinkedInProfile): Promise<boolean> {
    try {
      const success = await this.profileContext.migrateLinkedInProfile(linkedInProfile);
      
      if (success) {
        // Get the migrated profile to include in notification
        const migratedProfile = await this.profileContext.getProfile();
        if (migratedProfile) {
          await this.notifier.notifyProfileUpdated(migratedProfile);
        }
      }
      
      return success;
    } catch (error) {
      this.logger.error('Error in migrateLinkedInProfile with messaging', { error, context: 'ProfileContextMessaging' });
      return false;
    }
  }
  
  /**
   * For backward compatibility with old code
   * @returns Active profile or null
   */
  async getActiveProfile(): Promise<Profile | null> {
    return this.profileContext.getActiveProfile();
  }
}