import { BasePlugin } from "@brains/plugin-utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { Command, CommandResponse } from "@brains/command-registry";
import type { JobContext } from "@brains/db";
import type { Template } from "@brains/types";
import type { SectionDefinition } from "@brains/view-registry";
import { RouteDefinitionSchema } from "@brains/view-registry";
import { TemplateSchema } from "@brains/types";
import { siteContentPreviewSchema, siteContentProductionSchema } from "./types";
import { SiteBuilder } from "./site-builder";
import { z } from "zod";
import {
  siteContentPreviewAdapter,
  siteContentProductionAdapter,
} from "./entities/site-content-adapter";
import { ContentManager } from "@brains/content-management";
import {
  SiteOperations,
  PromoteOptionsSchema,
  RollbackOptionsSchema,
} from "./content-management";
import { GenerateOptionsSchema } from "@brains/content-management";
import { dashboardTemplate } from "./templates/dashboard";
import { DashboardFormatter } from "./templates/dashboard/formatter";
import { SiteBuilderInitializationError } from "./errors";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import packageJson from "../package.json";

/**
 * Configuration schema for the site builder plugin
 */
const siteBuilderConfigSchema = z.object({
  previewOutputDir: z.string().describe("Output directory for preview builds"),
  productionOutputDir: z
    .string()
    .describe("Output directory for production builds"),
  workingDir: z.string().optional().describe("Working directory for builds"),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
    })
    .default({
      title: "Personal Brain",
      description: "A knowledge management system",
    })
    .optional(),
  templates: z
    .record(TemplateSchema)
    .optional()
    .describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  environment: z.enum(["preview", "production"]).default("preview").optional(),
});

type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema>;
type SiteBuilderConfigInput = Partial<z.input<typeof siteBuilderConfigSchema>>;

