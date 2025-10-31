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
import { SiteInfoService } from "./services/site-info-service";
import { siteInfoSchema } from "./services/site-info-schema";
import { SiteInfoAdapter } from "./services/site-info-adapter";
import {
  ProfileService,
  profileSchema,
  ProfileAdapter,
} from "@brains/profile-service";
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
  private siteInfoService?: SiteInfoService;
  private profileService?: ProfileService;
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

    // Register site-info entity type BEFORE initializing service
    context.registerEntityType(
      "site-info",
      siteInfoSchema,
      new SiteInfoAdapter(),
    );

    // Create SiteInfoService instance (don't initialize yet - wait for seed content)
    this.siteInfoService = SiteInfoService.getInstance(
      context.entityService,
      context.logger,
      this.config.siteInfo,
    );

    // Register profile entity type
    context.registerEntityType("profile", profileSchema, new ProfileAdapter());

    // Create ProfileService instance (don't initialize yet - wait for seed content)
    this.profileService = ProfileService.getInstance(
      context.entityService,
      context.logger,
    );

    // Initialize both services after seed content is loaded
    context.subscribe("sync:initial:completed", async () => {
      this.logger.info(
        "sync:initial:completed received, initializing services",
      );
      await this.siteInfoService?.initialize();
      this.logger.info("SiteInfoService initialized");
      await this.profileService?.initialize();
      this.logger.info("ProfileService initialized");
      return { success: true };
    });

    // Register SiteInfoDataSource with services
    const siteInfoDataSource = new SiteInfoDataSource(
      this._routeRegistry,
      this.siteInfoService,
      this.profileService,
      context.logger.child("SiteInfoDataSource"),
    );
    context.registerDataSource(siteInfoDataSource);

    // Setup route message handlers
    this.setupRouteHandlers(context);

    // Register site content entity type
    context.registerEntityType(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );

    // Register built-in dashboard template using unified method
    context.registerTemplates({ dashboard: dashboardTemplate });

    // Register dashboard route via internal registry
    this.routeRegistry.register({
      id: "dashboard",
      path: "/dashboard",
      title: "System Dashboard",
      description: "Monitor your Brain system statistics and activity",
      layout: "minimal",
      navigation: {
        show: true,
        label: "Dashboard",
        slot: "secondary", // Footer only
        priority: 100, // Last item in footer
      },
      sections: [
        {
          id: "main",
          template: `${this.id}:dashboard`, // Add plugin prefix
        },
      ],
      pluginId: this.id,
    });

    // Register templates from configuration using unified registration
    if (this.config.templates) {
      context.registerTemplates(this.config.templates);
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
      this.siteInfoService,
      this.profileService,
    );

    // Initialize the site content service with route registry
    this.siteContentService = new SiteContentService(
      context,
      this.routeRegistry,
      this.config.siteInfo,
    );

    // Register site-build job handler (site-specific, not a content operation)
    const siteBuildHandler = new SiteBuildJobHandler(
      this.logger.child("SiteBuildJobHandler"),
      this.siteBuilder,
      this.layouts,
      this.config.siteInfo,
      this.config.themeCSS,
    );
    context.registerJobHandler("site-build", siteBuildHandler);

    // Note: content-generation and content-derivation handlers are registered
    // by the shell as they are core content operations owned by ContentService

    // Set up auto-rebuild if enabled
    if (this.config.autoRebuild) {
      this.logger.debug("Auto-rebuild enabled");
      this.setupAutoRebuild(context);
    }

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

  /**
   * Set up automatic site rebuilding when content changes
   */
  private setupAutoRebuild(context: ServicePluginContext): void {
    let pendingRebuild = false;
    let rebuildTimer: NodeJS.Timeout | undefined;

    // Entity types to exclude from auto-rebuild
    const excludedTypes = ["base"];

    const scheduleRebuild = (): void => {
      // If rebuild already scheduled, do nothing
      if (pendingRebuild) return;

      pendingRebuild = true;
      this.logger.debug("Scheduling site rebuild in 5 seconds");

      // Clear any existing timer (defensive programming)
      if (rebuildTimer) {
        clearTimeout(rebuildTimer);
      }

      rebuildTimer = setTimeout(async () => {
        pendingRebuild = false;

        // Determine target environment based on config
        const environment = this.config.previewOutputDir
          ? "preview"
          : "production";
        const outputDir =
          environment === "production"
            ? this.config.productionOutputDir
            : this.config.previewOutputDir!;

        this.logger.debug(
          `Auto-triggering ${environment} site rebuild after content changes`,
        );

        try {
          await context.enqueueJob("site-build", {
            environment,
            outputDir,
            workingDir: this.config.workingDir,
            enableContentGeneration: true,
            metadata: {
              trigger: "auto-rebuild",
              timestamp: new Date().toISOString(),
            },
          });
        } catch (error) {
          this.logger.error("Failed to enqueue auto-rebuild", error);
        }
      }, 5000); // 5 second delay
    };

    // Subscribe to entity events
    context.subscribe("entity:created", async (message) => {
      const { entityType } = message.payload as { entityType: string };
      this.logger.debug(
        `Received entity:created event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        scheduleRebuild();
      }
      return { success: true };
    });

    context.subscribe("entity:updated", async (message) => {
      const { entityType } = message.payload as { entityType: string };
      this.logger.debug(
        `Received entity:updated event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        scheduleRebuild();
      }
      return { success: true };
    });

    context.subscribe("entity:deleted", async (message) => {
      const { entityType } = message.payload as { entityType: string };
      this.logger.debug(
        `Received entity:deleted event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        scheduleRebuild();
      }
      return { success: true };
    });

    this.logger.debug("Auto-rebuild enabled for all entity types except", {
      excludedTypes,
    });
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config: SiteBuilderConfig): Plugin {
  return new SiteBuilderPlugin(config);
}
