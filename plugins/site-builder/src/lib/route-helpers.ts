import type { RouteDefinitionInput } from "@brains/plugins";
import type { RouteRegistry } from "./route-registry";

/**
 * Prefix section template names with the plugin ID if not already namespaced.
 * Templates that already contain ":" (e.g. "other-plugin:hero") are left as-is.
 */
function prefixSections(
  sections: NonNullable<RouteDefinitionInput["sections"]>,
  pluginId: string,
): NonNullable<RouteDefinitionInput["sections"]> {
  return sections.map((section) => ({
    ...section,
    template: section.template.includes(":")
      ? section.template
      : `${pluginId}:${section.template}`,
  }));
}

/**
 * Register an array of routes into the route registry, auto-prefixing template
 * names with the given plugin ID.
 */
export function registerConfigRoutes(
  routes: RouteDefinitionInput[],
  pluginId: string,
  registry: RouteRegistry,
): void {
  for (const route of routes) {
    registry.register({
      ...route,
      pluginId,
      sections: route.sections ? prefixSections(route.sections, pluginId) : [],
    });
  }
}
