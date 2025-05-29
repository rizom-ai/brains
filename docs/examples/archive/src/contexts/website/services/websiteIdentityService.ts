/**
 * WebsiteIdentityService
 * 
 * Service for managing website identity information which is used
 * to maintain consistent branding and content across the website.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { Profile } from '@/models/profile';
import { BrainProtocol } from '@/protocol/brainProtocol';
import { ContextId } from '@/protocol/core/contextOrchestrator';
import { requestContextData } from '@/protocol/messaging/contextIntegration';
import type { ContextMediator } from '@/protocol/messaging/contextMediator';
import { DataRequestType } from '@/protocol/messaging/messageTypes';
import { Logger } from '@/utils/logger';

import { WebsiteIdentityNoteAdapter } from '../adapters/websiteIdentityNoteAdapter';
import {
  type WebsiteIdentityData,
  WebsiteIdentitySchema,
} from '../schemas/websiteIdentitySchema';

// Import prompt template
import websiteIdentityPrompt from './prompts/identity/website-identity.txt';

/**
 * Configuration options for WebsiteIdentityService
 */
export interface WebsiteIdentityServiceConfig {
  /** Custom configuration properties */
  [key: string]: unknown;
}

/**
 * Dependencies for WebsiteIdentityService
 */
export interface WebsiteIdentityServiceDependencies {
  /** Context mediator for messaging */
  mediator: ContextMediator;
  /** Identity adapter for storage */
  identityAdapter: WebsiteIdentityNoteAdapter;
  /** Brain protocol for AI operations */
  brainProtocol?: BrainProtocol;
}

/**
 * Error class for identity generation failures
 */
export class IdentityGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityGenerationError';
  }
}

/**
 * Service for managing website identity information
 */
export class WebsiteIdentityService {
  /** The singleton instance */
  private static instance: WebsiteIdentityService | null = null;

  /** Logger instance */
  private readonly logger = Logger.getInstance();

  /** Dependencies */
  private readonly mediator: ContextMediator;
  private readonly identityAdapter: WebsiteIdentityNoteAdapter;
  private brainProtocol: BrainProtocol | null = null;

  /**
   * Create a new WebsiteIdentityService
   * @param config Configuration options
   * @param dependencies Service dependencies
   */
  constructor(
    _config: WebsiteIdentityServiceConfig = {},
    dependencies: WebsiteIdentityServiceDependencies,
  ) {
    this.mediator = dependencies.mediator;
    this.identityAdapter = dependencies.identityAdapter;
    this.brainProtocol = dependencies.brainProtocol || null;

    this.logger.debug('WebsiteIdentityService initialized', {
      context: 'WebsiteIdentityService',
    });
  }

