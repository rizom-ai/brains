import { BasePlugin } from "@brains/utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
  SiteContentPreview,
  SiteContentProduction,
} from "@brains/types";
import {
  RouteDefinitionSchema,
  TemplateDefinitionSchema,
  siteContentPreviewSchema,
  siteContentProductionSchema,
  SiteContentEntityTypeSchema,
} from "@brains/types";
import { SiteBuilder } from "./site-builder";
import { z } from "zod";
import {
  siteContentPreviewAdapter,
  siteContentProductionAdapter,
} from "./entities/site-content-adapter";
import { SiteContentManager, PromoteOptionsSchema, RollbackOptionsSchema, RegenerateOptionsSchema } from "./content-management";
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
        {},
        async (_input, context): Promise<Record<string, unknown>> => {
          if (!this.siteBuilder || !this.context) {
            throw new Error("Site builder not initialized");
          }

          const config = this.config;
          let sectionsGenerated = 0;

          try {
            // Report initial progress
            await context?.sendProgress?.({
              message: "Starting content generation",
              progress: 0,
              total: 100,
            });

            // Get all registered routes
            const routes = this.context.viewRegistry.listRoutes();

            // Count total sections to generate
            let totalSections = 0;
            for (const route of routes) {
              totalSections += route.sections.filter(
                (section) =>
                  "contentEntity" in section &&
                  section.contentEntity &&
                  !("content" in section && section.content),
              ).length;
            }

            if (totalSections === 0) {
              await context?.sendProgress?.({
                message: "No content to generate",
                progress: 100,
                total: 100,
              });
              return {
                success: true,
                sectionsGenerated: 0,
                message: "No sections need content generation",
              };
            }

            let processedSections = 0;

            for (const route of routes) {
              const sectionsNeedingContent = route.sections.filter(
                (section) =>
                  "contentEntity" in section &&
                  section.contentEntity &&
                  !("content" in section && section.content),
              );

              for (const section of sectionsNeedingContent) {
                if (!section.contentEntity) continue;

                // Report progress for this section
                await context?.sendProgress?.({
                  message: `Generating content for ${route.title} - ${section.id}`,
                  progress: Math.floor(
                    (processedSections / totalSections) * 100,
                  ),
                  total: 100,
                });

                // Check if content already exists
                const existingEntities =
                  await this.context.entityService.listEntities(
                    section.contentEntity.entityType,
                    section.contentEntity.query
                      ? { filter: { metadata: section.contentEntity.query } }
                      : undefined,
                  );

                if (existingEntities.length > 0) {
                  continue; // Content already exists
                }

                // Get the content template
                if (!section.template) {
                  this.logger?.warn(
                    `No template specified for section ${section.id}`,
                  );
                  continue;
                }

                // Templates are registered with site-builder prefix
                const templateName = section.template.includes(":")
                  ? section.template
                  : `site-builder:${section.template}`;

                const template =
                  this.context.contentGenerationService.getTemplate(
                    templateName,
                  );

                if (!template) {
                  this.logger?.warn(`Template not found: ${templateName}`);
                  continue;
                }

                // Use the plugin context's generateContent method with fully qualified name
                const generatedContent = await this.context.generateContent({
                  schema: template.schema,
                  prompt: template.basePrompt,
                  contentType: templateName, // Use the fully qualified name (e.g., "default-site:landing-hero")
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
                try {
                  // Try to parse as site content entity type
                  const entityType = SiteContentEntityTypeSchema.parse(
                    section.contentEntity.entityType,
                  );

                  if (!section.contentEntity.query) {
                    throw new Error(
                      `Site content entity requires query data for page and section`,
                    );
                  }

                  // For site-content, construct the entity with all required fields
                  const siteContentEntity: Omit<
                    SiteContentPreview | SiteContentProduction,
                    "id" | "created" | "updated"
                  > = {
                    entityType,
                    content: formattedContent,
                    page: section.contentEntity.query["page"] as string,
                    section: section.contentEntity.query["section"] as string,
                  };

                  await this.context.entityService.createEntity(
                    siteContentEntity,
                  );
                } catch (error) {
                  // Log the error and skip this section
                  this.logger?.error(
                    `Failed to create entity for section ${section.id}`,
                    { error },
                  );
                  continue;
                }

                sectionsGenerated++;
                processedSections++;

                // Report progress after completing this section
                await context?.sendProgress?.({
                  message: `Completed ${section.id} (${sectionsGenerated}/${totalSections})`,
                  progress: Math.floor(
                    (processedSections / totalSections) * 100,
                  ),
                  total: 100,
                });
              }
            }

            // Final progress report
            await context?.sendProgress?.({
              message: `Content generation complete`,
              progress: 100,
              total: 100,
            });

            return {
              success: true,
              sectionsGenerated,
              message: `Generated content for ${sectionsGenerated} sections`,
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
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
          page: z.string().optional().describe("Optional: specific page filter"),
          section: z.string().optional().describe("Optional: specific section filter"),
          sections: z.array(z.string()).optional().describe("Optional: batch promote multiple sections"),
          dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
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
          page: z.string().optional().describe("Optional: specific page filter"),
          section: z.string().optional().describe("Optional: specific section filter"),
          sections: z.array(z.string()).optional().describe("Optional: batch rollback multiple sections"),
          dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
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
          environment: z.enum(["preview", "production", "both"]).default("preview").describe("Optional: target environment (default: preview)"),
          mode: z.enum(["leave", "new", "with-current"]).describe("Required: regeneration mode"),
          dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
        },
        async (input): Promise<Record<string, unknown>> => {
          if (!this.siteContentManager) {
            throw new Error("Site content manager not initialized");
          }

          // Parse and validate input
          const options = RegenerateOptionsSchema.parse(input);
          const result = await this.siteContentManager.regenerate(options);
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
