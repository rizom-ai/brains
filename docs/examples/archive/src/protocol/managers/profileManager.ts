/**
 * Profile Manager for BrainProtocol
 * Manages profile information and relevance analysis
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import { relevanceConfig } from '@/config';
import type { MCPProfileContext } from '@/contexts';
import type { Profile } from '@/models/profile';
import { ProfileAnalyzer } from '@/protocol/components/profileAnalyzer';
import { EmbeddingService } from '@/resources/ai/embedding';
import { Logger } from '@/utils/logger';
import { isDefined } from '@/utils/safeAccessUtils';

import type { IProfileManager, ProfileAnalysisResult } from '../types';

/**
 * Configuration options for ProfileManager
 */
export interface ProfileManagerConfig {
  /** Profile context instance */
  profileContext: MCPProfileContext;
  /** API key for embedding service */
  apiKey?: string;
}

/**
 * Manages profile information and relevance
 */
export class ProfileManager implements IProfileManager {
  /**
   * Singleton instance of ProfileManager
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ProfileManager | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  private profileContext: MCPProfileContext;
  private profileAnalyzer: ProfileAnalyzer;
  private profile: Profile | undefined;

  /**
   * Get the singleton instance of ProfileManager
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param config Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(config: ProfileManagerConfig): ProfileManager {
    if (!ProfileManager.instance) {
      ProfileManager.instance = new ProfileManager(config);
      
      const logger = Logger.getInstance();
      logger.debug('ProfileManager singleton instance created');
    } else if (config && Object.keys(config).length > 0) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return ProfileManager.instance;
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
      if (ProfileManager.instance) {
        // Any cleanup needed would go here
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during ProfileManager instance reset:', error);
    } finally {
      ProfileManager.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('ProfileManager singleton instance reset');
    }
  }

  /**
   * Create a fresh ProfileManager instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param config Configuration options
   * @returns A new ProfileManager instance
   */
  public static createFresh(config: ProfileManagerConfig): ProfileManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ProfileManager instance');
    
    return new ProfileManager(config);
  }

  /**
   * Create a new profile manager
   * 
   * Note: When not testing, prefer using getInstance() or createFresh() factory methods
   * 
   * @param config Configuration options containing profile context and optional API key
   */
  public constructor(config: ProfileManagerConfig) {
    this.profileContext = config.profileContext;
    
    // Initialize the profile analyzer using Component Interface Standardization pattern
    const embeddingService = EmbeddingService.getInstance();
    this.profileAnalyzer = ProfileAnalyzer.getInstance({
      embeddingService,
    });
    
    // Load profile asynchronously
    this.loadProfile();
    
    this.logger.debug('Profile manager initialized');
  }

  /**
   * Load the user profile
   */
  private async loadProfile(): Promise<void> {
    try {
      const profileResult = await this.profileContext.getProfile();

      if (isDefined(profileResult)) {
        // Set profile only if we got a valid result
        this.profile = profileResult;
        this.logger.info('Profile loaded successfully');
      } else {
        this.logger.info('No profile found');
      }
    } catch (error) {
      this.logger.error('Error loading profile:', error);
      // Explicitly set profile to undefined in case of error
      this.profile = undefined;
    }
  }

  /**
   * Get the user profile
   * @returns The user profile or undefined
   */
  async getProfile(): Promise<Profile | undefined> {
    // If profile is not loaded yet, try loading it
    if (!isDefined(this.profile)) {
      await this.loadProfile();
    }
    return this.profile;
  }

  /**
   * Get formatted profile text for use in prompts
   * @returns Formatted profile text or null
   */
  async getProfileText(): Promise<string | null> {
    const profile = await this.getProfile();
    if (!profile) {
      return null;
    }
    
    // Get profile content from the profile note
    const noteData = await this.profileContext.getProfileAsNote();
    return noteData?.content || null;
  }

  /**
   * Analyze profile relevance for a query
   * @param query Query to analyze
   * @returns Analysis result with relevance score
   */
  async analyzeProfileRelevance(query: string): Promise<ProfileAnalysisResult> {
    // First check if this is explicitly a profile query
    const isProfileQuery = this.profileAnalyzer.isProfileQuery(query);
    
    // Initialize with default relevance
    let relevance = isProfileQuery ? 
      relevanceConfig.fallback.highRelevance : 
      relevanceConfig.fallback.lowRelevance;
    
    this.logger.debug(`Initial profile relevance determination: ${isProfileQuery ? 'high' : 'low'}`);
    
    // Get the profile
    const profile = await this.getProfile();
    
    // Get profile note to retrieve the embedding
    if (isDefined(profile)) {
      try {
        // Get the profile note to access its embedding
        const profileNote = await this.profileContext.getProfileAsNote();
        
        if (profileNote && profileNote.embedding) {
          relevance = await this.profileAnalyzer.getProfileRelevance(query, profileNote.embedding);
          this.logger.debug(`Profile semantic relevance: ${relevance.toFixed(2)}`);
          
          // If relevance is high enough, consider it a profile query
          if (relevance > relevanceConfig.profileQueryThreshold && !isProfileQuery) {
            this.logger.info(`Query is semantically relevant to profile (score: ${relevance.toFixed(2)})`);
            // Update isProfileQuery based on relevance
            return { isProfileQuery: true, relevance };
          }
        } else {
          this.logger.debug('Profile note not found or no embedding available');
        }
      } catch (error) {
        this.logger.error('Error calculating profile relevance:', error);
        // Fall back to initial determination
      }
    } else {
      this.logger.debug('No profile available for semantic relevance calculation');
    }
    
    return { isProfileQuery, relevance };
  }
  
  /**
   * Get the ProfileAnalyzer instance
   * This allows direct access to the analyzer for specialized components
   * @returns The ProfileAnalyzer instance
   */
  getProfileAnalyzer(): ProfileAnalyzer {
    return this.profileAnalyzer;
  }
  
  /**
   * Get the ProfileContext instance
   * @returns The ProfileContext instance
   */
  getProfileContext(): MCPProfileContext {
    return this.profileContext;
  }
}