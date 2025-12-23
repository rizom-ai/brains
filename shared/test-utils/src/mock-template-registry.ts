import { mock } from "bun:test";
import type { TemplateRegistry, Template } from "@brains/templates";

/**
 * Options for configuring mock template registry return values
 */
export interface MockTemplateRegistryReturns {
  get?: Template | undefined;
  getAll?: Map<string, Template>;
  has?: boolean;
  getNames?: string[];
  list?: Template[];
  size?: number;
  getPluginTemplates?: Template[];
  getPluginTemplateNames?: string[];
}

/**
 * Options for creating a mock template registry
 */
export interface MockTemplateRegistryOptions {
  returns?: MockTemplateRegistryReturns;
}

/**
 * Create a mock template registry with all methods pre-configured.
 * The cast to TemplateRegistry is centralized here so test files don't need unsafe casts.
 *
 * @example
 * ```ts
 * const mockRegistry = createMockTemplateRegistry({
 *   returns: {
 *     get: { name: "test", schema: z.string(), ... },
 *     has: true,
 *   },
 * });
 * ```
 */
export function createMockTemplateRegistry(
  options: MockTemplateRegistryOptions = {},
): TemplateRegistry {
  const { returns = {} } = options;

  return {
    register: mock(() => {}),
    get: mock(() => returns.get),
    getAll: mock(() => returns.getAll ?? new Map()),
    has: mock(() => returns.has ?? false),
    getNames: mock(() => returns.getNames ?? []),
    list: mock(() => returns.list ?? []),
    unregister: mock(() => true),
    clear: mock(() => {}),
    size: mock(() => returns.size ?? 0),
    getPluginTemplates: mock(() => returns.getPluginTemplates ?? []),
    getPluginTemplateNames: mock(() => returns.getPluginTemplateNames ?? []),
  } as unknown as TemplateRegistry;
}
