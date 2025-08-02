import type { RouteDefinition, RouteRegistry as IRouteRegistry } from "./types";
import { RouteDefinitionSchema } from "./types";
import { ViewRouteRegistrationError } from "./errors";

export class RouteRegistry implements IRouteRegistry {
  private static instance: RouteRegistry | null = null;
  private routes = new Map<string, RouteDefinition>();

  public static getInstance(): RouteRegistry {
    RouteRegistry.instance ??= new RouteRegistry();
    return RouteRegistry.instance;
  }

  public static resetInstance(): void {
    RouteRegistry.instance = null;
  }

  public static createFresh(): RouteRegistry {
    return new RouteRegistry();
  }

  private constructor() {}

  register(route: RouteDefinition): void {
    // Validate route definition
    const validated = RouteDefinitionSchema.parse(route);

    // Check for path conflicts
    if (this.routes.has(validated.path)) {
      const existing = this.routes.get(validated.path);
      if (!existing) {
        throw new ViewRouteRegistrationError(
          `Unexpected missing route at path: ${validated.path}`,
          { routePath: validated.path },
        );
      }
      throw new ViewRouteRegistrationError(
        `Route path "${validated.path}" already registered by plugin "${existing.pluginId}"`,
        { routePath: validated.path, existingPluginId: existing.pluginId },
      );
    }

    this.routes.set(validated.path, validated);
  }

  unregister(path: string): void {
    this.routes.delete(path);
  }

  get(path: string): RouteDefinition | undefined {
    return this.routes.get(path);
  }

  list(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  listByPlugin(pluginId: string): RouteDefinition[] {
    return Array.from(this.routes.values()).filter(
      (route) => route.pluginId === pluginId,
    );
  }
}
