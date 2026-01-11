import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
  JobContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import type { SiteBuilder } from "../lib/site-builder";
import type { SiteContentService } from "../lib/site-content-service";
import type { SiteBuilderConfig } from "../config";
import type { RouteRegistry } from "../lib/route-registry";
import { z, formatAsList } from "@brains/utils";
import { GenerateOptionsSchema } from "../types/content-schemas";

export function createSiteBuilderTools(
  getSiteBuilder: () => SiteBuilder | undefined,
  getSiteContentService: () => SiteContentService | undefined,
  pluginContext: ServicePluginContext,
  pluginId: string,
  config: SiteBuilderConfig,
  routeRegistry: RouteRegistry,
): PluginTool[] {
  return [
    createTool(
      pluginId,
      "generate",
      "Generate content for all routes, a specific route, or a specific section",
      {
        routeId: z
          .string()
          .optional()
          .describe(
            "Optional: specific route ID (generates all sections for this route)",
          ),
        sectionId: z
          .string()
          .optional()
          .describe("Optional: specific section ID (requires routeId)"),
        force: z
          .boolean()
          .default(false)
          .describe("Optional: regenerate existing content"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Optional: preview changes without executing"),
      },
      async (input: unknown, context: ToolContext) => {
        try {
          const siteContentService = getSiteContentService();
          if (!siteContentService) {
            return {
              success: false,
              message: "Site content service not initialized",
              formatted: "_Error: Site content service not initialized_",
            };
          }

          // Parse and validate input using the schema
          let options;
          try {
            options = GenerateOptionsSchema.parse(input);
          } catch (error) {
            const msg = `Invalid input parameters: ${error instanceof Error ? error.message : String(error)}`;
            return {
              success: false,
              message: msg,
              formatted: `_Error: ${msg}_`,
            };
          }

          // Validate that sectionId is only used with routeId
          if (options.sectionId && !options.routeId) {
            return {
              success: false,
              message: "sectionId requires routeId to be specified",
              formatted: "_Error: sectionId requires routeId to be specified_",
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
            options,
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
        } catch (error) {
          const msg = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
          return {
            success: false,
            message: msg,
            formatted: `_Error: ${msg}_`,
          };
        }
      },
    ),
    createTool(
      pluginId,
      "build-site",
      "Build a static site from registered routes",
      {
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
      },
      async (input: unknown, context: ToolContext) => {
        const buildSchema = z.object({
          environment: z.enum(["preview", "production"]).optional(),
          clean: z.boolean().default(true),
          includeAssets: z.boolean().default(true),
        });
        const params = buildSchema.parse(input);

        const siteBuilder = getSiteBuilder();
        if (!siteBuilder) {
          throw new Error("Site builder not initialized");
        }

        // Determine default environment based on config
        const defaultEnv = config.previewOutputDir ? "preview" : "production";
        const environment = params.environment ?? defaultEnv;

        // Validate environment is available
        if (environment === "preview" && !config.previewOutputDir) {
          throw new Error("Preview environment not configured");
        }

        // Determine output directory based on environment
        const outputDir =
          environment === "production"
            ? config.productionOutputDir
            : (config.previewOutputDir ?? config.productionOutputDir); // Fallback to production (guard above ensures this exists for preview)

        // Enqueue the build job - pass toolContext for progress routing
        const jobId = await pluginContext.enqueueJob(
          "site-build",
          {
            environment,
            outputDir,
            workingDir: config.workingDir,
            enableContentGeneration: false,
            siteConfig: config.siteInfo,
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
    createTool(
      pluginId,
      "list_routes",
      "List all registered routes",
      {},
      async () => {
        const routes = routeRegistry.list();

        const formatted = formatAsList(routes, {
          title: (r) => `${r.title} (${r.path})`,
          subtitle: (r) => `${r.sections.length} sections`,
          header: `## Routes (${routes.length})`,
        });

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
          formatted,
        };
      },
      { visibility: "public" },
    ),
    createTool(
      pluginId,
      "list_templates",
      "List all registered view templates",
      {},
      async () => {
        const templates = pluginContext.listViewTemplates();

        const formatted = formatAsList(templates, {
          title: (t) => t.name,
          subtitle: (t) => t.description ?? "No description",
          header: `## Templates (${templates.length})`,
        });

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
          formatted,
        };
      },
      { visibility: "public" },
    ),
  ];
}
