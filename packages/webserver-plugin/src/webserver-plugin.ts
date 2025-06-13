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
import { siteContentSchema } from "./schemas";
import { siteContentAdapter } from "./site-content-adapter";
import { SiteContentFormatter } from "./site-content-formatter";
import {
  landingHeroDataSchema,
  featuresSectionSchema,
  ctaSectionSchema,
  landingPageReferenceSchema,
  dashboardSchema,
} from "./content-schemas";
import { LandingPageFormatter } from "./formatters/landingPageFormatter";
import { HeroSectionFormatter } from "./formatters/heroSectionFormatter";
import { FeaturesSectionFormatter } from "./formatters/featuresSectionFormatter";
import { CTASectionFormatter } from "./formatters/ctaSectionFormatter";
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
    // Landing page sections
    this.registerContentType("landing:hero", {
      contentType: "landing:hero",
      schema: landingHeroDataSchema,
      formatter: new HeroSectionFormatter(),
    });

    this.registerContentType("landing:features", {
      contentType: "landing:features",
      schema: featuresSectionSchema,
      formatter: new FeaturesSectionFormatter(),
    });

    this.registerContentType("landing:cta", {
      contentType: "landing:cta",
      schema: ctaSectionSchema,
      formatter: new CTASectionFormatter(),
    });

    // Register content types for pages (using :index suffix)
    this.registerContentType("landing:index", {
      contentType: "landing:index",
      schema: landingPageReferenceSchema,
      formatter: new LandingPageFormatter(),
    });

    this.registerContentType("dashboard:index", {
      contentType: "dashboard:index",
      schema: dashboardSchema,
    });

    // Call parent's onRegister to actually register the content types
    await super.onRegister(context);

    const { logger, registerEntityType, formatters, contentTypeRegistry } =
      context;

    // Wire content type registry to site content adapter for validation
    siteContentAdapter.setContentTypeRegistry(contentTypeRegistry);

    // Register site-content entity type
    registerEntityType("site-content", siteContentSchema, siteContentAdapter);

    // Register site-content formatter
    formatters.register("site-content", new SiteContentFormatter());

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
        "Generate and build the static website",
        toolInput().boolean("clean", false).build(),
        async (input, context): Promise<Record<string, unknown>> => {
          const { clean } = input as { clean?: boolean };

          try {
            if (!this.manager) {
              throw new Error("WebserverPlugin manager not initialized");
            }
            await this.manager.buildSite(
              clean ? { clean: true } : undefined,
              context?.sendProgress,
            );
            const status = this.manager.getStatus();

            return {
              success: true,
              message: "Site built successfully",
              lastBuild: status.lastBuild,
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

    // Add promotion tool
    tools.push(
      this.createTool(
        "promote_section",
        "Promote a generated content section to editable site content",
        toolInput().string("generatedContentId").build(),
        async (input, _context): Promise<Record<string, unknown>> => {
          const { generatedContentId } = input as {
            generatedContentId: string;
          };

          try {
            // Get the plugin context to access entityService
            const pluginContext = this.getContext();

            // Get the source entity to extract page/section info
            const source = await pluginContext.entityService.getEntity(
              "generated-content",
              generatedContentId,
            );

            if (!source) {
              throw new Error(
                `Generated content not found: ${generatedContentId}`,
              );
            }

            // Use entity service to derive the entity
            const promoted = await pluginContext.entityService.deriveEntity(
              generatedContentId,
              "generated-content",
              "site-content",
            );

            return {
              success: true,
              message: `Promoted section to site-content`,
              promotedId: promoted.id,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            return {
              success: false,
              error: `Failed to promote section: ${message}`,
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
