import type { RouteDefinition } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

export interface BuildRoutes {
  routes: RouteDefinition[];
  warnings: string[];
}

export function collectBuildRoutes(routeRegistry: RouteRegistry): BuildRoutes {
  const routes = routeRegistry.list();
  const warnings =
    routes.length === 0 ? ["No routes registered for site build"] : [];

  return { routes, warnings };
}
