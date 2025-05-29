/**
 * Configuration Manager
 * 
 * Centralizes access to configuration settings and feature flags across the system.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { Logger } from '@/utils/logger';

import type { BrainProtocolConfig } from '../config/brainProtocolConfig';

/**
 * Configuration options for ConfigurationManager
 */
export interface ConfigurationManagerOptions {
  /** Configuration for the manager */
  config: BrainProtocolConfig;
}

/**
 * Manages configuration settings across the system
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  
  /** Configuration instance */
  private config: BrainProtocolConfig;
  
  /** Whether external sources are enabled */
  private useExternalSources: boolean;
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of ConfigurationManager
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: ConfigurationManagerOptions): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager(options);
      
      const logger = Logger.getInstance();
      logger.debug('ConfigurationManager singleton instance created');
    }
    
    return ConfigurationManager.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    ConfigurationManager.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ConfigurationManager singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: ConfigurationManagerOptions): ConfigurationManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ConfigurationManager instance');
    
    return new ConfigurationManager(options);
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   * 
   * @param options Configuration options
   */
  private constructor(options: ConfigurationManagerOptions) {
    this.config = options.config;
    // Initialize with the current value from config
    this.useExternalSources = options.config.useExternalSources;
    this.logger.debug('ConfigurationManager initialized');
  }
  
  /**
   * Get the raw configuration
   * @returns The configuration object
   */
  getConfig(): BrainProtocolConfig {
    return this.config;
  }
  
  /**
   * Check if an Anthropic API key is available
   * @returns Whether an Anthropic API key is available
   */
  hasAnthropicApiKey(): boolean {
    return this.config.hasAnthropicApiKey();
  }
  
  /**
   * Check if an OpenAI API key is available
   * @returns Whether an OpenAI API key is available
   */
  hasOpenAIApiKey(): boolean {
    return this.config.hasOpenAIApiKey();
  }
  
  /**
   * Get the API key for AI services
   * @returns The API key
   */
  getApiKey(): string | undefined {
    return this.config.getApiKey();
  }
  
  /**
   * Check if external sources are enabled
   * @returns Whether external sources are enabled
   */
  getUseExternalSources(): boolean {
    return this.useExternalSources;
  }
  
  /**
   * Set whether external sources are enabled
   * @param enabled Whether external sources are enabled
   */
  setUseExternalSources(enabled: boolean): void {
    this.useExternalSources = enabled;
    this.logger.debug(`External sources setting updated to ${enabled}`);
  }
  
  /**
   * Get the interface type (CLI or Matrix)
   * @returns The interface type
   */
  getInterfaceType(): 'cli' | 'matrix' {
    return this.config.interfaceType;
  }
  
  /**
   * Get the MCP server configuration
   * @returns The MCP server configuration object
   */
  getMcpServerConfig(): Record<string, unknown> {
    return this.config.getMcpServerConfig();
  }
}