  /**
   * Get the singleton instance of WebsiteIdentityService
   * @param config Configuration options
   * @param dependencies Optional dependencies (will use defaults if not provided)
   */
  public static getInstance(
    config: WebsiteIdentityServiceConfig = {},
    dependencies?: Partial<WebsiteIdentityServiceDependencies>,
  ): WebsiteIdentityService {
    if (!WebsiteIdentityService.instance) {
      // We cannot create a default mediator - it must be provided
      if (!dependencies?.mediator) {
        throw new Error('ContextMediator is required for WebsiteIdentityService');
      }

      // Create default dependencies if needed
      const defaultDependencies: WebsiteIdentityServiceDependencies = {
        mediator: dependencies.mediator,
        identityAdapter: WebsiteIdentityNoteAdapter.getInstance(),
      };

      // Merge with provided dependencies
      const mergedDependencies = {
        ...defaultDependencies,
        ...dependencies,
      };

      WebsiteIdentityService.instance = new WebsiteIdentityService(config, mergedDependencies);
    }

    return WebsiteIdentityService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    WebsiteIdentityService.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * @param config Configuration options
   * @param dependencies Service dependencies
   */
  public static createFresh(
    config: WebsiteIdentityServiceConfig = {},
    dependencies?: Partial<WebsiteIdentityServiceDependencies>,
  ): WebsiteIdentityService {
    // We cannot create a default mediator - it must be provided
    if (!dependencies?.mediator) {
      throw new Error('ContextMediator is required for WebsiteIdentityService');
    }

    // Create default dependencies if needed
    const defaultDependencies: WebsiteIdentityServiceDependencies = {
      mediator: dependencies.mediator,
      identityAdapter: WebsiteIdentityNoteAdapter.getInstance(),
    };

    // Merge with provided dependencies
    const mergedDependencies = {
      ...defaultDependencies,
      ...dependencies,
    };

    return new WebsiteIdentityService(config, mergedDependencies);
  }

  /**
   * Get current identity data or generate if not exists
   * @param forceRegenerate Whether to force regeneration of identity data
   * @throws IdentityGenerationError if generation fails
   */
  async getIdentity(forceRegenerate = false): Promise<WebsiteIdentityData> {
    try {
      // If not forcing regeneration, try to get existing identity data
      if (!forceRegenerate) {
        const existingIdentity = await this.identityAdapter.getIdentityData();
        if (existingIdentity) {
          this.logger.debug('Retrieved existing identity data', {
            context: 'WebsiteIdentityService',
          });
          return existingIdentity;
        }
      }

      // No existing identity or forcing regeneration, generate new identity
      this.logger.info('Generating new website identity', {
        context: 'WebsiteIdentityService',
        forceRegenerate,
      });

      return await this.generateIdentity();
    } catch (error) {
      this.logger.error('Error getting identity', {
        error: error instanceof Error ? error.message : String(error),
        context: 'WebsiteIdentityService',
      });
      throw new IdentityGenerationError(
        `Failed to get or generate identity: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get profile data for identity generation using messaging
   * @returns Profile data
   * @throws Error if profile data cannot be retrieved
   */
  private async getProfileData(): Promise<Profile> {
    try {
      // Use the requestContextData helper for better type safety
      const profileData = await requestContextData<Profile>(
        this.mediator,
        ContextId.WEBSITE,
        ContextId.PROFILE,
        DataRequestType.PROFILE_DATA,
      );

      if (!profileData) {
        throw new Error('No profile data received from Profile context');
      }

      return profileData;
    } catch (error) {
      this.logger.error('Error retrieving profile data', {
        error,
        context: 'WebsiteIdentityService',
      });
      throw error;
    }
  }

  /**
   * Generate a complete website identity using BrainProtocol
   * @returns The generated identity data
   * @throws IdentityGenerationError if generation fails at any step
   */
  async generateIdentity(): Promise<WebsiteIdentityData> {
    try {
      // Get profile data using messaging
      const profile = await this.getProfileData();

      // Generate complete identity data using BrainProtocol
      // Format the prompt with profile data
      const prompt = websiteIdentityPrompt
        .replace('{{name}}', profile.displayName || '')
        .replace('{{occupation}}', profile.headline ? `, ${profile.headline}` : '')
        .replace('{{company}}', profile.experiences?.[0]?.organization ? ` from ${profile.experiences[0].organization}` : '');
        
      // Process the query with BrainProtocol
      const result = await this.getBrainProtocol().processQuery(prompt, {
        userId: 'system',
        userName: 'System',
        schema: WebsiteIdentitySchema,
      });

      if (!result.object) {
        throw new IdentityGenerationError('BrainProtocol failed to generate valid identity data');
      }

      // Validation is handled by the schema in processQuery
      const identityData = result.object;

      // Save to storage
      await this.identityAdapter.saveIdentityData(identityData);

      this.logger.info('Successfully generated and saved identity data', {
        context: 'WebsiteIdentityService',
      });

      return identityData;
    } catch (error) {
      this.logger.error('Failed to generate identity', {
        error: error instanceof Error ? error.message : String(error),
        context: 'WebsiteIdentityService',
      });
      throw new IdentityGenerationError(
        `Identity generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get the Brain Protocol instance
   * @throws Error if Brain Protocol is not available
   */
  private getBrainProtocol(): BrainProtocol {
    if (!this.brainProtocol) {
      this.brainProtocol = BrainProtocol.getInstance();
    }
    
    if (!this.brainProtocol) {
      throw new Error('BrainProtocol is not available');
    }
    
    return this.brainProtocol;
  }

  /**
   * Set the Brain Protocol instance (mainly for testing)
   * @param protocol The brain protocol to use
   */
  setBrainProtocol(protocol: BrainProtocol): void {
    this.brainProtocol = protocol;
  }
}