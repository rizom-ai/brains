import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin, ProfileService } from "@brains/plugins";
import { SiteBuilder } from "./lib/site-builder.js";
import { RouteRegistry } from "./lib/route-registry.js";
import {
  UISlotRegistry,
  type SlotRegistration,
} from "./lib/ui-slot-registry.js";
import { RebuildManager } from "./lib/auto-rebuild.js";
import { setupRouteHandlers } from "./lib/route-handlers.js";
import { registerConfigRoutes } from "./lib/route-helpers.js";
import { subscribeBuildCompleted } from "./lib/seo-file-handler.js";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler.js";
import { NavigationDataSource } from "./datasources/navigation-datasource.js";
import { SiteInfoDataSource } from "./datasources/site-info-datasource.js";
import { createSiteBuilderTools } from "./tools/index.js";
import type { SiteBuilderConfig, LayoutComponent } from "./config.js";
import { siteBuilderConfigSchema } from "./config.js";
import { SiteInfoService } from "./services/site-info-service.js";
import { siteInfoSchema } from "./services/site-info-schema.js";
import { SiteInfoAdapter } from "./services/site-info-adapter.js";
import {
  templates as defaultTemplates,
  routes as defaultRoutes,
  DefaultLayout,
  DefaultCTALayout,
  MinimalLayout,
  CTAFooterLayout,
} from "@brains/default-site-content";
import defaultTheme from "@brains/theme-default";
import packageJson from "../package.json";

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private pluginContext?: ServicePluginContext;
  private _routeRegistry?: RouteRegistry;
  private _slotRegistry?: UISlotRegistry;
  private siteInfoService?: SiteInfoService;
  private profileService?: ProfileService;
  private layouts: Record<string, LayoutComponent>;
  private rebuildManager?: RebuildManager;

  private get routeRegistry(): RouteRegistry {
    if (!this._routeRegistry) {
      throw new Error("RouteRegistry not initialized - plugin not registered");
    }
    return this._routeRegistry;
  }

  constructor(config: Partial<SiteBuilderConfig> = {}) {
    const configWithDefaults = {
      ...config,
      templates: config.templates ?? defaultTemplates,
      routes: config.routes ?? defaultRoutes,
      layouts: config.layouts ?? {
        default: DefaultLayout,
        minimal: MinimalLayout,
        "cta-footer": CTAFooterLayout,
        "default-cta": DefaultCTALayout,
      },
      themeCSS: config.themeCSS ?? defaultTheme,
    } as SiteBuilderConfig;
    super(
      "site-builder",
      packageJson,
      configWithDefaults,
      siteBuilderConfigSchema,
    );
    this.layouts = configWithDefaults.layouts;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Initialize registries
    this._routeRegistry = new RouteRegistry(context.logger);
    this._slotRegistry = new UISlotRegistry();

    // Subscribe to slot registration messages from other plugins
    context.messaging.subscribe<
      SlotRegistration & { slotName: string },
      { success: boolean }
    >("plugin:site-builder:slot:register", async (message) => {
      const { slotName, pluginId, render, priority } = message.payload;
      this._slotRegistry?.register(slotName, {
        pluginId,
        render,
        ...(priority !== undefined && { priority }),
      });
      return { success: true };
    });

    // Register data sources
    context.entities.registerDataSource(
      new NavigationDataSource(
        this._routeRegistry,
        context.logger.child("NavigationDataSource"),
      ),
    );

    // Register site-info entity type
    context.entities.register(
      "site-info",
      siteInfoSchema,
      new SiteInfoAdapter(),
    );

    // Create services (initialized after seed content is loaded)
    this.siteInfoService = SiteInfoService.getInstance(
      context.entityService,
      context.logger,
      this.config.siteInfo,
    );
    this.profileService = ProfileService.getInstance(
      context.entityService,
      context.logger,
    );

    context.messaging.subscribe("sync:initial:completed", async () => {
      this.logger.info(
        "sync:initial:completed received, initializing services",
      );
      await this.siteInfoService?.initialize();
      this.logger.info("SiteInfoService initialized");
      await this.profileService?.initialize();
      this.logger.info("ProfileService initialized");
      return { success: true };
    });

    context.entities.registerDataSource(
      new SiteInfoDataSource(
        this._routeRegistry,
        this.siteInfoService,
        this.profileService,
        context.logger.child("SiteInfoDataSource"),
      ),
    );

    // Wire up route message handlers and register config routes
    setupRouteHandlers(context, this._routeRegistry, this.logger);

    if (this.config.templates) {
      context.templates.register(this.config.templates);
    }

    if (this.config.routes) {
      registerConfigRoutes(this.config.routes, this.id, this.routeRegistry);
    }

    // Initialize site builder
    this.siteBuilder = SiteBuilder.getInstance(
      context.logger.child("SiteBuilder"),
      context,
      this.routeRegistry,
      this.siteInfoService,
      this.profileService,
      this.config.entityRouteConfig,
    );

    // Register site-build job handler
    context.jobs.registerHandler(
      "site-build",
      new SiteBuildJobHandler(
        this.logger.child("SiteBuildJobHandler"),
        this.siteBuilder,
        this.layouts,
        this.config.siteInfo,
        context,
        this.config.themeCSS,
        this.config.previewUrl,
        this.config.productionUrl,
        this._slotRegistry,
      ),
    );

    // Set up rebuild manager (handles debounced builds and auto-rebuild)
    this.rebuildManager = new RebuildManager(
      this.config,
      context,
      this.id,
      this.logger,
    );

    if (this.config.autoRebuild) {
      this.logger.debug("Auto-rebuild enabled");
      this.rebuildManager.setupAutoRebuild();
    }

    // Subscribe to build-completed for SEO + CMS file generation
    subscribeBuildCompleted({
      context,
      routeRegistry: this._routeRegistry,
      config: this.config,
      logger: this.logger,
    });
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext || !this.rebuildManager) {
      throw new Error("Plugin context not initialized");
    }

    return createSiteBuilderTools(
      this.pluginContext,
      this.id,
      this.routeRegistry,
      (env) => this.rebuildManager!.requestBuild(env),
    );
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }

  public getSiteBuilder(): SiteBuilder | undefined {
    return this.siteBuilder;
  }

  public getSlotRegistry(): UISlotRegistry | undefined {
    return this._slotRegistry;
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.debug("Shutting down site-builder plugin");
    this.rebuildManager?.dispose();
    this.logger.debug("Cleaned up all event subscriptions");
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(
  config: Partial<SiteBuilderConfig> = {},
): Plugin {
  return new SiteBuilderPlugin(config);
}
