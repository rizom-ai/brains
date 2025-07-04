import { BasePlugin } from "@brains/plugin-utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { Template } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
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
  SiteContentManager,
  PromoteOptionsSchema,
  RollbackOptionsSchema,
  RegenerateOptionsSchema,
  GenerateOptionsSchema,
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
  private siteContentManager?: SiteContentManager;

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

    // Initialize the site content manager with dependency injection
    // TODO: Inconsistent PluginContext access - passing both entityService separately and context
    // Should either pass only context and access entityService through it, or extract needed methods
    this.siteContentManager = new SiteContentManager(
      context.entityService,
      this.logger.child("SiteContentManager"),
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
          if (!this.siteContentManager || !this.context) {
            throw new SiteBuilderInitializationError(
              "Site content manager not initialized",
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
                current: 1, // This will be improved when we have actual progress
                total: 1,
                message: "Generating content",
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

          // Use the content manager with progress reporting
          const result = await this.siteContentManager.generateSync(
            options,
            routes,
            generateCallback,
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
          if (!this.siteContentManager) {
            throw new Error("Site content manager not initialized");
          }

          // Parse and validate input
          const options = PromoteOptionsSchema.parse(input);
          const result = await this.siteContentManager.promoteSync(options);
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
          if (!this.siteContentManager) {
            throw new Error("Site content manager not initialized");
          }

          const result = await this.siteContentManager.promoteAllSync();
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
          if (!this.siteContentManager) {
            throw new Error("Site content manager not initialized");
          }

          // Parse and validate input
          const options = RollbackOptionsSchema.parse(input);
          const result = await this.siteContentManager.rollbackSync(options);
          return result;
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    tools.push(
      this.createTool(
        "regenerate-content",
        "Regenerate content using AI with different modes",
        {
          page: z.string().describe("Required: target page"),
          section: z.string().optional().describe("Optional: specific section"),
          environment: z
            .enum(["preview", "production", "both"])
            .default("preview")
            .describe("Optional: target environment (default: preview)"),
          mode: z
            .enum(["leave", "new", "with-current"])
            .describe("Required: regeneration mode"),
          dryRun: z
            .boolean()
            .default(false)
            .describe("Optional: preview changes without executing"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteContentManager || !this.context) {
            throw new Error("Site content manager not initialized");
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

          // Parse and validated input
          const options = RegenerateOptionsSchema.parse(input);

          // Create the regeneration callback
          const regenerateCallback = async (
            entityType: string,
            page: string,
            section: string,
            mode: "leave" | "new" | "with-current",
            progress: { current: number; total: number; message: string },
          ): Promise<{
            entityId: string;
            content: string;
          }> => {
            // Report progress
            const progressPercent = Math.round(
              (progress.current / progress.total) * 100,
            );
            await reportProgress({
              message: progress.message,
              progress: progressPercent,
              total: 100,
            });
            const config = this.config;

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            // Find the template name for this page/section
            const route = this.context.findRoute({ id: page });
            if (!route) {
              throw new Error(`Route not found for page: ${page}`);
            }

            const foundSection = route.sections.find((s) => s.id === section);
            if (!foundSection) {
              throw new Error(`Section not found: ${section} in page: ${page}`);
            }

            // Generate content using generateWithRoute to ensure proper formatting
            const formattedContent = await this.context.generateWithRoute(
              route,
              foundSection,
              {
                current: progress.current,
                total: progress.total,
                message: progress.message,
              },
              {
                regenerationMode: mode,
                ...(config.siteConfig ?? {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                }),
              },
            );

            return {
              entityId: `${entityType}:${page}:${section}`,
              content: formattedContent,
            };
          };

          const result = await this.siteContentManager.regenerateSync(
            options,
            regenerateCallback,
          );
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
          if (!this.siteContentManager || !this.context) {
            throw new Error("Site content manager not initialized");
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
            progress: { current: number; total: number; message: string },
          ): Promise<{
            content: string;
          }> => {
            // Report progress
            const progressPercent = Math.round(
              (progress.current / progress.total) * 100,
            );
            await reportProgress({
              message: progress.message,
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
                current: progress.current,
                total: progress.total,
                message: progress.message,
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

          const result = await this.siteContentManager.generateAllSync(
            routes,
            generateCallback,
          );

          return result;
        },
        "anchor", // Internal tool - modifies entities
      ),
    );

    // Regenerate all tool - regenerates all existing content
    tools.push(
      this.createTool(
        "regenerate-all",
        "Regenerate all existing content using AI with the specified mode",
        {
          mode: z
            .enum(["leave", "new", "with-current"])
            .describe("Required: regeneration mode"),
          dryRun: z
            .boolean()
            .default(false)
            .describe("Optional: preview changes without executing"),
        },
        async (input, context): Promise<Record<string, unknown>> => {
          if (!this.siteContentManager || !this.context) {
            throw new Error("Site content manager not initialized");
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

          const { mode, dryRun } = input as {
            mode: "leave" | "new" | "with-current";
            dryRun?: boolean;
          };

          // Create the regeneration callback (reuse from regenerate tool)
          const regenerateCallback = async (
            entityType: string,
            page: string,
            section: string,
            mode: "leave" | "new" | "with-current",
            progress: { current: number; total: number; message: string },
          ): Promise<{
            entityId: string;
            content: string;
          }> => {
            // Report progress
            const progressPercent = Math.round(
              (progress.current / progress.total) * 100,
            );
            await reportProgress({
              message: progress.message,
              progress: progressPercent,
              total: 100,
            });
            const config = this.config;

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            // Find the template name for this page/section
            const route = this.context.findRoute({ id: page });
            if (!route) {
              throw new Error(`Route not found for page: ${page}`);
            }

            const foundSection = route.sections.find((s) => s.id === section);
            if (!foundSection) {
              throw new Error(`Section not found: ${section} in page: ${page}`);
            }

            // Generate content using generateWithRoute to ensure proper formatting
            const formattedContent = await this.context.generateWithRoute(
              route,
              foundSection,
              {
                current: progress.current,
                total: progress.total,
                message: progress.message,
              },
              {
                regenerationMode: mode,
                ...(config.siteConfig ?? {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                }),
              },
            );

            return {
              entityId: `${entityType}:${page}:${section}`,
              content: formattedContent,
            };
          };

          const result = await this.siteContentManager.regenerateAllSync(
            mode,
            regenerateCallback,
            { dryRun: dryRun ?? false },
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
