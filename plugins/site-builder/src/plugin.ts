import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
  Command,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { siteContentPreviewSchema, siteContentProductionSchema } from "./types";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";
import {
  siteContentPreviewAdapter,
  siteContentProductionAdapter,
} from "./entities/site-content-adapter";
import { dashboardTemplate } from "./templates/dashboard";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { createSiteBuilderTools } from "./tools";
import { createSiteBuilderCommands } from "./commands";
import type { SiteBuilderConfig } from "./config";
import {
  siteBuilderConfigSchema,
  SITE_BUILDER_CONFIG_DEFAULTS,
} from "./config";
import packageJson from "../package.json";

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentService?: SiteContentService;
  private pluginContext?: ServicePluginContext;

  constructor(config: Partial<SiteBuilderConfig> = {}) {
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
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

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
    context.registerTemplates({ dashboard: dashboardTemplate });
    this.logger.debug("Registered dashboard template");

    // Register dashboard route
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
              // No static content - will use DataSource to fetch data dynamically
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
      context.registerTemplates(this.config.templates);
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

    // Initialize the site content service
    this.siteContentService = new SiteContentService(
      context,
      this.config.siteConfig,
    );

    // Register site-build job handler (site-specific, not a content operation)
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      context,
    );
    context.registerJobHandler("site-build", siteBuildHandler);
    this.logger.debug("Registered site-build job handler");

    // Note: content-generation and content-derivation handlers are registered
    // by the shell as they are core content operations owned by ContentService

    // Site builder is now encapsulated within the plugin
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return createSiteBuilderTools(
      () => this.siteBuilder,
      () => this.siteContentService,
      this.pluginContext,
      this.id,
      this.config,
    );
  }

  /**
   * Expose site-builder commands for message interfaces
   */
  public override async getCommands(): Promise<Command[]> {
    return createSiteBuilderCommands(
      this.siteContentService,
      this.pluginContext,
      this.config,
      this.id,
    );
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

  /**
   * Get the site content service instance
   */
  public getSiteContentService(): SiteContentService | undefined {
    return this.siteContentService;
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config?: Partial<SiteBuilderConfig>): Plugin {
  return new SiteBuilderPlugin(config);
}
