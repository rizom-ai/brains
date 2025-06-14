import type { PluginContext, PluginTool } from "@brains/types";
import {
  ContentGeneratingPlugin,
  pluginConfig,
  toolInput,
  validatePluginConfig,
} from "@brains/utils";
import {
  WebserverManager,
  type WebserverManagerOptions,
} from "./webserver-manager";
import { siteContentSchema, type SiteContent } from "./schemas";
import { siteContentAdapter } from "./site-content-adapter";
import { contentRegistry } from "./content";
import { webserverConfigSchema, type WebserverConfig } from "./config";

/**
 * Webserver plugin that extends ContentGeneratingPlugin
 * Generates and serves static websites from Personal Brain content
 */
export class WebserverPlugin extends ContentGeneratingPlugin<WebserverConfig> {
  private manager?: WebserverManager;

  constructor(config: unknown) {
    // Validate config first
    const validatedConfig = validatePluginConfig(
      webserverConfigSchema,
      config,
      "webserver",
    );

    super(
      "webserver",
      "Webserver Plugin",
      "Generates and serves static websites from Personal Brain content",
      validatedConfig,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    // Register content types BEFORE calling super.onRegister()
    // This ensures they're available when the parent class tries to register them

    // Register all content types from the registry
    for (const key of contentRegistry.getTemplateKeys()) {
      const template = contentRegistry.getTemplate(key);
      if (template) {
        const config: any = {
          contentType: key,
          schema: template.schema,
        };
        if (template.formatter) {
          config.formatter = template.formatter;
        }
        this.registerContentType(key, config);
      }
    }

    // Call parent's onRegister to actually register the content types
    await super.onRegister(context);

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

    // Build site tool
    tools.push(
      this.createTool(
        "build_site",
        "Build the static website from content",
        toolInput()
          .boolean("clean", false)
          .enum("environment", ["preview", "production"] as const, "preview")
          .build(),
        async (input, context): Promise<Record<string, unknown>> => {
          const { clean, environment } = input as { 
            clean?: boolean;
            environment?: "preview" | "production";
          };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            await this.manager.buildSite(
              { 
                clean: clean ?? false,
                environment: environment ?? "preview"
              },
              context?.sendProgress,
            );
            const status = this.manager.getStatus();

            return {
              success: true,
              message: `Site built successfully from ${environment ?? "preview"} content`,
              lastBuild: status.lastBuild,
              environment: environment ?? "preview",
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
      ),
    );

    // Start preview server tool
    tools.push(
      this.createTool(
        "start_preview_server",
        "Start the preview server to test the site locally",
        {},
        async (): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            const url = await this.manager.startPreviewServer();
            return {
              success: true,
              url,
              message: `Preview server started at ${url}`,
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
      ),
    );

    // Start production server tool
    tools.push(
      this.createTool(
        "start_production_server",
        "Start the production server to serve the site",
        {},
        async (): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            const url = await this.manager.startProductionServer();
            return {
              success: true,
              url,
              message: `Production server started at ${url}`,
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
      ),
    );

    // Stop server tool
    tools.push(
      this.createTool(
        "stop_server",
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
      ),
    );

    // Preview site tool
    tools.push(
      this.createTool(
        "preview_site",
        "Build the site and start preview server in one command",
        {},
        async (_, context): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            const url = await this.manager.preview(context?.sendProgress);
            return {
              success: true,
              url,
              message: `Site built and preview server started at ${url}`,
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
      ),
    );

    // Build production site tool
    tools.push(
      this.createTool(
        "build_production_site",
        "Build site with production content and start production server",
        {},
        async (_, context): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            
            // Build with production content
            await this.manager.buildSite(
              { environment: "production" },
              context?.sendProgress,
            );
            
            // Start production server
            const url = await this.manager.startProductionServer();
            
            return {
              success: true,
              url,
              message: `Production site built and server started at ${url}`,
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
      ),
    );

    // Get site status tool
    tools.push(
      this.createTool(
        "get_site_status",
        "Get the current status of the site and servers",
        {},
        async (): Promise<Record<string, unknown>> => {
          if (!this.manager) {
            throw new Error("WebserverPlugin manager not initialized");
          }
          const status = this.manager.getStatus();

          return {
            hasBuild: status.hasBuild,
            lastBuild: status.lastBuild,
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
          };
        },
      ),
    );

    // Promote content tool
    tools.push(
      this.createTool(
        "promote_content",
        "Promote content from preview to production environment",
        toolInput()
          .string("page")
          .optionalString("section")
          .build(),
        async (input): Promise<Record<string, unknown>> => {
          const { page, section } = input as { page: string; section?: string };

          try {
            if (!this.context) {
              throw new Error("Plugin context not initialized");
            }
            const entityService = this.context.entityService;
            
            // Find all preview content for the page/section
            const filter: any = { page, environment: "preview" };
            if (section) {
              filter.section = section;
            }

            const previewContent = await entityService.listEntities<SiteContent>(
              "site-content",
              { filter: { metadata: filter } }
            );

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
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
      ),
    );

    // List environments tool
    tools.push(
      this.createTool(
        "list_content_environments",
        "List content available in each environment",
        {},
        async (): Promise<Record<string, unknown>> => {
          try {
            if (!this.context) {
              throw new Error("Plugin context not initialized");
            }
            const entityService = this.context.entityService;
            
            // Get all site content
            const allContent = await entityService.listEntities<SiteContent>("site-content");
            
            // Group by environment
            const preview = allContent.filter(c => c.environment === "preview");
            const production = allContent.filter(c => c.environment === "production");
            
            // Create summary
            const previewSummary = preview.reduce((acc, c) => {
              const key = `${c.page}:${c.section}`;
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            
            const productionSummary = production.reduce((acc, c) => {
              const key = `${c.page}:${c.section}`;
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            return {
              success: true,
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
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
      ),
    );

    // Generate content tool (always generates to preview)
    tools.push(
      this.createTool(
        "generate_site_content",
        "Generate AI content for the website (always creates in preview environment)",
        {},
        async (_, context): Promise<Record<string, unknown>> => {
          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            
            // This generates new content to preview environment
            await this.manager.generateContent(context?.sendProgress);
            
            return {
              success: true,
              message: "Generated content to preview environment",
              hint: "Use 'promote_content' to move content to production",
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: message,
            };
          }
        },
      ),
    );

    // Add content generation tools
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
