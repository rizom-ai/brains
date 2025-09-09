import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
  Command,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { siteContentSchema } from "./types";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";
import { RouteRegistry } from "./lib/route-registry";
import type { RouteDefinition } from "./types/routes";
import {
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "./types/routes";
import { siteContentAdapter } from "./entities/site-content-adapter";
import { dashboardTemplate } from "./templates/dashboard";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { NavigationDataSource } from "./datasources/navigation-datasource";
import { SiteInfoDataSource } from "./datasources/site-info-datasource";
import { createSiteBuilderTools } from "./tools";
import { createSiteBuilderCommands } from "./commands";
import type { SiteBuilderConfig, LayoutComponent } from "./config";
import { siteBuilderConfigSchema } from "./config";
import packageJson from "../package.json";

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentService?: SiteContentService;
  private pluginContext?: ServicePluginContext;
  private _routeRegistry?: RouteRegistry;
  private layouts: Record<string, LayoutComponent>;

  /**
   * Get the route registry, throwing if not initialized
   */
  private get routeRegistry(): RouteRegistry {
    if (!this._routeRegistry) {
      throw new Error("RouteRegistry not initialized - plugin not registered");
    }
    return this._routeRegistry;
  }

  constructor(config: SiteBuilderConfig) {
    super("site-builder", packageJson, config, siteBuilderConfigSchema);
    // Store layouts from config (required)
    this.layouts = config.layouts;
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Initialize route registry with logger
    this._routeRegistry = new RouteRegistry(context.logger);

    // Register NavigationDataSource
    const navigationDataSource = new NavigationDataSource(
      this._routeRegistry,
      context.logger.child("NavigationDataSource"),
    );
    context.registerDataSource(navigationDataSource);
    this.logger.debug("Registered NavigationDataSource");

    // Register SiteInfoDataSource
    const siteConfig = this.config.siteConfig || {
      title: "Personal Brain",
      description: "A knowledge management system",
    };
    const siteInfoDataSource = new SiteInfoDataSource(
      this._routeRegistry,
      {
        title: siteConfig.title,
        description: siteConfig.description,
        ...(siteConfig.url !== undefined && { url: siteConfig.url }),
        ...(siteConfig.copyright !== undefined && {
          copyright: siteConfig.copyright,
        }),
      },
      context.logger.child("SiteInfoDataSource"),
    );
    context.registerDataSource(siteInfoDataSource);
    this.logger.debug("Registered SiteInfoDataSource");

    // Setup route message handlers
    this.setupRouteHandlers(context);

    // Register site content entity type
    context.registerEntityType(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );
    this.logger.debug("Registered site-content entity type");

    // Register built-in dashboard template using unified method
    context.registerTemplates({ dashboard: dashboardTemplate });
    this.logger.debug("Registered dashboard template");

    // Register dashboard route via internal registry
    this.routeRegistry.register({
      id: "dashboard",
      path: "/dashboard",
      title: "System Dashboard",
      description: "Monitor your Brain system statistics and activity",
      layout: "default",
      navigation: {
        show: true,
        label: "Dashboard",
        slot: "primary",
        priority: 90, // Last item
      },
      sections: [
        {
          id: "main",
          template: `${this.id}:dashboard`, // Add plugin prefix
        },
      ],
      pluginId: this.id,
    });
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
      for (const route of this.config.routes) {
        this.routeRegistry.register({
          ...route,
          pluginId: this.id,
          // Prefix template names with plugin ID for consistency
          sections: route.sections.map((section) => ({
            ...section,
            template: section.template.includes(":")
              ? section.template
              : `${this.id}:${section.template}`,
          })),
        });
      }
    }

    // Initialize the site builder with plugin context and route registry
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
      this.routeRegistry,
    );

    // Initialize the site content service with route registry
    this.siteContentService = new SiteContentService(
      context,
      this.routeRegistry,
      this.config.siteConfig,
    );

    // Register site-build job handler (site-specific, not a content operation)
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      this.siteBuilder,
      this.layouts,
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
      this.routeRegistry,
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

  /**
   * Setup message handlers for route operations
   */
  private setupRouteHandlers(context: ServicePluginContext): void {
    // Register handler for route registration
    context.subscribe("plugin:site-builder:route:register", async (message) => {
      try {
        const payload = RegisterRoutesPayloadSchema.parse(message.payload);
        const { routes, pluginId } = payload;

        for (const route of routes) {
          const processedRoute: RouteDefinition = {
            ...route,
            pluginId,
            // Add plugin prefix to template names if not already prefixed
            sections: route.sections.map((section) => ({
              ...section,
              template: section.template.includes(":")
                ? section.template
                : `${pluginId}:${section.template}`,
            })),
          };
          this.routeRegistry.register(processedRoute);
        }

        this.logger.debug(`Registered ${routes.length} routes for ${pluginId}`);
        return { success: true };
      } catch (error) {
        this.logger.error("Failed to register routes", { error });
        return { success: false, error: "Failed to register routes" };
      }
    });

    // Handler for unregistering routes
    context.subscribe(
      "plugin:site-builder:route:unregister",
      async (message) => {
        try {
          const payload = UnregisterRoutesPayloadSchema.parse(message.payload);
          const { paths, pluginId } = payload;

          if (paths) {
            for (const path of paths) {
              this.routeRegistry.unregister(path);
            }
          } else if (pluginId) {
            this.routeRegistry.unregisterByPlugin(pluginId);
          }

          return { success: true };
        } catch (error) {
          this.logger.error("Failed to unregister routes", { error });
          return { success: false, error: "Failed to unregister routes" };
        }
      },
    );

    // Handler for listing routes
    context.subscribe("plugin:site-builder:route:list", async (message) => {
      try {
        const payload = ListRoutesPayloadSchema.parse(message.payload);
        const routes = this.routeRegistry.list(
          payload.pluginId ? payload : undefined,
        );
        return { success: true, data: { routes } };
      } catch (error) {
        this.logger.error("Failed to list routes", { error });
        return { success: false, error: "Failed to list routes" };
      }
    });

    // Handler for getting specific route
    context.subscribe("plugin:site-builder:route:get", async (message) => {
      try {
        const payload = GetRoutePayloadSchema.parse(message.payload);
        const route = this.routeRegistry.get(payload.path);
        return { success: true, data: { route } };
      } catch (error) {
        this.logger.error("Failed to get route", { error });
        return { success: false, error: "Failed to get route" };
      }
    });
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config: SiteBuilderConfig): Plugin {
  return new SiteBuilderPlugin(config);
}
