/**
 * Resource Registry - Central access point for external resources
 * 
 * This module provides a centralized registry for accessing external resources
 * like AI services, databases, and external APIs.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { getEnv } from '@/utils/configUtils';
import { SimpleContainer } from '@/utils/container';
import { 
  Registry, 
  type RegistryConfig, 
  type RegistryDependencies, 
} from '@/utils/registry';

import { ClaudeModel } from './ai/claude';
import { EmbeddingService } from './ai/embedding';

// Export interface type for type-safe usage
export type ResourceRegistryInterface = {
  getClaudeModel(): ClaudeModel;
  getEmbeddingService(): EmbeddingService;
  getResource<T>(resourceId: string): T;
}

/**
 * ResourceRegistry configuration options
 */
export interface ResourceRegistryConfig extends RegistryConfig {
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
  /** OpenAI API key for embeddings */
  openAiApiKey?: string;
}

/**
 * ResourceRegistry dependencies
 */
// We extend RegistryDependencies without adding new properties for now
export type ResourceRegistryDependencies = RegistryDependencies;

/**
 * Resource identifiers for consistent naming across the application
 */
export const ResourceIdentifiers = {
  // AI resource identifiers
  ClaudeModel: 'resource.ai.claude',
  EmbeddingService: 'resource.ai.embedding',
};

/**
 * Central registry for accessing external resources
 * 
 * This registry provides a single point of access for all external resources,
 * ensuring consistent initialization and configuration. It is the primary way
 * to access shared resources in production code.
 * 
 * Resource access pattern:
 * ```typescript
 * // Get the registry singleton
 * const resourceRegistry = ResourceRegistry.getInstance();
 * 
 * // Access resources through type-safe methods
 * const embeddingService = resourceRegistry.getEmbeddingService();
 * const claudeModel = resourceRegistry.getClaudeModel();
 * 
 * // Or using identifiers
 * const resource = resourceRegistry.getResource(ResourceIdentifiers.EmbeddingService);
 * ```
 * 
 * This pattern ensures:
 * 1. Resources are properly initialized before use
 * 2. Configuration is consistently applied
 * 3. Resource dependencies are managed centrally
 * 4. Resources can be mocked in tests without changing client code
 */
export class ResourceRegistry extends Registry {
  /** Singleton instance storage */
  private static instance: ResourceRegistry | null = null;
  
  /** Track if resources have been registered */
  private resourcesRegistered = false;
  
  /** Registry type for context-specific operations */
  protected readonly registryType = 'resource';
  