const SITE_BUILDER_CONFIG_DEFAULTS = {
  previewOutputDir: "./site-preview",
  productionOutputDir: "./site-production",
} as const;

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends BasePlugin<SiteBuilderConfigInput> {
  // After validation with defaults, config is complete
  declare protected config: SiteBuilderConfig;
  private siteBuilder?: SiteBuilder;
  private siteOperations?: SiteOperations;
  private contentManager?: ContentManager;
  public readonly type = "service" as const;

  constructor(config: SiteBuilderConfigInput = {}) {
    super(
      "site-builder",
      packageJson,
      config,
      siteBuilderConfigSchema,
      SITE_BUILDER_CONFIG_DEFAULTS,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Register site content entity types
    context.registerEntityType(
      "site-content-preview",
      siteContentPreviewSchema,
      siteContentPreviewAdapter,
    );
    this.logger.debug("Registered site-content-preview entity type");

    context.registerEntityType(
      "site-content-production",
      siteContentProductionSchema,
      siteContentProductionAdapter,
    );
    this.logger.debug("Registered site-content-production entity type");

    // Register built-in dashboard template using unified method
    context.registerTemplates({ dashboard: dashboardTemplate });
    this.logger.debug("Registered dashboard template");

    // Register dashboard route
    const dashboardFormatter = new DashboardFormatter();
    context.registerRoutes(
      [
        {
          id: "dashboard",
          path: "/dashboard",
          title: "System Dashboard",
          description: "Monitor your Brain system statistics and activity",
          sections: [
            {
              id: "main",
              template: "dashboard", // Plugin prefix is added automatically
              content: dashboardFormatter.getMockData(), // Temporary: provide mock data directly
            },
          ],
        },
      ],
      {
        environment: this.config.environment ?? "preview",
      },
    );
    this.logger.debug("Registered dashboard route");

    // Register templates from configuration using unified registration
    if (this.config.templates) {
      context.registerTemplates(
        this.config.templates as Record<string, Template>,
      );
      this.logger.debug(
        `Registered ${Object.keys(this.config.templates).length} templates from config`,
      );
    }

    // Register routes if provided
    if (this.config.routes) {
      context.registerRoutes(this.config.routes, {
        environment: this.config.environment ?? "preview",
      });
    }

    // Initialize the site builder with plugin context
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
    );

    // Initialize the site operations with dependency injection
    this.siteOperations = new SiteOperations(
      context.entityService,
      this.logger.child("SiteOperations"),
      context,
    );

    // Initialize the shared content manager
    this.contentManager = new ContentManager(
      context.entityService,
      this.logger.child("ContentManager"),
      context,
    );

    // Register job handler for site builds
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      context,
    );
    context.registerJobHandler("site-build", siteBuildHandler);
    this.logger.debug("Registered site-build job handler");

    // Site builder is now encapsulated within the plugin
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    const tools: PluginTool[] = [];

    // Generate tool - generates content for routes
    tools.push(
      this.createTool(
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
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.contentManager || !this.context) {
            throw new SiteBuilderInitializationError(
              "Content manager not initialized",
              undefined,
              { tool: "generate" },
            );
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

          // Get all registered routes
          const routes = this.context.listRoutes();

          // Use the shared content manager with async generation
          const templateResolver = (section: SectionDefinition): string => {
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }
            return section.template;
          };

          // Count the sections that will be generated first
          let sectionsToGenerate = 0;
          for (const route of routes) {
            if (options.routeId && route.id !== options.routeId) continue;

            const sections = options.sectionId
              ? route.sections.filter((s) => s.id === options.sectionId)
              : route.sections;

            sectionsToGenerate += sections.length;
          }

          // If no sections to generate, return early
          if (sectionsToGenerate === 0) {
            return {
              status: "completed",
              message: "No sections to generate",
              sectionsGenerated: 0,
            };
          }

          // Generate content using the unified generate method
          const metadata: JobContext = {
            interfaceId: context?.interfaceId ?? "mcp",
            userId: context?.userId ?? "mcp-user",
            channelId: context?.channelId,
            progressToken: context?.progressToken,
            pluginId: this.id,
            operationType: "content_generation",
          };

          // Use the regular generate method and return job information
          const result = await this.contentManager.generate(
            { ...options, force: options.force },
            routes,
            templateResolver,
            "site-content-preview",
            { source: "plugin:site-builder", metadata },
            this.config.siteConfig,
          );

          return {
            status: "queued",
            message: `Generated ${result.queuedSections} of ${result.totalSections} section${result.totalSections !== 1 ? "s" : ""}`,
            batchId: result.batchId,
            jobsQueued: result.queuedSections,
            totalSections: result.totalSections,
            jobs: result.jobs.map((job) => ({
              jobId: job.jobId,
              routeId: job.routeId,
              sectionId: job.sectionId,
            })),
            tip:
              result.queuedSections > 0
                ? "Use the status tool to check progress of this batch operation."
                : "No new content to generate.",
          };
        },
      ),
    );

    // Build tool - now uses job queue for async processing
    tools.push(
      this.createTool(
        "build-site",
        "Build a static site from registered routes",
        {
          environment: z
            .enum(["preview", "production"])
            .default("preview")
            .describe("Build environment: preview (default) or production"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }

          // Parse and validate input using Zod
          const parsedInput = z
            .object({
              environment: z.enum(["preview", "production"]).default("preview"),
            })
            .parse(input);

          const { environment } = parsedInput;

          // Use the plugin's configuration
          const config = this.config;

          // Choose output directory based on environment
          const outputDir =
            environment === "production"
              ? config.productionOutputDir
              : config.previewOutputDir;

          const jobData = {
            environment,
            outputDir,
            workingDir: config.workingDir,
            enableContentGeneration: false,
            siteConfig: config.siteConfig ?? {
              title: "Personal Brain",
              description: "A knowledge management system",
            },
          };

          const metadata: JobContext = {
            interfaceId: context?.interfaceId ?? "mcp",
            userId: context?.userId ?? "mcp-user",
            channelId: context?.channelId,
            progressToken: context?.progressToken,
            pluginId: this.id,
            operationType: "site_building",
          };

          // Queue the job for async processing
          const jobId = await this.context.enqueueJob("site-build", jobData, {
            priority: 5,
            source: this.id,
            metadata,
          });

          return {
            status: "queued",
            message: `Site build for ${environment} environment queued`,
            jobId,
            outputDir,
            tip: "Use the status tool to check progress of this operation.",
          };
        },
        "anchor", // Internal tool - modifies filesystem
      ),
    );

    // List routes tool
    tools.push(
      this.createTool(
        "list_routes",
        "List all registered routes",
        {},
        async (): Promise<Record<string, unknown>> => {
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }
          const routes = this.context.listRoutes();

          return {
            success: true,
            routes: routes.map((r) => ({
              path: r.path,
              title: r.title,
              description: r.description,
              pluginId: r.pluginId,
              sections: r.sections.length,
            })),
          };
        },
        "public",
      ),
    );

    // List layouts tool
    tools.push(
      this.createTool(
        "list_templates",
        "List all registered view templates",
        {},
        async (): Promise<Record<string, unknown>> => {
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }
          const templates = this.context.listViewTemplates();

          return {
            success: true,
            templates: templates.map((t) => ({
              name: t.name,
              description: t.description,
              renderers: t.renderers,
            })),
          };
        },
        "public",
      ),
    );

    // Content management tools
    tools.push(
      this.createTool(
        "promote-content",
        "Promote preview content to production",
        {
          routeId: z
            .string()
            .optional()
            .describe("Optional: specific route filter"),
          section: z
            .string()
            .optional()
            .describe("Optional: specific section filter"),
          sections: z
            .array(z.string())
            .optional()
            .describe("Optional: batch promote multiple sections"),
          dryRun: z
            .boolean()
            .default(false)
            .describe("Optional: preview changes without executing"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Parse and validate input
          const options = PromoteOptionsSchema.parse(input);

          // Create metadata from context
          const metadata: JobContext = {
            interfaceId: context?.interfaceId ?? "mcp",
            userId: context?.userId ?? "system",
            channelId: context?.channelId,
            progressToken: context?.progressToken,
            pluginId: this.id,
            operationType: "site_building",
          };

          const batchId = await this.siteOperations.promote(options, metadata);

          return {
            status: "queued",
            message: "Promotion operation queued.",
            batchId,
            tip: "Use the status tool to check progress of this operation.",
          };
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    tools.push(
      this.createTool(
        "rollback-content",
        "Remove production content (rollback to preview-only)",
        {
          routeId: z
            .string()
            .optional()
            .describe("Optional: specific route filter"),
          section: z
            .string()
            .optional()
            .describe("Optional: specific section filter"),
          sections: z
            .array(z.string())
            .optional()
            .describe("Optional: batch rollback multiple sections"),
          dryRun: z
            .boolean()
            .default(false)
            .describe("Optional: preview changes without executing"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Parse and validate input
          const options = RollbackOptionsSchema.parse(input);

          // Create metadata from context
          const metadata: JobContext = {
            interfaceId: context?.interfaceId ?? "mcp",
            userId: context?.userId ?? "system",
            channelId: context?.channelId,
            progressToken: context?.progressToken,
            pluginId: this.id,
            operationType: "site_building",
          };

          const batchId = await this.siteOperations.rollback(options, metadata);

          return {
            status: "queued",
            message: "Rollback operation queued.",
            batchId,
            tip: "Use the status tool to check progress of this operation.",
          };
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    return tools;
  }

  /**
   * Expose site-builder commands for message interfaces
   */
  public override async getCommands(): Promise<Command[]> {
    return [
      {
        name: "generate",
        description:
          "Generate content for all routes, a specific route, or a specific section",
        usage: "/generate [routeId] [sectionId] [--force] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const force = args.includes("--force");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager || !this.context) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get routes and template resolver
            const routes = this.context.listRoutes();
            const templateResolver = (section: SectionDefinition): string => {
              if (!this.context) {
                throw new Error("Plugin context not initialized");
              }
              const viewTemplate = this.context.getViewTemplate(
                section.template,
              );
              if (!viewTemplate) {
                throw new Error(`Template not found: ${section.template}`);
              }
              return viewTemplate.name;
            };

            // Create metadata for job context
            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "content_generation",
            };

            // Use the content manager to generate content
            const result = await this.contentManager.generate(
              { routeId, sectionId, force, dryRun },
              routes,
              templateResolver,
              "site-content-preview",
              { source: "command:generate", metadata },
              this.config.siteConfig,
            );

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run completed** - No content was actually generated for ${scope}. Use \`/generate\` without --dry-run to execute.`,
              };
            }

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `🚀 **Content generation started** - Generated ${result.queuedSections} of ${result.totalSections} sections for ${scope}. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`,
              batchId: result.batchId,
              operationCount: result.queuedSections,
            };
          } catch (error) {
            this.error("Generate command failed", error);
            return {
              type: "message",
              message: `❌ **Generation failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "promote",
        description:
          "Promote all preview content, a specific route, or a specific section to production",
        usage: "/promote [routeId] [sectionId] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get filtered preview entities
            const previewEntities =
              await this.contentManager.getPreviewEntities({
                ...(routeId && { routeId }),
              });

            let entityIds: string[];
            if (sectionId) {
              // Filter by section
              entityIds = previewEntities
                .filter((e) => e.sectionId === sectionId)
                .map((e) => e.id);
            } else {
              entityIds = previewEntities.map((e) => e.id);
            }

            if (entityIds.length === 0) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `ℹ️ No preview content found to promote for ${scope}.`,
              };
            }

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would promote ${entityIds.length} preview entities to production for ${scope}. Use \`/promote\` without --dry-run to execute.`,
              };
            }

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            const batchId = await this.contentManager.promote(entityIds, {
              source: "command:promote",
              metadata,
            });

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `📤 **Promotion started** - Promoting ${entityIds.length} preview entities to production for ${scope}...`,
              batchId,
              operationCount: entityIds.length,
            };
          } catch (error) {
            this.error("Promote command failed", error);
            return {
              type: "message",
              message: `❌ **Promotion failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "rollback",
        description:
          "Rollback all production content, a specific route, or a specific section",
        usage: "/rollback [routeId] [sectionId] [--dry-run]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse command arguments
          const dryRun = args.includes("--dry-run");
          const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
          const routeId = filteredArgs[0];
          const sectionId = filteredArgs[1];

          // Validate that sectionId is only used with routeId
          if (sectionId && !routeId) {
            return {
              type: "message",
              message: "❌ sectionId requires routeId to be specified",
            };
          }

          if (!this.contentManager) {
            return {
              type: "message",
              message:
                "❌ Content manager not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Get filtered production entities
            const productionEntities =
              await this.contentManager.getProductionEntities({
                ...(routeId && { routeId }),
              });

            let entityIds: string[];
            if (sectionId) {
              // Filter by section
              entityIds = productionEntities
                .filter((e) => e.sectionId === sectionId)
                .map((e) => e.id);
            } else {
              entityIds = productionEntities.map((e) => e.id);
            }

            if (entityIds.length === 0) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `ℹ️ No production content found to rollback for ${scope}.`,
              };
            }

            if (dryRun) {
              const scope = routeId
                ? sectionId
                  ? `section ${routeId}:${sectionId}`
                  : `route ${routeId}`
                : "all routes";
              return {
                type: "message",
                message: `🔍 **Dry run** - Would rollback ${entityIds.length} production entities for ${scope}. Use \`/rollback\` without --dry-run to execute.`,
              };
            }

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            const batchId = await this.contentManager.rollback(entityIds, {
              source: "command:rollback",
              metadata,
            });

            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "batch-operation",
              message: `↩️ **Rollback started** - Rolling back ${entityIds.length} production entities for ${scope}...`,
              batchId,
              operationCount: entityIds.length,
            };
          } catch (error) {
            this.error("Rollback command failed", error);
            return {
              type: "message",
              message: `❌ **Rollback failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "build-site",
        description: "Build static site from existing content",
        usage: "/build-site [preview|production]",
        handler: async (args, context): Promise<CommandResponse> => {
          // Parse environment from args (default to preview)
          const environment = (
            args[0] === "production" ? "production" : "preview"
          ) as "preview" | "production";

          if (!this.context) {
            return {
              type: "message",
              message:
                "❌ Site builder not initialized. Please ensure the plugin is properly registered.",
            };
          }

          try {
            // Build site directly (same logic as build-site tool)
            const config = this.config;

            // Choose output directory based on environment
            const outputDir =
              environment === "production"
                ? config.productionOutputDir
                : config.previewOutputDir;

            const jobData = {
              environment,
              outputDir,
              workingDir: config.workingDir,
              enableContentGeneration: false,
              siteConfig: config.siteConfig ?? {
                title: "Personal Brain",
                description: "A knowledge management system",
              },
            };

            const metadata: JobContext = {
              interfaceId: context.interfaceType || "command",
              userId: context.userId || "command-user",
              channelId: context.channelId,
              progressToken: "", // CommandContext doesn't have messageId
              pluginId: this.id,
              operationType: "site_building",
            };

            // Queue the job for async processing
            const jobId = await this.context.enqueueJob("site-build", jobData, {
              priority: 5,
              source: "command:build-site",
              metadata,
            });

            return {
              type: "job-operation",
              message: `🔨 **Site build started** - Building ${environment} site to \`${outputDir}\`...`,
              jobId,
            };
          } catch (error) {
            this.error("Build-site command failed", error);
            return {
              type: "message",
              message: `❌ **Build failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
    ];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  /**
   * Get the site builder instance
   */
  public getSiteBuilder(): SiteBuilder | undefined {
    return this.siteBuilder;
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(
  config?: SiteBuilderConfigInput,
): SiteBuilderPlugin {
  return new SiteBuilderPlugin(config);
}
