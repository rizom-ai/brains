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
import { RouteRegistry } from "./lib/route-registry";
import type { RouteDefinition } from "./types/routes";
import {
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "./types/routes";
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
  private routeRegistry: RouteRegistry;

  constructor(config: Partial<SiteBuilderConfig> = {}) {
    super(
      "site-builder",
      packageJson,
      config,
      siteBuilderConfigSchema,
      SITE_BUILDER_CONFIG_DEFAULTS,
    );
    this.routeRegistry = new RouteRegistry();
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Setup route message handlers
    this.setupRouteHandlers(context);

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

    // Register dashboard route via internal registry
    this.routeRegistry.register({
      id: "dashboard",
      path: "/dashboard",
      title: "System Dashboard",
      description: "Monitor your Brain system statistics and activity",
      sections: [
        {
          id: "main",
          template: `${this.id}:dashboard`, // Add plugin prefix
        },
      ],
      pluginId: this.id,
      environment: this.config.environment ?? "preview",
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
          environment: this.config.environment ?? "preview",
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
        const { routes, pluginId, environment } = payload;

        for (const route of routes) {
          const processedRoute: RouteDefinition = {
            ...route,
            pluginId,
            environment: environment ?? this.config.environment ?? "preview",
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
          payload.pluginId || payload.environment ? payload : undefined,
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
export function siteBuilderPlugin(config?: Partial<SiteBuilderConfig>): Plugin {
  return new SiteBuilderPlugin(config);
}