  /**
   * Get the singleton instance of the ResourceRegistry
   * 
   * @param config Configuration options
   * @param dependencies Dependencies such as logger
   * @returns The shared instance
   */
  public static override getInstance(
    config: Partial<ResourceRegistryConfig> = {}, 
    dependencies: Partial<ResourceRegistryDependencies> = {},
  ): ResourceRegistry {
    if (!ResourceRegistry.instance) {
      ResourceRegistry.instance = new ResourceRegistry(config, dependencies);
      ResourceRegistry.instance.logger.debug('ResourceRegistry singleton instance created');
      // Auto-initialize on getInstance
      ResourceRegistry.instance.initialize();
    } else if (config && Object.keys(config).length > 0) {
      // Update config if provided
      ResourceRegistry.instance.updateConfig(config);
    }
    
    return ResourceRegistry.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static override resetInstance(): void {
    if (ResourceRegistry.instance) {
      ResourceRegistry.instance.clear();
      ResourceRegistry.instance = null;
    }
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Configuration options
   * @param dependencies Dependencies such as logger
   * @returns A new instance
   */
  public static override createFresh(
    config: Partial<ResourceRegistryConfig> = {}, 
    dependencies: Partial<ResourceRegistryDependencies> = {},
  ): ResourceRegistry {
    const registry = new ResourceRegistry(config, dependencies);
    registry.initialize();
    return registry;
  }
  
  /**
   * Protected constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param config Configuration options
   * @param dependencies Dependencies such as logger
   */
  protected constructor(
    config: Partial<ResourceRegistryConfig> = {}, 
    dependencies: Partial<ResourceRegistryDependencies> = {},
  ) {
    super({
      name: 'ResourceRegistry',
      ...config,
    }, dependencies);
  }
  
  /**
   * Create the dependency container
   * 
   * @returns A new SimpleContainer
   */
  protected override createContainer(): SimpleContainer {
    return SimpleContainer.createFresh();
  }
  
  /**
   * Register standard resources with the registry
   * This is called automatically by initialize()
   */
  protected registerComponents(): void {
    if (this.resourcesRegistered) {
      return;
    }
    
    this.logger.debug('Registering standard resources');
    
    // Register Claude model with validation
    this.registerResource(
      ResourceIdentifiers.ClaudeModel,
      () => {
        // Validate API key exists without passing config to getInstance()
        // This ensures ClaudeModel gets its config from config.ts and env vars
        this.validateAnthropicApiKey();
        return ClaudeModel.getInstance();
      },
    );
    
    // Register embedding service with validation
    this.registerResource(
      ResourceIdentifiers.EmbeddingService,
      () => {
        // Just validate the API key exists but don't pass config to getInstance()
        // This ensures EmbeddingService gets its config from config.ts and env vars
        this.validateOpenAiApiKey(); 
        return EmbeddingService.getInstance();
      },
    );
    
    this.resourcesRegistered = true;
    this.logger.debug('Standard resources registered');
  }
  
  /**
   * Standardized resource registration helper
   * 
   * @param id Resource identifier
   * @param factory Factory function to create the resource
   * @param dependencies Optional array of dependency identifiers
   */
  private registerResource<T>(
    id: string,
    factory: () => T,
    dependencies: string[] = [],
  ): void {
    // Validate dependencies before registration
    for (const dependencyId of dependencies) {
      this.validateDependency(id, dependencyId);
    }
    
    this.register(id, () => factory());
  }
  
  /**
   * Validate and retrieve Anthropic API key
   * 
   * @returns The validated Anthropic API key
   * @throws Error if API key is missing
   */
  protected validateAnthropicApiKey(): string {
    const anthropicApiKey = (this.config as ResourceRegistryConfig).anthropicApiKey || getEnv('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      const error = new Error('ANTHROPIC API key is required but not provided');
      this.logger.error('Missing Anthropic API key', { error });
      throw error;
    }
    
    return anthropicApiKey;
  }
  
  /**
   * Validate and retrieve OpenAI API key
   * 
   * @returns The validated OpenAI API key
   * @throws Error if API key is missing
   */
  protected validateOpenAiApiKey(): string {
    const openAiApiKey = (this.config as ResourceRegistryConfig).openAiApiKey || getEnv('OPENAI_API_KEY');
    if (!openAiApiKey) {
      const error = new Error('OPENAI API key is required but not provided');
      this.logger.error('Missing OpenAI API key', { error });
      throw error;
    }
    
    return openAiApiKey;
  }
  
  /**
   * Get the Claude language model
   * 
   * This method provides type-safe access to the ClaudeModel singleton.
   * It is the preferred way to access the language model in production code.
   * 
   * Usage:
   * ```typescript
   * const claudeModel = ResourceRegistry.getInstance().getClaudeModel();
   * const response = await claudeModel.generateText('What is the capital of France?');
   * ```
   * 
   * @returns The ClaudeModel instance with proper configuration
   */
  public getClaudeModel(): ClaudeModel {
    return this.resolve<ClaudeModel>(ResourceIdentifiers.ClaudeModel);
  }
  
  /**
   * Get the embedding service
   * 
   * This method provides type-safe access to the EmbeddingService singleton.
   * It is the preferred way to access the embedding service in production code.
   * 
   * Usage:
   * ```typescript
   * const embeddingService = ResourceRegistry.getInstance().getEmbeddingService();
   * await embeddingService.getEmbedding('Some text to embed');
   * ```
   * 
   * @returns The EmbeddingService instance with proper configuration
   */
  public getEmbeddingService(): EmbeddingService {
    return this.resolve<EmbeddingService>(ResourceIdentifiers.EmbeddingService);
  }
  
  /**
   * Get a resource by its identifier with proper typing
   * 
   * @param resourceId Resource identifier
   * @returns The resource instance
   */
  public getResource<T>(resourceId: string): T {
    return this.resolve<T>(resourceId);
  }
}