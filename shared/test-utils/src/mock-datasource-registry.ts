import { mock } from "bun:test";
import type { DataSourceRegistry, DataSource } from "@brains/entity-service";

/**
 * Options for configuring mock data source registry return values
 */
export interface MockDataSourceRegistryReturns {
  get?: DataSource | undefined;
  has?: boolean;
  list?: DataSource[];
  getIds?: string[];
  getByCapability?: DataSource[];
  find?: DataSource[];
}

/**
 * Options for creating a mock data source registry
 */
export interface MockDataSourceRegistryOptions {
  returns?: MockDataSourceRegistryReturns;
}

/**
 * Create a mock data source registry with all methods pre-configured.
 * The cast to DataSourceRegistry is centralized here so test files don't need unsafe casts.
 *
 * @example
 * ```ts
 * const mockRegistry = createMockDataSourceRegistry({
 *   returns: {
 *     get: { id: "test:source", name: "Test Source", fetch: mockFetch },
 *     has: true,
 *   },
 * });
 * ```
 */
export function createMockDataSourceRegistry(
  options: MockDataSourceRegistryOptions = {},
): DataSourceRegistry {
  const { returns = {} } = options;

  return {
    register: mock(() => {}),
    unregister: mock(() => {}),
    get: mock(() => returns.get),
    has: mock(() => returns.has ?? false),
    list: mock(() => returns.list ?? []),
    getIds: mock(() => returns.getIds ?? []),
    getByCapability: mock(() => returns.getByCapability ?? []),
    find: mock(() => returns.find ?? []),
    clear: mock(() => {}),
  } as unknown as DataSourceRegistry;
}
