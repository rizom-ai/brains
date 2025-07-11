import { BasePlugin } from "@brains/plugin-utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { ProgressEventContext } from "@brains/db";
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
import {
  ContentManager,
  GenerateOptionsSchema,
} from "@brains/content-management";
import {
  SiteOperations,
  PromoteOptionsSchema,
  RollbackOptionsSchema,
} from "./content-management";
import { dashboardTemplate } from "./templates/dashboard";
import { DashboardFormatter } from "./templates/dashboard/formatter";
import { SiteBuilderInitializationError, SiteBuildError } from "./errors";
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
    context.registerTemplate("dashboard", dashboardTemplate);
    this.logger.debug("Registered dashboard template");

    // Register dashboard route
    // TODO: Refactor this pattern - templates with formatters should automatically
    // provide default content when no contentEntity is specified. The preact-builder
    // should check if a template has a formatter and call formatter.parse("") or
    // a getDefaultContent() method to get initial data.
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
    this.contentManager = ContentManager.getInstance(
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

    // Generate tool - generates content for pages without building
    tools.push(
      this.createTool(
        "generate",
        "Generate content for pages that don't have it",
        {
          page: z
            .string()
            .optional()
            .describe("Optional: specific page filter"),
          section: z
            .string()
            .optional()
            .describe("Optional: specific section filter"),
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

          // Parse and validate input
          const options = GenerateOptionsSchema.parse(input);

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
            if (options.pageId && route.id !== options.pageId) continue;

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

          // Get batch ID using generateAll with filters
          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "mcp-user",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
          };

          const batchId = await this.contentManager.generateAll(
            { ...options, source: "plugin:site-builder", metadata },
            routes,
            templateResolver,
            "site-content-preview",
            this.config.siteConfig,
          );

          return {
            status: "queued",
            message: `Generating ${sectionsToGenerate} section${sectionsToGenerate !== 1 ? "s" : ""}`,
            batchId,
            tip: "Use the status tool to check progress of this operation.",
          };
        },
      ),
    );

    // Build tool - now uses job queue for async processing
    tools.push(
      this.createTool(
        "build",
        "Build a static site from registered pages",
        {
          environment: z
            .enum(["preview", "production"])
            .default("preview")
            .describe("Build environment: preview (default) or production"),
          async: z
            .boolean()
            .default(true)
            .describe("Run asynchronously via job queue (default: true)"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }

          // Parse input for environment option
          const { environment = "preview", async = true } = input as {
            environment?: "preview" | "production";
            async?: boolean;
          };

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

          if (async) {
            // Queue the job for async processing
            const jobId = await this.context.enqueueJob("site-build", jobData, {
              priority: 5,
            });

            return {
              status: "queued",
              message: `Site build for ${environment} environment queued`,
              jobId,
              outputDir,
              tip: "Use the status tool to check progress of this operation.",
            };
          } else {
            // Run synchronously (for backward compatibility)
            if (!this.siteBuilder) {
              throw new Error("Site builder not initialized");
            }

            try {
              const result = await this.siteBuilder.build(
                jobData,
                context?.sendProgress,
              );

              return {
                success: result.success,
                routesBuilt: result.routesBuilt,
                outputDir,
                environment,
                errors: result.errors,
                warnings: result.warnings,
              };
            } catch (error) {
              const buildError = new SiteBuildError(
                "Site build failed",
                error,
                {
                  tool: "build",
                  outputDir,
                  environment,
                },
              );
              const message = buildError.message;
              return {
                success: false,
                error: message,
              };
            }
          }
        },
        "anchor", // Internal tool - modifies filesystem
      ),
    );

    // List pages tool
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
          page: z
            .string()
            .optional()
            .describe("Optional: specific page filter"),
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
          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "system",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
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
        "promote-all",
        "Promote all preview content to production",
        {},
        async (_input, context): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Create metadata from context
          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "system",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
          };

          const batchId = await this.siteOperations.promoteAll(metadata);

          return {
            status: "queued",
            message: "Promotion of all preview content queued.",
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
          page: z
            .string()
            .optional()
            .describe("Optional: specific page filter"),
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
          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "system",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
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

    tools.push(
      this.createTool(
        "rollback-all",
        "Remove all production content (rollback to preview-only)",
        {},
        async (_input, context): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Create metadata from context
          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "system",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
          };

          const batchId = await this.siteOperations.rollbackAll(metadata);

          return {
            status: "queued",
            message: "Rollback of all production content queued.",
            batchId,
            tip: "Use the status tool to check progress of this operation.",
          };
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    // Build site tool - combines content generation and site building
    tools.push(
      this.createTool(
        "build-site",
        "Generate content and build site in one operation",
        {
          environment: z
            .enum(["preview", "production"])
            .default("preview")
            .describe("Build environment: preview (default) or production"),
        },
        async (input): Promise<Record<string, unknown>> => {
          if (!this.context) {
            throw new Error("Plugin context not initialized");
          }

          const { environment = "preview" } = input as {
            environment?: "preview" | "production";
          };

          const config = this.config;
          const outputDir =
            environment === "production"
              ? config.productionOutputDir
              : config.previewOutputDir;

          // Queue the build job with content generation enabled
          const jobId = await this.context.enqueueJob(
            "site-build",
            {
              environment,
              outputDir,
              workingDir: config.workingDir,
              enableContentGeneration: true,
              siteConfig: config.siteConfig ?? {
                title: "Personal Brain",
                description: "A knowledge management system",
              },
            },
            { priority: 5 },
          );

          return {
            status: "queued",
            message: `Site build with content generation for ${environment} environment queued`,
            jobId,
            outputDir,
            tip: "This will generate all missing content and build the site. Use the status tool to check progress.",
          };
        },
        "anchor", // Internal tool - modifies filesystem and entities
      ),
    );

    // Generate all tool - generates content for all sections across all pages
    tools.push(
      this.createTool(
        "generate-all",
        "Generate content for all sections across all pages",
        {
          dryRun: z
            .boolean()
            .optional()
            .default(false)
            .describe("Preview changes without executing"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.contentManager || !this.context) {
            throw new Error("Content manager not initialized");
          }

          // Parse and validate input
          const options = GenerateOptionsSchema.parse(input);

          // Get all registered routes
          const routes = this.context.listRoutes();

          // Count total sections for user feedback
          let totalSections = 0;
          for (const route of routes) {
            totalSections += route.sections.length;
          }

          // Always use async for better UX
          const templateResolver = (section: SectionDefinition): string => {
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }
            return section.template;
          };

          const metadata: ProgressEventContext = {
            interfaceId: context?.interfaceId || "mcp",
            userId: context?.userId || "system",
            roomId: context?.roomId,
            progressToken: context?.progressToken,
            pluginId: this.id,
          };

          const batchId = await this.contentManager.generateAll(
            { ...options, source: "plugin:site-builder", metadata },
            routes,
            templateResolver,
            "site-content-preview",
            this.config.siteConfig,
          );

          // Return user-friendly response
          return {
            status: "queued",
            message: `Generating ${totalSections} sections.`,
            batchId,
            totalSections,
            tip:
              totalSections > 0
                ? "This operation is running in the background."
                : "No sections to generate.",
          };
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    return tools;
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
