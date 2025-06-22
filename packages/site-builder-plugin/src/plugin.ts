import { BasePlugin } from "@brains/utils";
import type { PluginContext, PluginTool, PluginResource } from "@brains/types";
import { SiteBuilder } from "./site-builder";
import { PageRegistry } from "./page-registry";
import { LayoutRegistry } from "./layout-registry";
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

            // Get all registered pages
            const pageRegistry = this.siteBuilder.getPageRegistry();
            const pages = pageRegistry.list();

            // Count total sections to generate
            let totalSections = 0;
            for (const page of pages) {
              totalSections += page.sections.filter(
                (section) => section.contentEntity && !section.content,
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

            for (const page of pages) {
              const sectionsNeedingContent = page.sections.filter(
                (section) => section.contentEntity && !section.content,
              );

              for (const section of sectionsNeedingContent) {
                if (!section.contentEntity) continue;

                // Report progress for this section
                await context?.sendProgress?.({
                  message: `Generating content for ${page.title} - ${section.id}`,
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
                      pageTitle: page.title,
                      pageDescription: page.description,
                      sectionId: section.id,
                      ...(config.siteConfig || {
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
                  // Generate markdown with frontmatter for site-content
                  const { generateMarkdownWithFrontmatter } = await import("@brains/utils");
                  const metadata = {
                    page: section.contentEntity.query["page"] as string,
                    section: section.contentEntity.query["section"] as string,
                    environment: (section.contentEntity.query["environment"] as string) ?? "preview",
                  };
                  const contentWithFrontmatter = generateMarkdownWithFrontmatter(formattedContent, metadata);
                  
                  await this.context.entityService.createEntity({
                    entityType: section.contentEntity.entityType,
                    content: contentWithFrontmatter,
                  });
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
                siteConfig: config.siteConfig || {
                  title: "Personal Brain",
                  description: "A knowledge management system",
                },
              },
              context?.sendProgress,
            );

            return {
              success: result.success,
              pagesBuilt: result.pagesBuilt,
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
        "list_pages",
        "List all registered pages",
        {},
        async (): Promise<Record<string, unknown>> => {
          const pageRegistry = PageRegistry.getInstance();
          const pages = pageRegistry.list();

          return {
            success: true,
            pages: pages.map((p) => ({
              path: p.path,
              title: p.title,
              description: p.description,
              pluginId: p.pluginId,
              sections: p.sections.length,
            })),
          };
        },
        "public",
      ),
    );

    // List layouts tool
    tools.push(
      this.createTool(
        "list_layouts",
        "List all registered layouts",
        {},
        async (): Promise<Record<string, unknown>> => {
          const layoutRegistry = LayoutRegistry.getInstance();
          const layouts = layoutRegistry.list();

          return {
            success: true,
            layouts: layouts.map((l) => ({
              name: l.name,
              description: l.description,
              component: l.component,
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
