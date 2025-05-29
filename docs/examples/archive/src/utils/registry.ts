/**
 * Unified Registry Pattern
 * 
 * This module provides a standardized registry pattern that implements the 
 * Component Interface Standardization pattern used throughout the codebase.
 * 
 * It serves as a foundation for both resource and service registries,
 * providing a consistent API for registration, dependency resolution,
 * and lifecycle management.
 */

import { SimpleContainer } from './container';
import { Logger } from './logger';

/**
 * Registry configuration options
 */
export interface RegistryConfig {
  /**
   * Name of the registry for logging purposes
   */
  name?: string;
  
  /**
   * Whether to suppress logs
   */
  silent?: boolean;
  
  /**
   * Additional configuration properties
   */
  [key: string]: unknown;
}

// No backward compatibility interface needed

/**
 * Registry dependencies
 */
export interface RegistryDependencies {
  /**
   * Logger instance to use
   */
  logger?: Logger;
  
  /**
   * Container to use
   * If not provided, each Registry will create its own container
   */
  container?: SimpleContainer;
}

/**
 * Registry factory function type
 * Used to create registry entries with proper dependency injection
 */
export type RegistryFactory<T = unknown> = (container: SimpleContainer) => T;

/**
 * Registry interface to ensure consistent implementation
 */
export interface IRegistry {
  // Core methods
  initialize(): boolean;
  isInitialized(): boolean;
  
  // Component management
  register<C>(id: string, factory: RegistryFactory<C>, singleton?: boolean): void;
  resolve<C>(id: string): C;
  has(id: string): boolean;
  unregister(id: string): void;
  clear(): void;
  
  // Configuration
  updateConfig(config: Partial<RegistryConfig>): void;
}

