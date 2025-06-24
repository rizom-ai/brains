import { BasePlugin } from "@brains/utils";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
  SiteContent,
} from "@brains/types";
import { RouteDefinitionSchema, TemplateDefinitionSchema } from "@brains/types";
import { SiteBuilder } from "./site-builder";
import { z } from "zod";

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

  constructor(config: unknown = {}) {
    super(
      "site-builder",
      "Site Builder Plugin",
      "Provides static site generation capabilities",
      config,
      siteBuilderConfigSchema,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // TODO: Move this registration logic to shell
    // The shell should handle template and route registration directly,
    // making this plugin purely focused on site building functionality

    // Register templates if provided
    if (this.config.templates) {
      Object.values(this.config.templates).forEach((template) => {
        // Register with ContentRegistry (for AI generation)
        context.contentRegistry.registerContent(`${this.id}:${template.name}`, {
          template: {
            name: template.name,
            description: template.description,
            schema: template.schema,
            basePrompt: template.prompt,
            formatter: template.formatter,
          },
          formatter: template.formatter,
          schema: template.schema,
        });

        // Register with ViewRegistry (for rendering)
        if (template.component) {
          context.viewRegistry.registerViewTemplate({
            name: template.name,
            schema: template.schema,
            description: template.description,
            renderers: { web: template.component },
            interactive: template.interactive,
          });
        }
      });
    }

    // Register routes if provided
    if (this.config.routes) {
      this.config.routes.forEach((route) => {
        // Add convention-based contentEntity
        context.viewRegistry.registerRoute({
          ...route,
          sections: route.sections.map((section) => ({
            ...section,
            contentEntity: {
              entityType: "site-content",
              query: {
                page: route.id || "landing",
                section: section.id,
                environment: this.config.environment || "preview",
              },
            },
          })),
        });
      });
    }

    // Initialize the site builder with plugin context
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
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
                if (!section.contentEntity.template) {
                  this.logger?.warn(
                    `No template specified for section ${section.id}`,
                  );
                  continue;
                }

                // Templates are registered with plugin prefix, so construct the full name
                const templateName = section.contentEntity.template.includes(
                  ":",
                )
                  ? section.contentEntity.template
                  : `default-site:${section.contentEntity.template}`;

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
                // For site-content entities, we need to include the required fields
                if (
                  section.contentEntity.entityType === "site-content" &&
                  section.contentEntity.query
                ) {
                  // For site-content, construct the entity with all required fields
                  // Extract and validate environment value
                  const envValue = section.contentEntity.query["environment"];
                  const environment: "preview" | "production" =
                    envValue === "production" ? "production" : "preview";

                  const siteContentEntity: Omit<
                    SiteContent,
                    "id" | "created" | "updated"
                  > = {
                    entityType: "site-content",
                    content: formattedContent,
                    page: section.contentEntity.query["page"] as string,
                    section: section.contentEntity.query["section"] as string,
                    environment,
                  };

                  await this.context.entityService.createEntity(
                    siteContentEntity,
                  );
                } else {
                  // For other entity types, save as-is
                  await this.context.entityService.createEntity({
                    entityType: section.contentEntity.entityType,
                    content: formattedContent,
                  });
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
