/**
 * Context Manager for BrainProtocol
 * Manages access to note, profile, conversation, and external source contexts
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import {
  MCPConversationContext,
  MCPExternalSourceContext,
  MCPNoteContext,
  MCPProfileContext,
  MCPWebsiteContext,
} from '@/contexts';
import type { ConversationStorage } from '@/contexts/conversations/storage/conversationStorage';
import { InMemoryStorage } from '@/contexts/conversations/storage/inMemoryStorage';
import { ValidationError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';
import { RendererRegistry } from '@/utils/registry/rendererRegistry';
import { isDefined } from '@/utils/safeAccessUtils';

import type { BrainProtocolConfig } from '../config/brainProtocolConfig';
import type { IContextManager } from '../types';

/**
 * Configuration options for ContextManager
 */
export interface ContextManagerConfig {
  /** BrainProtocol configuration */
  config: BrainProtocolConfig;
}

/**
 * Manages the various contexts used by the BrainProtocol
 * 
 * The ContextManager is responsible for:
 * 1. Creating and initializing context objects (notes, profile, external sources)
 * 2. Providing access to these contexts for other components
 * 3. Managing external source state (enabled/disabled)
 * 4. Ensuring contexts are properly initialized before use
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class ContextManager implements IContextManager {
  // Singleton instance
  private static instance: ContextManager | null = null;

  // Core context objects - using new MCP implementations
  private readonly noteContext: MCPNoteContext;
  private readonly profileContextV2: MCPProfileContext;
  private readonly externalSourceContext: MCPExternalSourceContext;
  private readonly conversationContext: MCPConversationContext;
  private readonly websiteContext: MCPWebsiteContext;

  // State
  private useExternalSources: boolean;
  private initialized: boolean = false;
  private initializationError: Error | null = null;

  // Reference to the configuration for getting the interface type
  private config: BrainProtocolConfig;

  // Logger instance
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance of ContextManager
   * 
   * @param options - Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(options: ContextManagerConfig): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager(options.config);

      const logger = Logger.getInstance();
      logger.debug('ContextManager singleton instance created');
    } else if (options) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }

    return ContextManager.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    if (ContextManager.instance) {
      ContextManager.instance = null;

      const logger = Logger.getInstance();
      logger.debug('ContextManager singleton instance reset');
    }
  }

  /**
   * Create a fresh instance that is not the singleton
   * This method is primarily used for testing to create isolated instances
   * 
   * @param options - Configuration options
   * @returns A new ContextManager instance
   */
  public static createFresh(options: ContextManagerConfig): ContextManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ContextManager instance');

    return new ContextManager(options.config);
  }

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param config - Configuration for the brain protocol
   */
  private constructor(config: BrainProtocolConfig) {
    // Store config for later use
    this.config = config;

    const apiKey = config.getApiKey();
    const newsApiKey = config.newsApiKey;
    const interfaceType = config.interfaceType || 'cli';

    // Initialize the contexts with singletons
    // This ensures we're using the same context instances throughout the application
    try {
      this.noteContext = MCPNoteContext.getInstance({ apiKey });

      // Initialize profile context
      this.profileContextV2 = MCPProfileContext.getInstance();

      this.externalSourceContext = MCPExternalSourceContext.getInstance({
        apiKey,
        newsApiKey,
      });
      // Initialize conversation context with storage
      const storage = config.memoryStorage || InMemoryStorage.getInstance();
      this.conversationContext = MCPConversationContext.getInstance({
        storage: storage as ConversationStorage,
      });
      
      // Initialize website context
      this.websiteContext = MCPWebsiteContext.getInstance({});

      // Set initial state
      this.useExternalSources = config.useExternalSources;

      // Room initialization is handled by ConversationManager if needed

      // Mark as successfully initialized
      this.initialized = true;

      this.logger.debug('Context manager successfully initialized');
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize one or more contexts:', error);
      throw new ValidationError(
        'Context manager failed to initialize',
        { apiKey: !!apiKey, newsApiKey: !!newsApiKey, interfaceType, error },
      );
    }
  }

  /**
   * Get the note context for data access operations
   * @returns The note context instance
   * @throws Error if context is not properly initialized
   */
  getNoteContext(): MCPNoteContext {
    this.ensureContextsReady();
    return this.noteContext;
  }

  /**
   * Get the profile context for profile operations
   * @returns The ProfileContext instance
   * @throws Error if context is not properly initialized
   */
  getProfileContext(): MCPProfileContext {
    this.ensureContextsReady();
    return this.profileContextV2;
  }

  /**
   * Get the external source context for external knowledge access
   * @returns The external source context instance
   * @throws Error if context is not properly initialized
   */
  getExternalSourceContext(): MCPExternalSourceContext {
    this.ensureContextsReady();
    return this.externalSourceContext;
  }

  /**
   * Get the conversation context for conversation management
   * @returns The conversation context instance
   * @throws Error if context is not properly initialized
   */
  getConversationContext(): MCPConversationContext {
    this.ensureContextsReady();
    return this.conversationContext;
  }

  /**
   * Get the website context
   * @returns The website context instance
   * @throws Error if context is not properly initialized
   */
  getWebsiteContext(): MCPWebsiteContext {
    this.ensureContextsReady();
    return this.websiteContext;
  }

  /**
   * Enable or disable external sources functionality
   * @param enabled Whether external sources should be enabled
   */
  setExternalSourcesEnabled(enabled: boolean): void {
    // Only log if there's an actual change
    if (this.useExternalSources !== enabled) {
      this.useExternalSources = enabled;
      this.logger.info(`External sources ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get the current status of external sources
   * @returns Whether external sources are enabled
   */
  getExternalSourcesEnabled(): boolean {
    return this.useExternalSources;
  }

  /**
   * Check if all contexts are properly initialized
   * @returns Whether all contexts are ready
   */
  areContextsReady(): boolean {
    return this.initialized &&
      isDefined(this.noteContext) &&
      isDefined(this.profileContextV2) &&
      isDefined(this.externalSourceContext) &&
      isDefined(this.conversationContext) &&
      isDefined(this.websiteContext);
  }

  /**
   * Ensure that all contexts are ready to use
   * @throws Error if contexts are not ready
   */
  private ensureContextsReady(): void {
    if (!this.areContextsReady()) {
      throw new Error(
        this.initializationError
          ? `Contexts not ready: ${this.initializationError.message}`
          : 'Contexts not ready: Initialization incomplete',
      );
    }
  }

  /**
   * Initialize the link between profile and note contexts
   * This should be called after contexts are initialized if needed
   */
  initializeContextLinks(): void {
    if (this.areContextsReady()) {
      // ProfileContext doesn't need explicit NoteContext reference anymore
      // this.profileContext.setNoteContext(this.noteContext);
      this.logger.debug('Context links initialized');
    } else {
      this.logger.warn('Cannot initialize context links: contexts not ready');
    }
  }

  /**
   * Get the renderer for the current interface type
   * This provides a standardized way to access the renderer from any context
   * 
   * @returns The renderer instance for the current interface type
   */
  getRenderer(): unknown {
    try {
      // Get the configured interface type from our stored config
      const interfaceType = this.config.interfaceType || 'cli';

      // Get the renderer from the registry
      const registry = RendererRegistry.getInstance();
      const renderer = registry.getRenderer(interfaceType);

      if (!renderer) {
        this.logger.warn(`No renderer found for interface type: ${interfaceType}`);
      }

      return renderer;
    } catch (error) {
      this.logger.error('Error getting renderer:', error);
      return null;
    }
  }

  /**
   * Reset all context instances (useful for testing)
   * This resets the singleton instances to ensure clean state
   */
  static resetContexts(): void {
    const logger = Logger.getInstance();

    MCPNoteContext.resetInstance();
    MCPProfileContext.resetInstance();
    MCPExternalSourceContext.resetInstance();
    MCPConversationContext.resetInstance();
    MCPWebsiteContext.resetInstance();
    
    logger.debug('All context singletons have been reset');
  }
}