/**
 * Abstract base class for all registries
 * Follows the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export abstract class Registry implements IRegistry {
  // No static _instance - each derived class should have its own
  
  /**
   * Get the singleton instance
   * This implementation should be overridden by derived classes but provides a default
   * 
   * @param _config Optional configuration options
   * @param _dependencies Optional dependencies
   * @returns The singleton instance
   */
  public static getInstance(
    _config?: Partial<RegistryConfig>, 
    _dependencies?: Partial<RegistryDependencies>,
  ): Registry {
    // This is abstract and should be implemented by subclasses
    // We provide a default implementation that throws an error if not properly implemented
    throw new Error('getInstance must be implemented by derived classes');
  }
  
  /**
   * Reset the singleton instance
   * This is primarily for testing purposes
   */
  public static resetInstance(): void {
    // Each derived class should implement this to reset its own singleton instance
    // We don't reset _instance here as each class maintains its own static instance
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * This is primarily for testing purposes
   * 
   * @param _config Optional configuration options
   * @param _dependencies Optional dependencies
   * @returns A new registry instance
   */
  public static createFresh(
    _config?: Partial<RegistryConfig>,
    _dependencies?: Partial<RegistryDependencies>,
  ): Registry {
    // This is abstract and should be implemented by subclasses
    throw new Error('createFresh must be implemented by derived classes');
  }
  
  /**
   * Registry name for logging purposes
   */
  protected readonly name: string;
  
  /**
   * Registry type for context-specific operations
   */
  protected abstract readonly registryType: 'resource' | 'service';
  
  /**
   * Logger instance
   */
  protected readonly logger: Logger;
  
  /**
   * Registry configuration
   */
  protected config: RegistryConfig;
  
  /**
   * Internal container for dependency management
   */
  protected container: SimpleContainer;
  
  /**
   * Initialization state tracking
   */
  private initialized = false;
  
  /**
   * Protected constructor to enforce singleton pattern
   * 
   * @param config Configuration options
   * @param dependencies Dependencies like logger and container
   */
  protected constructor(
    config: Partial<RegistryConfig> = {}, 
    dependencies: Partial<RegistryDependencies> = {},
  ) {
    this.config = {
      name: config.name || this.constructor.name,
      silent: config.silent !== undefined ? config.silent : true, // Default to true for silent logging in tests
      ...config,
    };
    
    this.name = this.config.name || this.constructor.name;
    
    // Use provided logger or create default one
    this.logger = dependencies.logger || Logger.getInstance();
    
    // Use provided container or create a new one
    this.container = dependencies.container || this.createContainer();
    
    this.logger.debug(`${this.name} constructed`);
  }
  
  /**
   * Create a new SimpleContainer instance
   * Override this method if you need a different container implementation
   */
  protected createContainer(): SimpleContainer {
    return SimpleContainer.createFresh();
  }
  
  /**
   * Standard initialization method
   * Calls the abstract registerComponents method implemented by derived classes
   * 
   * @returns Whether initialization was successful
   */
  public initialize(): boolean {
    if (this.initialized) return true;
    
    this.logger.debug(`Initializing ${this.name} (${this.registryType})`);
    try {
      this.registerComponents();
      this.initialized = true;
      this.logger.debug(`${this.name} initialized successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Error initializing ${this.name}`, { error });
      return false;
    }
  }
  
  /**
   * Abstract method for standardized component registration
   * Must be implemented by derived classes
   */
  protected abstract registerComponents(): void;
  
  /**
   * Check if registry is initialized
   * 
   * @returns Whether registry is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Helper method to validate dependencies
   * 
   * @param id Component ID
   * @param dependencyId Dependency ID
   * @returns Whether dependency is valid
   */
  protected validateDependency(id: string, dependencyId: string): boolean {
    if (!this.has(dependencyId)) {
      this.logger.error(`Component "${id}" is missing dependency "${dependencyId}"`);
      return false;
    }
    return true;
  }
  
  /**
   * Registers a component in the registry
   * 
   * @param id Unique identifier for the component
   * @param factory Factory function to create the component
   * @param singleton Whether the component should be a singleton
   */
  public register<T>(id: string, factory: RegistryFactory<T>, singleton = true): void {
    if (!this.container.has(id)) {
      this.container.register(id, factory, singleton);
      this.logger.debug(`Registered ${id} in ${this.name}`);
    } else {
      this.logger.debug(`${id} already registered in ${this.name}`);
    }
  }
  
  /**
   * Resolves a component from the registry
   * 
   * @param id Unique identifier for the component
   * @returns The resolved component
   */
  public resolve<T = unknown>(id: string): T {
    try {
      return this.container.resolve<T>(id);
    } catch (error) {
      this.logger.error(`Failed to resolve ${this.registryType} with ID "${id}"`, { error });
      throw error;
    }
  }
  
  /**
   * Checks if a component is registered in the registry
   * 
   * @param id Unique identifier for the component
   * @returns Whether the component is registered
   */
  public has(id: string): boolean {
    return this.container.has(id);
  }
  
  /**
   * Unregisters a component from the registry
   * 
   * @param id Unique identifier for the component
   */
  public unregister(id: string): void {
    this.container.unregister(id);
    this.logger.debug(`Unregistered ${id} from ${this.name}`);
  }
  
  /**
   * Clears all registered components
   */
  public clear(): void {
    this.container.clear();
    this.initialized = false;
    this.logger.debug(`Cleared all registrations from ${this.name}`);
  }
  
  /**
   * Updates registry configuration
   * 
   * @param config New configuration to merge with existing config
   */
  public updateConfig(config: Partial<RegistryConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug(`Updated configuration for ${this.name}`);
  }
}

/**
 * Utility function to ensure registry singleton is initialized
 * Creates a singleton instance of a registry if it doesn't exist
 * 
 * @param registryClass Registry class to instantiate
 * @param config Configuration options to pass
 * @param dependencies Dependencies to pass
 * @returns Whether the registry was initialized
 */
export function ensureRegistryInitialized<T extends Registry>(
  registryClass: { 
    getInstance: (
      config?: Partial<RegistryConfig>, 
      dependencies?: Partial<RegistryDependencies>
    ) => T 
  },
  config?: Partial<RegistryConfig>,
  dependencies?: Partial<RegistryDependencies>,
): boolean {
  const registry = registryClass.getInstance(config, dependencies);
  return !!registry;
}