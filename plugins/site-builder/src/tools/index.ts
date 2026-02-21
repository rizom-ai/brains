import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import type { RouteRegistry } from "../lib/route-registry";
import { z } from "@brains/utils";

const buildSiteInputSchema = z.object({
  environment: z
    .enum(["preview", "production"])
    .optional()
    .describe(
      "Build environment (defaults to production, or preview if configured)",
    ),
});

export function createSiteBuilderTools(
  pluginContext: ServicePluginContext,
  pluginId: string,
  routeRegistry: RouteRegistry,
  requestBuild: (environment?: "preview" | "production") => void,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "build-site",
      "Build a static site from registered routes",
      buildSiteInputSchema,
      async (input) => {
        requestBuild(input.environment);

        return {
          success: true,
          message: `Site build requested${input.environment ? ` for ${input.environment}` : ""} (debounced)`,
          data: {},
        };
      },
    ),
    createTypedTool(
      pluginId,
      "list_routes",
      "List all registered routes",
      z.object({}),
      async () => {
        const routes = routeRegistry.list();

        return {
          success: true,
          message: `Found ${routes.length} registered routes`,
          data: {
            routes: routes.map((route) => ({
              id: route.id,
              path: route.path,
              title: route.title,
              description: route.description,
              sections: route.sections.map((section) => ({
                id: section.id,
                template: section.template,
              })),
            })),
            count: routes.length,
          },
        };
      },
      { visibility: "public" },
    ),
    createTypedTool(
      pluginId,
      "list_templates",
      "List all registered view templates",
      z.object({}),
      async () => {
        const templates = pluginContext.views.list();

        return {
          success: true,
          message: `Found ${templates.length} registered templates`,
          data: {
            templates: templates.map((template) => ({
              name: template.name,
              description: template.description,
              hasWebRenderer: !!template.renderers.web,
            })),
            count: templates.length,
          },
        };
      },
      { visibility: "public" },
    ),
  ];
}
