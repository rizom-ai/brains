import { BasePlugin } from "@brains/utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
  RouteDefinition,
  SectionDefinition,
  ContentTemplate,
} from "@brains/types";
import {
  RouteDefinitionSchema,
  TemplateDefinitionSchema,
  siteContentPreviewSchema,
  siteContentProductionSchema,
} from "@brains/types";
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
import packageJson from "../package.json";

/**
 * Configuration schema for the site builder plugin
 */
const siteBuilderConfigSchema = z.object({
  outputDir: z.string().describe("Output directory for built sites"),
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
    .record(TemplateDefinitionSchema)
    .optional()
    .describe("Template definitions to register"),
  routes: z
    .array(RouteDefinitionSchema)
    .optional()
    .describe("Routes to register"),
  environment: z.enum(["preview", "production"]).default("preview").optional(),
});

type SiteBuilderConfig = z.infer<typeof siteBuilderConfigSchema>;

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends BasePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentManager?: SiteContentManager;

  constructor(config: unknown = {}) {
    super("site-builder", packageJson, config, siteBuilderConfigSchema);
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
    this.logger?.debug("Registered site-content-preview entity type");

    context.registerEntityType(
      "site-content-production",
      siteContentProductionSchema,
      siteContentProductionAdapter,
    );
    this.logger?.debug("Registered site-content-production entity type");

    // Register built-in dashboard template using the standard method
    // This will register it with both ContentRegistry and ViewRegistry
    context.registerTemplates({
      dashboard: dashboardTemplate,
    });
    this.logger?.debug("Registered dashboard template");

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
    this.logger?.debug("Registered dashboard route");

    // Register templates if provided
    if (this.config.templates) {
      context.registerTemplates(this.config.templates);
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
    this.siteContentManager = new SiteContentManager(
      context.entityService,
      this.logger?.child("SiteContentManager"),
    );

    // Register site builder in the registry for other plugins to use
    context.registry.register("siteBuilder", () => this.siteBuilder);
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
            throw new Error("Site content manager not initialized");
          }

          // Parse and validate input
          const options = GenerateOptionsSchema.parse(input);

          // Get all registered routes
          const routes = this.context.viewRegistry.listRoutes();

          // Create the content generation callback
          const generateCallback = async (
            route: RouteDefinition,
            section: SectionDefinition,
          ): Promise<{
            content: string;
          }> => {
            const config = this.config;

            // Get the content template
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }

            // Templates are registered with site-builder prefix
            const templateName = section.template.includes(":")
              ? section.template
              : `site-builder:${section.template}`;

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            const template: ContentTemplate | null =
              this.context.contentGenerationService.getTemplate(templateName);

            if (!template) {
              throw new Error(`Template not found: ${templateName}`);
            }

            // Use the plugin context's generateContent method
            const generatedContent = await this.context.generateContent({
              schema: template.schema,
              prompt: template.basePrompt,
              contentType: templateName,
              context: {
                data: {
                  pageTitle: route.title,
                  pageDescription: route.description,
                  sectionId: section.id,
                  ...(config.siteConfig ?? {
                    title: "Personal Brain",
                    description: "A knowledge management system",
                  }),
                },
              },
            });

            // Format content using the template's formatter
            const formattedContent = template.formatter
              ? template.formatter.format(generatedContent)
              : typeof generatedContent === "string"
                ? generatedContent
                : JSON.stringify(generatedContent);

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
          const result = await this.siteContentManager.generate(
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
        {},
        async (_input, context): Promise<Record<string, unknown>> => {
          if (!this.siteBuilder) {
            throw new Error("Site builder not initialized");
          }

          // Use the plugin's configuration
          const config = this.config;

          try {
            const result = await this.siteBuilder.build(
              {
                outputDir: config.outputDir,
                workingDir: config.workingDir,
                enableContentGeneration: false,
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
              outputDir: config.outputDir,
              errors: result.errors,
              warnings: result.warnings,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
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
          const routes = this.context.viewRegistry.listRoutes();

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
          const templates = this.context.viewRegistry.listViewTemplates();

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
          const result = await this.siteContentManager.promote(options);
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
          const result = await this.siteContentManager.rollback(options);
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
            currentContent?: string,
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

            // Find the template for this page/section by looking through routes
            const routes = this.context.viewRegistry.listRoutes();
            let template: ContentTemplate | null = null;
            let templateName = "";

            // Find the matching route and section
            for (const route of routes) {
              if (route.path.includes(page) || route.path === `/${page}`) {
                const matchingSection = route.sections.find(
                  (s) => s.id === section,
                );
                if (matchingSection?.template) {
                  templateName = matchingSection.template.includes(":")
                    ? matchingSection.template
                    : `site-builder:${matchingSection.template}`;
                  template =
                    this.context.contentGenerationService.getTemplate(
                      templateName,
                    );
                  break;
                }
              }
            }

            if (!template) {
              throw new Error(
                `Template not found for page: ${page}, section: ${section}`,
              );
            }

            // Prepare the prompt based on mode
            let effectivePrompt = template.basePrompt;
            if (mode === "with-current" && currentContent) {
              effectivePrompt = `${template.basePrompt}\n\nCurrent content to improve:\n${currentContent}`;
            }

            // Generate content using the template
            const generatedContent = await this.context.generateContent({
              schema: template.schema,
              prompt: effectivePrompt,
              contentType: templateName,
              context: {
                data: {
                  pageTitle: page,
                  sectionId: section,
                  regenerationMode: mode,
                  ...(config.siteConfig ?? {
                    title: "Personal Brain",
                    description: "A knowledge management system",
                  }),
                },
              },
            });

            // Format content using the template's formatter
            const formattedContent = template.formatter
              ? template.formatter.format(generatedContent)
              : typeof generatedContent === "string"
                ? generatedContent
                : JSON.stringify(generatedContent);

            return {
              entityId: `${entityType}:${page}:${section}`,
              content: formattedContent,
            };
          };

          const result = await this.siteContentManager.regenerate(
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
          const routes = this.context.viewRegistry.listRoutes();

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

            // Get the content template
            if (!section.template) {
              throw new Error(
                `No template specified for section ${section.id}`,
              );
            }

            // Templates are registered with site-builder prefix
            const templateName = section.template.includes(":")
              ? section.template
              : `site-builder:${section.template}`;

            if (!this.context) {
              throw new Error("Plugin context not available");
            }

            const template: ContentTemplate | null =
              this.context.contentGenerationService.getTemplate(templateName);

            if (!template) {
              throw new Error(`Template not found: ${templateName}`);
            }

            // Use the plugin context's generateContent method
            const generatedContent = await this.context.generateContent({
              schema: template.schema,
              prompt: template.basePrompt,
              contentType: templateName,
              context: {
                data: {
                  pageTitle: route.title,
                  pageDescription: route.description,
                  sectionId: section.id,
                  ...(config.siteConfig ?? {
                    title: "Personal Brain",
                    description: "A knowledge management system",
                  }),
                },
              },
            });

            // Format content using the template's formatter
            const formattedContent = template.formatter
              ? template.formatter.format(generatedContent)
              : typeof generatedContent === "string"
                ? generatedContent
                : JSON.stringify(generatedContent);

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

          const result = await this.siteContentManager.generateAll(
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
            currentContent?: string,
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

            // Find the template for this page/section by looking through routes
            const routes = this.context.viewRegistry.listRoutes();
            let template: ContentTemplate | null = null;
            let templateName = "";

            // Find the matching route and section
            for (const route of routes) {
              if (route.path.includes(page) || route.path === `/${page}`) {
                const matchingSection = route.sections.find(
                  (s) => s.id === section,
                );
                if (matchingSection?.template) {
                  templateName = matchingSection.template.includes(":")
                    ? matchingSection.template
                    : `site-builder:${matchingSection.template}`;
                  template =
                    this.context.contentGenerationService.getTemplate(
                      templateName,
                    );
                  break;
                }
              }
            }

            if (!template) {
              throw new Error(
                `Template not found for page: ${page}, section: ${section}`,
              );
            }

            // Prepare the prompt based on mode
            let effectivePrompt = template.basePrompt;
            if (mode === "with-current" && currentContent) {
              effectivePrompt = `${template.basePrompt}\n\nCurrent content to improve:\n${currentContent}`;
            }

            // Generate content using the template
            const generatedContent = await this.context.generateContent({
              schema: template.schema,
              prompt: effectivePrompt,
              contentType: templateName,
              context: {
                data: {
                  pageTitle: page,
                  sectionId: section,
                  regenerationMode: mode,
                  ...(config.siteConfig ?? {
                    title: "Personal Brain",
                    description: "A knowledge management system",
                  }),
                },
              },
            });

            // Format content using the template's formatter
            const formattedContent = template.formatter
              ? template.formatter.format(generatedContent)
              : typeof generatedContent === "string"
                ? generatedContent
                : JSON.stringify(generatedContent);

            return {
              entityId: `${entityType}:${page}:${section}`,
              content: formattedContent,
            };
          };

          const result = await this.siteContentManager.regenerateAll(
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
export function siteBuilderPlugin(config?: unknown): SiteBuilderPlugin {
  return new SiteBuilderPlugin(config);
}
