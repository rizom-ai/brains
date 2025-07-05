import { BasePlugin } from "@brains/plugin-utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { Template } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { ProgressNotification } from "@brains/utils";
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

          // Create the content generation callback
          const generateCallback = async (
            route: RouteDefinition,
            section: SectionDefinition,
            progress: ProgressNotification,
          ): Promise<{
            content: string;
          }> => {
            const config = this.config;

            // Validate section has template
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            // Use generateWithRoute which returns formatted string
            const formattedContent = await this.context.generateWithRoute(
              route,
              section,
              {
                current: progress.progress,
                total: progress.total ?? 100,
                message: progress.message ?? "Generating content",
              },
              {
                ...(config.siteConfig ?? {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                }),
              },
            );

            // Save as entity with required metadata
            if (!section.contentEntity?.query) {
              throw new Error(
                `Site content entity requires query data for page and section`,
              );
            }

            const { contentEntity } = section;
            if (!contentEntity.query) {
              throw new Error(
                `Site content entity requires query data for page and section`,
              );
            }

            return {
              content: formattedContent,
            };
          };

          // Use the shared content manager with progress reporting
          const result = await this.contentManager.generateSync(
            options,
            routes,
            generateCallback,
            "site-content-preview",
          );

          // Report progress if context is available
          if (context?.sendProgress) {
            await context.sendProgress({
              message:
                result.message ??
                `Generated content for ${result.sectionsGenerated} sections`,
              progress: 100,
              total: 100,
            });
          }

          return result;
        },
      ),
    );

    // Build tool - builds the site without content generation
    tools.push(
      this.createTool(
        "build",
        "Build a static site from registered pages",
        {
          environment: z
            .enum(["preview", "production"])
            .default("preview")
            .describe("Build environment: preview (default) or production"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteBuilder) {
            throw new Error("Site builder not initialized");
          }

          // Parse input for environment option
          const environment =
            (input as { environment?: "preview" | "production" }).environment ??
            "preview";

          // Use the plugin's configuration
          const config = this.config;

          // Choose output directory based on environment
          const outputDir =
            environment === "production"
              ? config.productionOutputDir
              : config.previewOutputDir;

          try {
            const result = await this.siteBuilder.build(
              {
                outputDir,
                workingDir: config.workingDir,
                enableContentGeneration: false,
                environment,
                siteConfig: config.siteConfig ?? {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                },
              },
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
            const buildError = new SiteBuildError("Site build failed", error, {
              tool: "build",
              outputDir,
              environment,
            });
            const message = buildError.message;
            return {
              success: false,
              error: message,
            };
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
        async (input): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Parse and validate input
          const options = PromoteOptionsSchema.parse(input);
          const result = await this.siteOperations.promoteSync(options);
          return result;
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    tools.push(
      this.createTool(
        "promote-all",
        "Promote all preview content to production",
        {},
        async (): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          const result = await this.siteOperations.promoteAllSync();
          return result;
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
        async (input): Promise<Record<string, unknown>> => {
          if (!this.siteOperations) {
            throw new Error("Site operations not initialized");
          }

          // Parse and validate input
          const options = RollbackOptionsSchema.parse(input);
          const result = await this.siteOperations.rollbackSync(options);
          return result;
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    // Generate all tool - generates content for all sections across all pages
    tools.push(
      this.createTool(
        "generate-all",
        "Generate content for all sections across all pages",
        {},
        async (_input, context): Promise<Record<string, unknown>> => {
          if (!this.contentManager || !this.context) {
            throw new Error("Content manager not initialized");
          }

          // Create a safe progress reporter
          const reportProgress = async (notification: {
            message: string;
            progress: number;
            total: number;
          }): Promise<void> => {
            if (context?.sendProgress) {
              await context.sendProgress(notification);
            }
          };

          // Get all registered routes
          const routes = this.context.listRoutes();

          // Create the content generation callback (reuse from generate tool)
          const generateCallback = async (
            route: RouteDefinition,
            section: SectionDefinition,
            progress: ProgressNotification,
          ): Promise<{
            content: string;
          }> => {
            // Report progress
            const progressPercent = Math.round(
              (progress.progress / (progress.total ?? 100)) * 100,
            );
            await reportProgress({
              message: progress.message ?? "Generating content",
              progress: progressPercent,
              total: 100,
            });
            const config = this.config;

            // Validate section has template
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            // Use generateWithRoute to get properly formatted string content
            const formattedContent = await this.context.generateWithRoute(
              route,
              section,
              {
                current: progress.progress,
                total: progress.total ?? 100,
                message: progress.message ?? "Generating content",
              },
              {
                ...(config.siteConfig ?? {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                }),
              },
            );

            // Save as entity with required metadata
            if (!section.contentEntity?.query) {
              throw new Error(
                `Site content entity requires query data for page and section`,
              );
            }

            const { contentEntity } = section;
            if (!contentEntity.query) {
              throw new Error(
                `Site content entity requires query data for page and section`,
              );
            }

            return {
              content: formattedContent,
            };
          };

          const result = await this.contentManager.generateSync(
            { dryRun: false },
            routes,
            generateCallback,
            "site-content-preview",
          );

          return result;
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
