import type {
  PluginTool,
  ServicePluginContext,
  JobContext,
} from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import type { SiteBuilder } from "../lib/site-builder";
import type { SiteContentService } from "../lib/site-content-service";
import type { SiteBuilderConfig } from "../config";
import type { RouteRegistry } from "../lib/route-registry";
import { z } from "@brains/utils";
import { GenerateOptionsSchema } from "../types/content-schemas";

const buildSiteInputSchema = z.object({
  environment: z
    .enum(["preview", "production"])
    .optional()
    .describe(
      "Build environment (defaults to production, or preview if configured)",
    ),
  clean: z
    .boolean()
    .default(true)
    .describe("Clean output directory before building"),
  includeAssets: z
    .boolean()
    .default(true)
    .describe("Include static assets in build"),
});

export function createSiteBuilderTools(
  getSiteBuilder: () => SiteBuilder | undefined,
  getSiteContentService: () => SiteContentService | undefined,
  pluginContext: ServicePluginContext,
  pluginId: string,
  config: SiteBuilderConfig,
  routeRegistry: RouteRegistry,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "generate",
      "Generate content for all routes, a specific route, or a specific section",
      GenerateOptionsSchema,
      async (input, context) => {
        const siteContentService = getSiteContentService();
        if (!siteContentService) {
          return {
            success: false,
            error: "Site content service not initialized",
          };
        }

        // Validate that sectionId is only used with routeId
        if (input.sectionId && !input.routeId) {
          return {
            success: false,
            error: "sectionId requires routeId to be specified",
          };
        }

        // Create job metadata
        const metadata: JobContext = {
          rootJobId: `generate-${Date.now()}`,
          progressToken: context.progressToken,
          pluginId,
          operationType: "content_operations",
          // Routing context for progress messages
          interfaceType: context.interfaceType,
          channelId: context.channelId,
        };

        const result = await siteContentService.generateContent(
          input,
          metadata,
        );

        const message = `Generated ${result.queuedSections} of ${result.totalSections} sections. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`;

        // Note: Omit 'formatted' for async jobs - progress events will show actual status
        // This prevents showing stale status in the agent response
        return {
          success: true,
          message,
          data: {
            batchId: result.batchId,
            jobsQueued: result.queuedSections,
            totalSections: result.totalSections,
            jobs: result.jobs,
          },
        };
      },
    ),
    createTypedTool(
      pluginId,
      "build-site",
      "Build a static site from registered routes",
      buildSiteInputSchema,
      async (input, context) => {
        const siteBuilder = getSiteBuilder();
        if (!siteBuilder) {
          return {
            success: false,
            error: "Site builder not initialized",
          };
        }

        // Determine default environment based on config
        const defaultEnv = config.previewOutputDir ? "preview" : "production";
        const environment = input.environment ?? defaultEnv;

        // Validate environment is available
        if (environment === "preview" && !config.previewOutputDir) {
          return {
            success: false,
            error: "Preview environment not configured",
          };
        }

        // Determine output directory based on environment
        const outputDir =
          environment === "production"
            ? config.productionOutputDir
            : (config.previewOutputDir ?? config.productionOutputDir); // Fallback to production (guard above ensures this exists for preview)

        // Enqueue the build job - pass toolContext for progress routing
        const jobId = await pluginContext.jobs.enqueue(
          "site-build",
          {
            environment,
            outputDir,
            workingDir: config.workingDir,
            enableContentGeneration: false,
            siteConfig: {
              ...config.siteInfo,
              ...(config.analyticsScript && {
                analyticsScript: config.analyticsScript,
              }),
            },
          },
          context,
          {
            source: `plugin:${pluginId}`,
            metadata: {
              progressToken: context.progressToken,
              operationType: "content_operations",
              pluginId,
            },
          },
        );

        // Note: Omit 'formatted' for async jobs - progress events will show actual status
        // This prevents showing stale "Status: queued" in the agent response
        return {
          success: true,
          message: `Site build job queued for ${environment} environment`,
          data: {
            jobId,
            environment,
          },
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
