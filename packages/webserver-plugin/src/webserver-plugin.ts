import type { PluginContext, PluginTool } from "@brains/types";
import { BasePlugin, pluginConfig, toolInput } from "@brains/utils";
import type { z } from "zod";
import {
  WebserverManager,
  type WebserverManagerOptions,
} from "./webserver-manager";
import { siteContentSchema, type SiteContent } from "./schemas";
import { siteContentAdapter } from "./site-content-adapter";
import { contentRegistry } from "./content";
import { webserverConfigSchema, type WebserverConfig } from "./config";

/**
 * Filter type for site content queries
 */
interface SiteContentFilter extends Record<string, unknown> {
  page: string;
  section?: string;
  environment: "preview" | "production";
}

/**
 * Webserver plugin that extends BasePlugin
 * Generates and serves static websites from Personal Brain content
 */
export class WebserverPlugin extends BasePlugin<WebserverConfig> {
  private manager?: WebserverManager;

  constructor(config: unknown) {
    super(
      "webserver",
      "Webserver Plugin",
      "Generates and serves static websites from Personal Brain content",
      config,
      webserverConfigSchema as z.ZodType<WebserverConfig>,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);

    // Register all templates from the registry
    for (const key of contentRegistry.getTemplateKeys()) {
      const template = contentRegistry.getTemplate(key);
      if (template) {
        // Extract the collection name (e.g., "webserver:landing" -> "landing")
        const parts = key.split(":");
        const collectionName = parts[parts.length - 1];

        if (!collectionName) {
          context.logger.warn(`Invalid template key: ${key}`);
          continue;
        }

        // Register template with ContentGenerationService
        // The plugin manager will automatically prefix with "webserver:"
        context.templates.register(collectionName, template);

        // Also register content type if formatter is available
        if (template.formatter) {
          context.contentTypes.register(
            collectionName,
            template.schema,
            template.formatter,
          );
        }

        // Register formatters for collection items
        if (template.items) {
          for (const [itemKey, itemTemplate] of Object.entries(
            template.items,
          )) {
            if (itemTemplate.formatter) {
              // Register with full path: plugin:collection:item
              context.contentTypes.register(
                `${collectionName}:${itemKey}`,
                itemTemplate.schema,
                itemTemplate.formatter,
              );
            }
          }
        }
      }
    }

    const { logger, registerEntityType } = context;

    // Register site-content entity type
    registerEntityType("site-content", siteContentSchema, siteContentAdapter);

    // Create webserver manager instance
    const managerOptions: WebserverManagerOptions = {
      logger: logger.child("WebserverPlugin"),
      context,
      outputDir: this.config.outputDir,
      previewPort: this.config.previewPort,
      productionPort: this.config.productionPort,
      siteTitle: this.config.siteTitle,
      siteDescription: this.config.siteDescription,
    };

    // Add optional fields if present
    if (this.config.astroSiteTemplate !== undefined) {
      managerOptions.astroSiteTemplate = this.config.astroSiteTemplate;
    }
    if (this.config.siteUrl !== undefined) {
      managerOptions.siteUrl = this.config.siteUrl;
    }

    this.manager = new WebserverManager(managerOptions);
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.manager) {
      throw new Error("WebserverPlugin not initialized");
    }

    const tools: PluginTool[] = [];

