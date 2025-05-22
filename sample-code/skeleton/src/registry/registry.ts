import { z } from "zod";

/**
 * Registry options schema
 */
export const registryOptionsSchema = z.object({
  autoInitialize: z.boolean().default(true),
  allowOverrides: z.boolean().default(false),
  strictDependencies: z.boolean().default(true),
});

export type RegistryOptions = z.infer<typeof registryOptionsSchema>;

/**
 * Factory function schema
 */
export const registryFactorySchema = z
  .function()
  .args(z.any())
  .returns(z.any());

export type RegistryFactory<T> = (...args: any[]) => T;

/**
 * Registry for managing components
 */
export class Registry {
  private components: Map<string, any> = new Map();
  private factories: Map<string, RegistryFactory<any>> = new Map();
  private singletons: Set<string> = new Set();
  private initialized = false;
  private options: RegistryOptions;

  /**
   * Create a new registry
   */
  constructor(options?: Partial<RegistryOptions>) {
    this.options = registryOptionsSchema.parse({
      autoInitialize: true,
      allowOverrides: false,
      strictDependencies: true,
      ...options,
    });
  }

  /**
   * Register a component factory
   */
  public register<T>(
    id: string,
    factory: RegistryFactory<T>,
    singleton: boolean = true,
  ): void {
    // Validate id format
    z.string().min(1).parse(id);

    // Validate factory is a function
    if (typeof factory !== "function") {
      throw new Error(`Factory must be a function: ${id}`);
    }

    // Check for existing registration
    if (this.factories.has(id) && !this.options.allowOverrides) {
      throw new Error(`Component already registered: ${id}`);
    }

    this.factories.set(id, factory);
    if (singleton) {
      this.singletons.add(id);
    }
  }

  /**
   * Resolve a component
   */
  public resolve<T>(id: string): T {
    if (!this.initialized && this.options.autoInitialize) {
      this.initialize();
    }

    // Check if component is already created
    if (this.components.has(id)) {
      return this.components.get(id) as T;
    }

    // Check if factory exists
    if (!this.factories.has(id)) {
      throw new Error(`Component not registered: ${id}`);
    }

    // Create component
    const factory = this.factories.get(id)!;
    const component = factory(this);

    // Store singleton components
    if (this.singletons.has(id)) {
      this.components.set(id, component);
    }

    return component as T;
  }

  /**
   * Check if a component is registered
   */
  public has(id: string): boolean {
    return this.factories.has(id);
  }

  /**
   * Initialize the registry
   */
  public initialize(): boolean {
    if (this.initialized) return true;

    try {
      this.registerCoreComponents();
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize registry", error);
      return false;
    }
  }

  /**
   * Check if the registry is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Register core components
   */
  private registerCoreComponents(): void {
    // Override in subclasses
  }

  /**
   * Unregister a component
   */
  public unregister(id: string): void {
    this.components.delete(id);
    this.factories.delete(id);
    this.singletons.delete(id);
  }

  /**
   * Clear all registrations
   */
  public clear(): void {
    this.components.clear();
    this.factories.clear();
    this.singletons.clear();
    this.initialized = false;
  }

  /**
   * Update registry options
   */
  public updateOptions(options: Partial<RegistryOptions>): void {
    this.options = registryOptionsSchema.parse({
      ...this.options,
      ...options,
    });
  }
}
