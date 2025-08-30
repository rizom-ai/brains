import type { RouteDefinition } from "../types/routes";
import { RouteDefinitionSchema } from "../types/routes";
import type { Logger } from "@brains/utils";

/**
 * Route Registry - manages route definitions for the site builder
 * This registry is owned and managed entirely by the site-builder plugin
 */
export class RouteRegistry {
  private routes = new Map<string, RouteDefinition>();

  constructor(private readonly logger: Logger) {}

  /**
   * Register one or more route definitions
   * @throws Error if any route path is already registered
   */
  register(routes: RouteDefinition | RouteDefinition[]): void {
    const routeArray = Array.isArray(routes) ? routes : [routes];

    for (const route of routeArray) {
      // Validate route definition
      const validated = RouteDefinitionSchema.parse(route);

      // Override existing route if it exists (dynamic routes can be regenerated)
      if (this.routes.has(validated.path)) {
        const existing = this.routes.get(validated.path);
        this.logger.debug(
          `Overriding route "${validated.path}" (was registered by plugin "${existing?.pluginId}")`,
        );
      }

      this.routes.set(validated.path, validated);
    }
  }

  /**
   * Unregister one or more routes by path
   */
  unregister(paths: string | string[]): void {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    pathArray.forEach((path) => this.routes.delete(path));
  }

  /**
   * Unregister all routes from a specific plugin
   */
  unregisterByPlugin(pluginId: string): void {
    for (const [path, route] of this.routes.entries()) {
      if (route.pluginId === pluginId) {
        this.routes.delete(path);
      }
    }
  }

  /**
   * Get a specific route by path
   */
  get(path: string): RouteDefinition | undefined {
    return this.routes.get(path);
  }

  /**
   * List all routes with optional filtering
   */
  list(filter?: { pluginId?: string | undefined }): RouteDefinition[] {
    let routes = Array.from(this.routes.values());

    if (filter?.pluginId) {
      routes = routes.filter((r) => r.pluginId === filter.pluginId);
    }

    return routes;
  }

  /**
   * List routes by plugin
   */
  listByPlugin(pluginId: string): RouteDefinition[] {
    return this.list({ pluginId });
  }

  /**
   * Clear all routes
   */
  clear(): void {
    this.routes.clear();
  }

  /**
   * Get the total number of registered routes
   */
  size(): number {
    return this.routes.size;
  }
}