    // Status tool - combines get_site_status and list_content_environments
    tools.push(
      this.createTool(
        "status",
        "Get comprehensive status of the site, servers, and content environments",
        {},
        async (): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            if (!this.context) {
              throw new Error("Plugin context not initialized");
            }

            // Get server status
            const status = this.manager.getStatus();

            // Get content environment information
            const entityService = this.context.entityService;
            const allContent =
              await entityService.listEntities<SiteContent>("site-content");

            // Group by environment
            const preview = allContent.filter(
              (c) => c.environment === "preview",
            );
            const production = allContent.filter(
              (c) => c.environment === "production",
            );

            // Create summary
            const previewSummary = preview.reduce(
              (acc, c) => {
                const key = `${c.page}:${c.section}`;
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );

            const productionSummary = production.reduce(
              (acc, c) => {
                const key = `${c.page}:${c.section}`;
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );

            return {
              success: true,
              site: {
                hasBuild: status.hasBuild,
                lastBuild: status.lastBuild,
              },
              servers: {
                preview: {
                  running: status.servers.preview,
                  url: status.servers.previewUrl,
                },
                production: {
                  running: status.servers.production,
                  url: status.servers.productionUrl,
                },
              },
              environments: {
                preview: {
                  total: preview.length,
                  content: previewSummary,
                },
                production: {
                  total: production.length,
                  content: productionSummary,
                },
              },
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
        "anchor", // Anchor only - not useful for public users
      ),
    );

    // Build tool - combines build_site, build_production_site, and preview_site
    tools.push(
      this.createTool(
        "build",
        "Build the site and optionally start a server",
        toolInput()
          .enum("environment", ["preview", "production"] as const, "preview")
          .boolean("clean", false)
          .boolean("serve", false)
          .build(),
        async (input, context): Promise<Record<string, unknown>> => {
          const { environment, clean, serve } = input as {
            environment?: "preview" | "production";
            clean?: boolean;
            serve?: boolean;
          };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }

            const env = environment ?? "preview";

            // Build the site
            await this.manager.buildSite(
              {
                clean: clean ?? false,
                environment: env,
              },
              context?.sendProgress,
            );

            let url: string | undefined;
            if (serve) {
              // Start the appropriate server
              url =
                env === "preview"
                  ? await this.manager.startPreviewServer()
                  : await this.manager.startProductionServer();
            }

            return {
              success: true,
              message: serve
                ? `Site built and ${env} server started at ${url}`
                : `Site built successfully from ${env} content`,
              environment: env,
              url,
              lastBuild: this.manager.getStatus().lastBuild,
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
        "anchor", // Anchor only
      ),
    );

    // Serve tool - combines start_preview_server and start_production_server
    tools.push(
      this.createTool(
        "serve",
        "Start a server to serve the built site",
        toolInput()
          .enum("environment", ["preview", "production"] as const, "preview")
          .build(),
        async (input): Promise<Record<string, unknown>> => {
          const { environment } = input as {
            environment?: "preview" | "production";
          };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }

            const env = environment ?? "preview";
            const url =
              env === "preview"
                ? await this.manager.startPreviewServer()
                : await this.manager.startProductionServer();

            return {
              success: true,
              url,
              message: `${env} server started at ${url}`,
              environment: env,
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
        "anchor", // Anchor only
      ),
    );

    // Stop server tool - renamed from stop_server
    tools.push(
      this.createTool(
        "stop",
        "Stop a running server",
        toolInput()
          .enum("type", ["preview", "production"] as const)
          .build(),
        async (input): Promise<Record<string, unknown>> => {
          const { type } = input as { type: "preview" | "production" };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            await this.manager.stopServer(type);
            return {
              success: true,
              message: `${type} server stopped`,
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
        "anchor", // Anchor only
      ),
    );

    // Generate content tool - renamed from generate_site_content
    tools.push(
      this.createTool(
        "generate",
        "Generate AI content for the website (always creates in preview environment)",
        toolInput()
          .optionalString("page")
          .optionalString("section")
          .boolean("force", false)
          .build(),
        async (input, context): Promise<Record<string, unknown>> => {
          const { page, section, force } = input as {
            page?: string;
            section?: string;
            force?: boolean;
          };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }

            // If no page specified, generate all content
            if (!page) {
              await this.manager.generateContent(context?.sendProgress, force);
              return {
                success: true,
                message: force
                  ? "Regenerated all content to preview environment"
                  : "Generated missing content to preview environment",
                hint: "Use 'promote' to move content to production",
              };
            }

            // Generate specific page/section
            const sectionsToGenerate: string[] = [];

            if (section) {
              // Generate specific section
              sectionsToGenerate.push(`${page}:${section}`);
            } else {
              // Generate all sections for the page
              const registry = contentRegistry;
              const allKeys = registry.getTemplateKeys();

              for (const key of allKeys) {
                if (key.startsWith(`${page}:`)) {
                  sectionsToGenerate.push(key);
                }
              }
            }

            if (sectionsToGenerate.length === 0) {
              return {
                success: false,
                error: `No content templates found for page: ${page}`,
              };
            }

            // Generate content for each section
            const generated: string[] = [];
            const skipped: string[] = [];
            let currentStep = 0;
            const totalSteps = sectionsToGenerate.length;

            for (const templateKey of sectionsToGenerate) {
              await context?.sendProgress?.({
                progress: currentStep++,
                total: totalSteps,
                message: `${force ? "Regenerating" : "Checking"} ${templateKey}`,
              });

              const result = await this.manager.generateContentForSection(
                templateKey,
                "preview",
                force,
                context?.sendProgress,
              );

              if (result.generated) {
                generated.push(templateKey);
              } else {
                skipped.push(templateKey);
              }
            }

            return {
              success: true,
              message: force
                ? `Regenerated ${generated.length} content section(s) in preview`
                : `Generated ${generated.length} new content section(s), skipped ${skipped.length} existing`,
              generated,
              skipped: force ? undefined : skipped,
              hint: "Use 'promote' to move content to production",
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
        "anchor", // Anchor only
      ),
    );

    // Promote content tool - possibly merge with rollback_content
    tools.push(
      this.createTool(
        "promote",
        "Promote content between environments (preview to production, or rollback)",
        toolInput()
          .string("page")
          .optionalString("section")
          .enum("direction", ["promote", "rollback"] as const, "promote")
          .build(),
        async (input): Promise<Record<string, unknown>> => {
          const { page, section, direction } = input as {
            page: string;
            section?: string;
            direction?: "promote" | "rollback";
          };

          try {
            if (!this.context) {
              throw new Error("Plugin context not initialized");
            }
            const entityService = this.context.entityService;
            const dir = direction ?? "promote";

            if (dir === "promote") {
              // Find all preview content for the page/section
              const filter: SiteContentFilter = {
                page,
                environment: "preview",
              };
              if (section) {
                filter.section = section;
              }

              const previewContent =
                await entityService.listEntities<SiteContent>("site-content", {
                  filter: { metadata: filter },
                });

              if (previewContent.length === 0) {
                return {
                  success: false,
                  error: `No preview content found for ${page}${section ? `:${section}` : ""}`,
                };
              }

              const promoted: string[] = [];

              // Promote each piece of content
              for (const content of previewContent) {
                // Create production version - only copy essential fields
                await entityService.createEntity<SiteContent>({
                  entityType: "site-content",
                  content: content.content,
                  page: content.page,
                  section: content.section,
                  environment: "production",
                  promotionMetadata: {
                    promotedAt: new Date().toISOString(),
                    promotedBy: "webserver-plugin",
                    promotedFrom: content.id,
                  },
                });

                promoted.push(`${content.page}:${content.section}`);
              }

              return {
                success: true,
                message: `Promoted ${promoted.length} content item(s) to production`,
                promoted,
              };
            } else {
              // Rollback: delete production content
              const filter: SiteContentFilter = {
                page,
                environment: "production",
              };
              if (section) {
                filter.section = section;
              }

              const productionContent =
                await entityService.listEntities<SiteContent>("site-content", {
                  filter: { metadata: filter },
                });

              if (productionContent.length === 0) {
                return {
                  success: false,
                  error: `No production content found for ${page}${section ? `:${section}` : ""}`,
                };
              }

              const rolledBack: string[] = [];

              // Delete production content to effectively rollback
              for (const content of productionContent) {
                await entityService.deleteEntity(content.id);
                rolledBack.push(`${content.page}:${content.section}`);
              }

              return {
                success: true,
                message: `Rolled back ${rolledBack.length} content item(s) from production`,
                rolledBack,
                hint: "Production content removed. Preview content remains unchanged.",
              };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
        "anchor", // Anchor only
      ),
    );

    // Add content generation tools from base class
    const contentTools = await super.getTools();
    tools.push(...contentTools);

    return tools;
  }

  /**
   * Shutdown the plugin
   */
  protected override async onShutdown(): Promise<void> {
    if (this.manager) {
      await this.manager.cleanup();
    }
  }
}

/**
 * Configuration builder for webserver plugin
 */
export const webserverPluginConfig = (): ReturnType<typeof pluginConfig> =>
  pluginConfig()
    .optionalString("outputDir", "Directory to output the generated site")
    .numberWithDefault("previewPort", 3000, {
      description: "Port for the preview server",
      min: 1,
      max: 65535,
    })
    .numberWithDefault("productionPort", 8080, {
      description: "Port for the production server",
      min: 1,
      max: 65535,
    })
    .optionalString("siteTitle", "Title for the generated site")
    .optionalString("siteDescription", "Description for the generated site")
    .optionalString(
      "siteUrl",
      "Base URL for the site (e.g., https://example.com)",
    )
    .optionalString("astroSiteTemplate", "Path to custom Astro site template")
    .describe("Configuration for the webserver plugin");
