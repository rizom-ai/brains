import type {
  PluginTool,
  ToolContext,
  ToolResponse,
  ServicePluginContext,
  JobContext,
} from "@brains/plugins";
import type { SiteBuilder } from "../lib/site-builder";
import type { SiteContentService } from "../lib/site-content-service";
import type { SiteBuilderConfig } from "../config";
import type { RouteRegistry } from "../lib/route-registry";
import { z } from "zod";
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
    {
      name: `${pluginId}:generate`,
      description:
        "Generate content for all routes, a specific route, or a specific section",
      inputSchema: {
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
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        try {
          const siteContentService = getSiteContentService();
          if (!siteContentService) {
            return {
              success: false,
              message: "Site content service not initialized",
            };
          }

          // Parse and validate input using the schema
          let options;
          try {
            options = GenerateOptionsSchema.parse(input);
          } catch (error) {
            return {
              success: false,
              message: `Invalid input parameters: ${error instanceof Error ? error.message : String(error)}`,
            };
          }

          // Validate that sectionId is only used with routeId
          if (options.sectionId && !options.routeId) {
            return {
              success: false,
              message: "sectionId requires routeId to be specified",
            };
          }

          // Create job metadata
          const metadata: JobContext = {
            rootJobId: `generate-${Date.now()}`,
            progressToken: context.progressToken,
            pluginId,
            operationType: "content_operations",
          };

          const result = await siteContentService.generateContent(
            options,
            metadata,
          );

          return {
            success: true,
            message: `Generated ${result.queuedSections} of ${result.totalSections} sections. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`,
            data: {
              batchId: result.batchId,
              jobsQueued: result.queuedSections,
              totalSections: result.totalSections,
              jobs: result.jobs,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: `${pluginId}:build-site`,
      description: "Build a static site from registered routes",
      inputSchema: {
        environment: z
          .enum(["preview", "production"])
          .default("preview")
          .describe("Build environment"),
        clean: z
          .boolean()
          .default(true)
          .describe("Clean output directory before building"),
        includeAssets: z
          .boolean()
          .default(true)
          .describe("Include static assets in build"),
      },
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const buildSchema = z.object({
          environment: z.enum(["preview", "production"]).default("preview"),
          clean: z.boolean().default(true),
          includeAssets: z.boolean().default(true),
        });
        const params = buildSchema.parse(input);

        const siteBuilder = getSiteBuilder();
        if (!siteBuilder) {
          throw new Error("Site builder not initialized");
        }

        // Determine output directory based on environment
        const outputDir =
          params.environment === "production"
            ? (config.productionOutputDir ?? "./dist/site-production")
            : (config.previewOutputDir ?? "./dist/site-preview");

        // Enqueue the build job
        const jobId = await pluginContext.enqueueJob(
          "site-build",
          {
            environment: params.environment,
            outputDir,
            workingDir: config.workingDir,
            enableContentGeneration: false,
            siteConfig: config.siteConfig,
          },
          {
            source: `plugin:${pluginId}`,
            metadata: {
              rootJobId: `build-${Date.now()}`,
              progressToken: context.progressToken,
              operationType: "content_operations",
              pluginId,
            },
          },
        );

        return {
          success: true,
          message: `Site build job queued for ${params.environment} environment`,
          data: {
            jobId,
            environment: params.environment,
          },
        };
      },
    },
    {
      name: `${pluginId}:list_routes`,
      description: "List all registered routes",
      inputSchema: {},
      visibility: "public",
      handler: async (
        _input: unknown,
        _context: ToolContext,
      ): Promise<ToolResponse> => {
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
    },
    {
      name: `${pluginId}:list_templates`,
      description: "List all registered view templates",
      inputSchema: {},
      visibility: "public",
      handler: async (
        _input: unknown,
        _context: ToolContext,
      ): Promise<ToolResponse> => {
        const templates = pluginContext.listViewTemplates();

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
    },
  ];
}
