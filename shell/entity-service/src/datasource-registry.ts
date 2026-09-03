import type { Logger } from "@brains/utils/logger";
import type { DataSource, DataSourceCapabilities } from "./types";

/**
 * The data source registry as consumers use it.
 *
 * They depend on this rather than on `InMemoryDataSourceRegistry`: the class
 * has private state and a private constructor, so nothing else can be
 * assignable to it — which is why every test double had to be asserted in.
 */
export interface DataSourceRegistry {
  register(dataSource: DataSource): void;
  unregister(id: string): void;
  get(id: string): DataSource | undefined;
  has(id: string): boolean;
  list(): DataSource[];
  getIds(): string[];
  getByCapability(capability: keyof DataSourceCapabilities): DataSource[];
  find(predicate: (dataSource: DataSource) => boolean): DataSource[];
  clear(): void;
}

/** Central registry for all data sources in the system. */
export class InMemoryDataSourceRegistry implements DataSourceRegistry {
  private dataSources = new Map<string, DataSource>();
  private logger: Logger;

  public static createFresh(logger: Logger): InMemoryDataSourceRegistry {
    return new InMemoryDataSourceRegistry(logger);
  }

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
