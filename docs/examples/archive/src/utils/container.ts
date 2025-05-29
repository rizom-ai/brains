/**
 * SimpleContainer for Dependency Injection
 * 
 * A lightweight dependency injection container implementation
 * that follows the Component Interface Standardization pattern.
 */

import { Logger } from './logger';

/**
 * Type for a factory function that creates a service instance
 */
export type ServiceFactory<T = unknown> = (container: SimpleContainer) => T;

/**
 * Configuration for a service registration
 */
export interface ServiceConfig<T = unknown> {
  factory: ServiceFactory<T>;
  singleton?: boolean;
}

/**
 * Configuration options for SimpleContainer
 */
export interface SimpleContainerConfig {
  /**
   * Name for the container (for logging)
   */
  name?: string;
  
  /**
   * Whether to suppress logs
   */
  silent?: boolean;
}

/**
 * Dependencies for SimpleContainer
 */
export interface SimpleContainerDependencies {
  /**
   * Logger instance to use
   */
  logger?: Logger;
}

/**
 * Simple container implementation for dependency injection
 * Follows the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class SimpleContainer {
  /**
   * Singleton instance storage
   */
  private static instance: SimpleContainer | null = null;
  
  /**
   * Registry of services
   */
  private services = new Map<string, ServiceConfig<unknown>>();
  
  /**
   * Cache of singleton instances
   */
  private instances = new Map<string, unknown>();
  
  /**
   * Logger instance
   */
  private readonly logger: Logger;
  
  /**
   * Container name for logging
   */
  private readonly name: string;
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    config: Partial<SimpleContainerConfig> = {},
    dependencies: Partial<SimpleContainerDependencies> = {},
  ) {
    // Set name for logging
    this.name = config.name || 'SimpleContainer';
    
    // Use provided logger or create default one
    this.logger = dependencies.logger || Logger.getInstance();
    
    if (config.silent) {
      // Use a silent logger if requested
      this.logger = Logger.createFresh({ silent: true });
    }
    
    this.logger.debug(`${this.name} constructed`);
  }
  
  /**
   * Get the singleton instance
   * 
   * @param config Configuration options
   * @param dependencies Dependencies
   * @returns The shared instance
   */
  public static getInstance(
    config: Partial<SimpleContainerConfig> = {},
    dependencies: Partial<SimpleContainerDependencies> = {},
  ): SimpleContainer {
    if (!SimpleContainer.instance) {
      SimpleContainer.instance = new SimpleContainer(config, dependencies);
    }
    
    return SimpleContainer.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (SimpleContainer.instance) {
      SimpleContainer.instance.clear();
      SimpleContainer.instance = null;
    }
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * 
   * @param config Configuration options
   * @param dependencies Dependencies
   * @returns A new instance
   */
  public static createFresh(
    config: Partial<SimpleContainerConfig> = {},
    dependencies: Partial<SimpleContainerDependencies> = {},
  ): SimpleContainer {
    return new SimpleContainer(config, dependencies);
  }
  
  /**
   * Register a service with the container
   * @param name Unique service identifier
   * @param factory Factory function to create the service
   * @param singleton Whether to create only one instance (default: true)
   */
  public register<T>(name: string, factory: ServiceFactory<T>, singleton = true): void {
    if (this.services.has(name)) {
      this.logger.warn(`Service '${name}' is already registered. Overwriting previous registration.`);
    }
    this.services.set(name, { factory, singleton });
    // Clear instance if service is re-registered
    this.instances.delete(name);
  }

  /**
   * Get a service instance from the container
   * @param name Service identifier
   * @returns Service instance
   * @throws Error if service is not registered
   */
  public resolve<T>(name: string): T {
    const serviceConfig = this.services.get(name);
    
    if (!serviceConfig) {
      throw new Error(`Service '${name}' is not registered in the container`);
    }
    
    // For singletons, return the cached instance if available
    if (serviceConfig.singleton && this.instances.has(name)) {
      return this.instances.get(name) as T;
    }
    
    // Create a new instance
    const instance = serviceConfig.factory(this);
    
    // Cache the instance if it's a singleton
    if (serviceConfig.singleton) {
      this.instances.set(name, instance);
    }
    
    return instance as T;
  }

  /**
   * Check if a service is registered
   * @param name Service identifier
   * @returns True if service is registered
   */
  public has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Remove a service registration
   * @param name Service identifier
   */
  public unregister(name: string): void {
    this.services.delete(name);
    this.instances.delete(name);
  }

  /**
   * Clear all service registrations and instances
   */
  public clear(): void {
    this.services.clear();
    this.instances.clear();
  }
}