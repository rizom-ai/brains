import type { Logger } from "@brains/utils";
import type { DataSource, DataSourceCapabilities } from "./types";

/**
 * DataSource Registry
 *
 * Central registry for all data sources in the system.
 * Follows Component Interface Standardization pattern.
 */
export class DataSourceRegistry {
  private static instance: DataSourceRegistry | null = null;
  private dataSources = new Map<string, DataSource>();
  private logger: Logger;

  /**
   * Get the singleton instance
   */
  public static getInstance(logger: Logger): DataSourceRegistry {
    if (!DataSourceRegistry.instance) {
      DataSourceRegistry.instance = new DataSourceRegistry(logger);
    }
    return DataSourceRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    DataSourceRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): DataSourceRegistry {
    return new DataSourceRegistry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger.child("DataSourceRegistry");
  }

  /**
   * Register a data source with automatic prefixing
   * If the ID doesn't contain ":", applies "shell:" prefix
   */
  register(dataSource: DataSource): void {
    const id = dataSource.id.includes(":")
      ? dataSource.id
      : `shell:${dataSource.id}`;
    this.registerWithId(id, dataSource);
  }

  /**
   * Internal method to register a data source with a specific ID
   */
  private registerWithId(id: string, dataSource: DataSource): void {
    // Check for ID conflicts
    if (this.dataSources.has(id)) {
      const error = new Error(`DataSource with id "${id}" already exists`);
      this.logger.error("DataSource registration failed", { error, id });
      throw error;
    }

    this.dataSources.set(id, dataSource);
    this.logger.debug("DataSource registered", {
      id,
      name: dataSource.name,
    });
  }

  /**
   * Unregister a data source
   */
  unregister(id: string): void {
    const removed = this.dataSources.delete(id);
    if (removed) {
      this.logger.debug("DataSource unregistered", { id });
    } else {
      this.logger.warn("Attempted to unregister non-existent DataSource", {
        id,
      });
    }
  }

  /**
   * Get a data source by ID
   */
  get(id: string): DataSource | undefined {
    return this.dataSources.get(id);
  }

  /**
   * Check if a data source exists
   */
  has(id: string): boolean {
    return this.dataSources.has(id);
  }

  /**
   * List all registered data sources
   */
  list(): DataSource[] {
    return Array.from(this.dataSources.values());
  }

  /**
   * Get all data source IDs
   */
  getIds(): string[] {
    return Array.from(this.dataSources.keys());
  }

  /**
   * Get data sources by capability
   */
  getByCapability(capability: keyof DataSourceCapabilities): DataSource[] {
    return this.list().filter((dataSource) => {
      switch (capability) {
        case "canFetch":
          return !!dataSource.fetch;
        case "canGenerate":
          return !!dataSource.generate;
        case "canTransform":
          return !!dataSource.transform;
        default:
          return false;
      }
    });
  }

  /**
   * Find data sources matching a predicate
   */
  find(predicate: (dataSource: DataSource) => boolean): DataSource[] {
    return this.list().filter(predicate);
  }

  /**
   * Clear all data sources (primarily for testing)
   */
  clear(): void {
    const count = this.dataSources.size;
    this.dataSources.clear();
    this.logger.debug("DataSource registry cleared", { count });
  }
}
