import { Logger } from "@brains/utils";

/**
 * Factory function type for creating components
 */
export type ComponentFactory<T> = (...args: unknown[]) => T;

/**
 * Registry of components for dependency management
 * Implements Component Interface Standardization pattern
 */
export class Registry {
  private static instance: Registry | null = null;

  private components: Map<string, unknown> = new Map();
  private factories: Map<string, ComponentFactory<unknown>> = new Map();
  private logger: Logger;

  /**
   * Get the singleton instance of Registry
   */
  public static getInstance(logger: Logger = Logger.getInstance()): Registry {
    if (!Registry.instance) {
      Registry.instance = new Registry(logger);
    }
    return Registry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    Registry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): Registry {
    return new Registry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger.child("Registry");
  }

  /**
   * Register a component factory
   */
  public register<T>(id: string, factory: ComponentFactory<T>): void {
    this.logger.debug(`Registering component: ${id}`);

    if (this.factories.has(id)) {
      this.logger.warn(`Component already registered: ${id}, overwriting`);
    }

    this.factories.set(id, factory as ComponentFactory<unknown>);

    // Remove any existing singleton instance when re-registering
    if (this.components.has(id)) {
      this.components.delete(id);
      this.logger.debug(`Removed existing instance of: ${id}`);
    }

    this.logger.info(`Registered component: ${id}`);
  }

  /**
   * Check if a component is registered
   */
  public has(id: string): boolean {
    return this.factories.has(id);
  }

  /**
   * Resolve a component by ID
   * Creates and caches the component if it doesn't exist yet
   */
  public resolve<T>(id: string, ...args: unknown[]): T {
    // Check if the component is already created
    if (this.components.has(id)) {
      this.logger.debug(`Resolving existing component: ${id}`);
      return this.components.get(id) as T;
    }

    // Check if a factory exists
    if (!this.factories.has(id)) {
      this.logger.error(`Component not registered: ${id}`);
      throw new Error(`Component not registered: ${id}`);
    }

    // Create the component
    this.logger.debug(`Creating component: ${id}`);
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Component factory not found: ${id}`);
    }
    const component = factory(...args);

    // Store for future resolves
    this.components.set(id, component);
    this.logger.debug(`Created and cached component: ${id}`);

    return component as T;
  }

  /**
   * Create a new component instance without caching it
   */
  public createFresh<T>(id: string, ...args: unknown[]): T {
    // Check if a factory exists
    if (!this.factories.has(id)) {
      this.logger.error(`Component not registered: ${id}`);
      throw new Error(`Component not registered: ${id}`);
    }

    // Create the component
    this.logger.debug(`Creating fresh component: ${id}`);
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Component factory not found: ${id}`);
    }
    const component = factory(...args);

    this.logger.debug(`Created fresh component: ${id}`);
    return component as T;
  }

  /**
   * Remove a component from the registry
   * Both the factory and any cached instance will be removed
   */
  public unregister(id: string): void {
    this.logger.debug(`Unregistering component: ${id}`);

    if (!this.factories.has(id)) {
      this.logger.warn(`Component not registered: ${id}`);
      return;
    }

    this.factories.delete(id);

    if (this.components.has(id)) {
      this.components.delete(id);
      this.logger.debug(`Removed cached instance of: ${id}`);
    }

    this.logger.info(`Unregistered component: ${id}`);
  }

  /**
   * Get all registered component IDs
   */
  public getAll(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Clear all components and factories
   */
  public clear(): void {
    this.logger.debug("Clearing all components");
    this.components.clear();
    this.factories.clear();
    this.logger.info("All components cleared");
  }
}
