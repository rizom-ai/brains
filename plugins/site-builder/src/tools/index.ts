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
import {
  PromoteOptionsSchema,
  RollbackOptionsSchema,
} from "../lib/site-content-service";
import { z } from "zod";
import { GenerateOptionsSchema } from "@brains/plugins";

export function createSiteBuilderTools(
  getSiteBuilder: () => SiteBuilder | undefined,
  getSiteContentService: () => SiteContentService | undefined,
  pluginContext: ServicePluginContext,
  pluginId: string,
  config: SiteBuilderConfig,
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
        const siteContentService = getSiteContentService();
        if (!siteContentService) {
          throw new Error("Site content service not initialized");
        }

        // Parse and validate input using the schema
        const options = GenerateOptionsSchema.parse(input);

        // Validate that sectionId is only used with routeId
        if (options.sectionId && !options.routeId) {
          return {
            status: "error",
            message: "sectionId requires routeId to be specified",
          };
        }

        // Create job metadata
        const metadata: JobContext = {
          interfaceType: context.interfaceType,
          userId: context.userId,
          channelId: context.channelId,
          progressToken: context.progressToken,
          pluginId,
          operationType: "content_operations",
        };

        const result = await siteContentService.generateContent(
          options,
          metadata,
        );

        return {
          status: "queued",
          message: `Generated ${result.queuedSections} of ${result.totalSections} sections`,
          batchId: result.batchId,
          jobsQueued: result.queuedSections,
          totalSections: result.totalSections,
          jobs: result.jobs,
          tip:
            result.queuedSections > 0
              ? "Use the status tool to check progress of this batch operation."
              : "No new content to generate.",
        };
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
            ? config.productionOutputDir || "./dist/site-production"
            : config.previewOutputDir || "./dist/site-preview";

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
              interfaceType: context.interfaceType,
              userId: context?.userId ?? "system",
              channelId: context?.channelId,
              progressToken: context?.progressToken,
              operationType: "content_operations",
              pluginId,
            },
          },
        );

        return {
          status: "queued",
          message: `Site build job queued for ${params.environment} environment`,
          jobId,
          environment: params.environment,
          tip: "Use getJobStatus tool to check progress of this build operation",
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
        const routes = pluginContext.listRoutes();

        return {
          success: true,
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
          templates: templates.map((template) => ({
            name: template.name,
            description: template.description,
            hasWebRenderer: !!template.renderers.web,
          })),
          count: templates.length,
        };
      },
    },
    {
      name: `${pluginId}:promote-content`,
      description: "Promote preview content to production",
      inputSchema: {
        routeId: z
          .string()
          .optional()
          .describe("Optional: specific route ID to promote"),
        sectionId: z
          .string()
          .optional()
          .describe("Optional: specific section ID to promote"),
        sections: z
          .array(z.string())
          .optional()
          .describe("Optional: array of section IDs to promote"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Preview changes without executing"),
      },
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const promoteOptions = PromoteOptionsSchema.parse(input);

        const siteContentService = getSiteContentService();
        if (!siteContentService) {
          throw new Error("Site content service not initialized");
        }

        // Create job metadata
        const metadata: JobContext = {
          interfaceType: context.interfaceType,
          userId: context.userId,
          channelId: context.channelId,
          progressToken: context.progressToken,
          pluginId,
          operationType: "content_operations",
        };

        const batchId = await siteContentService.promoteContent(
          promoteOptions,
          metadata,
        );

        return {
          status: "queued",
          message: "Promotion operation queued.",
          batchId,
          tip: "Use the status tool to check progress of this operation.",
        };
      },
    },
    {
      name: `${pluginId}:rollback-content`,
      description: "Remove production content (rollback to preview-only)",
      inputSchema: {
        routeId: z
          .string()
          .optional()
          .describe("Optional: specific route ID to rollback"),
        sectionId: z
          .string()
          .optional()
          .describe("Optional: specific section ID to rollback"),
        sections: z
          .array(z.string())
          .optional()
          .describe("Optional: array of section IDs to rollback"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Preview changes without executing"),
      },
      visibility: "anchor",
      handler: async (
        input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const rollbackOptions = RollbackOptionsSchema.parse(input);

        const siteContentService = getSiteContentService();
        if (!siteContentService) {
          throw new Error("Site content service not initialized");
        }

        // Create job metadata
        const metadata: JobContext = {
          interfaceType: context.interfaceType,
          userId: context.userId,
          channelId: context.channelId,
          progressToken: context.progressToken,
          pluginId,
          operationType: "content_operations",
        };

        const batchId = await siteContentService.rollbackContent(
          rollbackOptions,
          metadata,
        );

        return {
          status: "queued",
          message: "Rollback operation queued.",
          batchId,
          tip: "Use the status tool to check progress of this operation.",
        };
      },
    },
  ];
}
