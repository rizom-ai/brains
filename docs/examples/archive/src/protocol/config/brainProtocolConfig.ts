/**
 * Configuration management for BrainProtocol
 */
import { aiConfig, conversationConfig } from '@/config';
import { ValidationError } from '@/utils/errorUtils';
import logger from '@/utils/logger';
import { isNonEmptyString } from '@/utils/safeAccessUtils';

import type { BrainProtocolOptions } from '../types';

/**
 * Manages configuration for the BrainProtocol system
 */
export class BrainProtocolConfig {
  /** Interface type (CLI or Matrix) */
  readonly interfaceType: 'cli' | 'matrix';
  
  /** Whether to use external knowledge sources */
  readonly useExternalSources: boolean;
  
  /** Room ID for the conversation */
  readonly roomId?: string;
  
  /** API key for AI services */
  readonly apiKey?: string;
  
  /** API key for news services */
  readonly newsApiKey?: string;
  
  /** 
   * Memory storage for conversations (backward compatibility)
   */
  readonly memoryStorage?: unknown;

  /** Anchor name for conversation context */
  readonly anchorName?: string;

  /** Anchor ID for conversation context */
  readonly anchorId?: string;
  
  /** Default user name for conversations */
  readonly defaultUserName?: string;

  /** Version of the protocol */
  readonly version: string = '1.0.0';

  /** Name of the protocol */
  readonly name: string = 'BrainProtocol';

  /**
   * Create a new configuration object from options
   * @param options Options object containing configuration parameters
   */
  constructor(options: BrainProtocolOptions = {}) {
    // Extract values with defaults
    this.apiKey = options.apiKey;
    this.newsApiKey = options.newsApiKey;
    this.useExternalSources = options.useExternalSources ?? false;
    
    // Set interface type (default to CLI if not specified)
    this.interfaceType = options.interfaceType || 'cli';
    
    // Set room ID with default if not provided
    this.roomId = options.roomId || 
      (this.interfaceType === 'cli' ? conversationConfig.defaultCliRoomId : undefined);
    
    // Set conversation context properties
    this.anchorName = options.anchorName;
    this.anchorId = options.anchorId;
    this.memoryStorage = options.memoryStorage;

    // Validate the configuration
    this.validate();

    // Log configuration
    logger.debug(`BrainProtocol configured with interface type: ${this.interfaceType}`);
    logger.debug(`External sources: ${this.useExternalSources ? 'enabled' : 'disabled'}`);
    logger.debug(`Room ID: ${this.roomId || 'not set'}`);
  }

  /**
   * Validate the configuration
   * @throws ValidationError if the configuration is invalid
   */
  validate(): void {
    // Room ID is required for CLI interface
    if (this.interfaceType === 'cli' && !isNonEmptyString(this.roomId)) {
      throw new ValidationError(
        'BrainProtocol configuration is invalid: Room ID is required for CLI interface',
        { interfaceType: this.interfaceType, roomId: this.roomId },
      );
    }

    // Room ID is now recommended for Matrix interface
    if (this.interfaceType === 'matrix' && !isNonEmptyString(this.roomId)) {
      logger.warn('No room ID provided for Matrix interface, conversation tracking may be limited');
    }

    // API keys are not strictly required, as they may be provided by environment variables
    if (!this.hasAnthropicApiKey() && !this.hasOpenAIApiKey()) {
      logger.warn('No API keys provided, relying on environment variables');
    }

    // External sources require a news API key
    if (this.useExternalSources && !isNonEmptyString(this.newsApiKey)) {
      logger.warn('External sources are enabled, but no news API key was provided');
    }
  }

  /**
   * Get the API key, falling back to environment variables
   * @returns The API key to use for AI services
   */
  getApiKey(): string {
    return this.apiKey || aiConfig.anthropic.apiKey || aiConfig.openAI.apiKey || '';
  }

  /**
   * Check if an Anthropic API key is available
   * @returns Whether an Anthropic API key is available
   */
  hasAnthropicApiKey(): boolean {
    return Boolean(this.apiKey || aiConfig.anthropic.apiKey);
  }

  /**
   * Check if an OpenAI API key is available
   * @returns Whether an OpenAI API key is available
   */
  hasOpenAIApiKey(): boolean {
    return Boolean(this.apiKey || aiConfig.openAI.apiKey);
  }

  /**
   * Get default room ID for the current interface type
   * @returns The default room ID
   */
  getDefaultRoomId(): string {
    // For now, we only have a CLI default room ID
    // Matrix should always provide a room ID
    return conversationConfig.defaultCliRoomId;
  }

  /**
   * Get MCP server configuration parameters
   * @returns Configuration object for the MCP server
   */
  getMcpServerConfig(): {
    apiKey: string;
    newsApiKey?: string;
    name: string;
    version: string;
    enableExternalSources: boolean;
    } {
    return {
      apiKey: this.getApiKey(),
      newsApiKey: this.newsApiKey,
      name: this.name,
      version: this.version,
      enableExternalSources: this.useExternalSources,
    };
  }
}