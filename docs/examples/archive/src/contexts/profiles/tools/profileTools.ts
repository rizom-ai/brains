/**
 * Profile Tools for MCP
 * 
 * This file contains the tool definitions for the ProfileContext
 * following the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { z } from 'zod';

import type { ResourceDefinition } from '@/contexts/contextInterface';
import type { LinkedInProfile } from '@/models/linkedInProfile';
import type { Profile } from '@/models/profile';
import { Logger } from '@/utils/logger';

/**
 * Interface that defines the required methods for any profile context implementation.
 * This interface is implemented by MCPProfileContext and provides the contract
 * that the tool service expects from a profile context.
 */
export interface ProfileToolContext {
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<boolean>;
  updateProfile(updates: Partial<Profile>): Promise<boolean>;
  migrateLinkedInProfile(linkedInProfile: LinkedInProfile): Promise<boolean>;
}

/**
 * Schema for update profile tool parameters
 */
const UpdateProfileSchema = z.object({
  profile: z.record(z.unknown()).describe('Profile data to update or create'),
});

/**
 * Schema for migrate LinkedIn profile tool parameters
 */
const MigrateLinkedInProfileSchema = z.object({
  linkedInProfile: z.record(z.unknown()).describe('LinkedIn profile data to migrate'),
});

/**
 * Configuration options for ProfileToolService
 */
export interface ProfileToolServiceConfig {
  // Add any configuration options if needed
  /** Optional configuration placeholder */
  placeholder?: never;
}

/**
 * Dependencies for ProfileToolService
 */
export interface ProfileToolServiceDependencies {
  /** Logger instance */
  logger?: Logger;
}

/**
 * Service responsible for providing MCP tools for profiles
 * Follows the Component Interface Standardization pattern
 */
export class ProfileToolService {
  /** The singleton instance */
  private static instance: ProfileToolService | null = null;
  
  /** Logger instance for this class */
  private readonly logger: Logger;
  
  /**
   * Get the singleton instance of ProfileToolService
   * 
   * @param _config Optional configuration (reserved for future use)
   * @returns The shared ProfileToolService instance
   */
  public static getInstance(_config?: ProfileToolServiceConfig): ProfileToolService {
    if (!ProfileToolService.instance) {
      ProfileToolService.instance = new ProfileToolService(_config);
    } else if (_config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    return ProfileToolService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ProfileToolService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param _config Optional configuration (reserved for future use)
   * @returns A new ProfileToolService instance
   */
  public static createFresh(_config?: ProfileToolServiceConfig): ProfileToolService {
    return new ProfileToolService(_config);
  }
  
  /**
   * Create a new profile tool service with explicit dependencies
   * 
   * @param _config Optional configuration (reserved for future use)
   * @param dependencies External dependencies to inject
   * @returns A new ProfileToolService instance
   */
  public static createWithDependencies(
    _config?: ProfileToolServiceConfig,
    dependencies?: Partial<ProfileToolServiceDependencies>,
  ): ProfileToolService {
    return new ProfileToolService(
      _config,
      {
        logger: dependencies?.logger,
      },
    );
  }
  
  /**
   * Private constructor to enforce factory methods
   * 
   * @param _config Optional configuration (reserved for future use)
   * @param dependencies Optional dependencies
   */
  private constructor(
    _config?: ProfileToolServiceConfig,
    dependencies?: ProfileToolServiceDependencies,
  ) {
    this.logger = dependencies?.logger || Logger.getInstance();
    
    this.logger.debug('ProfileToolService initialized', { context: 'ProfileToolService' });
  }
  
  /**
   * Get the MCP tools for the profile context
   * 
   * @param context The profile context
   * @returns Array of MCP tools
   */
  getTools(context: ProfileToolContext): ResourceDefinition[] {
    return [
      // update_profile
      this.updateProfileTool(context),
      
      // migrate_linkedin_profile
      this.migrateLinkedInProfileTool(context),
    ];
  }
  
  /**
   * Create the update profile tool
   * 
   * @param context The profile context
   * @returns The tool definition
   */
  private updateProfileTool(context: ProfileToolContext): ResourceDefinition {
    return {
      protocol: 'profile',
      path: '/profile/update',
      name: 'update-profile',
      description: 'Update or create the user profile',
      inputSchema: UpdateProfileSchema,
      handler: async (params: Record<string, unknown>) => {
        const { profile: profileData } = UpdateProfileSchema.parse(params);
        
        const existingProfile = await context.getProfile();
        let result;
        
        if (existingProfile) {
          await context.updateProfile(profileData as Partial<Profile>);
          result = { success: true, action: 'updated' };
        } else {
          // Add required display name field if it doesn't exist
          const profileWithName = {
            ...profileData,
            displayName: (profileData as Profile).displayName || 'New User',
          };
          const success = await context.saveProfile(profileWithName as Profile);
          result = { success, action: 'created' };
        }
        
        return result;
      },
    };
  }
  
  /**
   * Create the migrate LinkedIn profile tool
   * 
   * @param context The profile context
   * @returns The tool definition
   */
  private migrateLinkedInProfileTool(context: ProfileToolContext): ResourceDefinition {
    return {
      protocol: 'profile',
      path: '/profile/migrate-linkedin',
      name: 'migrate-linkedin-profile',
      description: 'Migrate a LinkedIn profile to the new format',
      inputSchema: MigrateLinkedInProfileSchema,
      handler: async (params: Record<string, unknown>) => {
        const { linkedInProfile } = MigrateLinkedInProfileSchema.parse(params);
        
        const success = await context.migrateLinkedInProfile(linkedInProfile as LinkedInProfile);
        return { success };
      },
    };
  }
}