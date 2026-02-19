import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin, ProfileService } from "@brains/plugins";
import { siteContentSchema } from "./types";
import { SiteBuilder } from "./lib/site-builder";
import { SiteContentService } from "./lib/site-content-service";
import { RouteRegistry } from "./lib/route-registry";
import { UISlotRegistry, type SlotRegistration } from "./lib/ui-slot-registry";
import type { RouteDefinition } from "./types/routes";
import {
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "./types/routes";
import { siteContentAdapter } from "./entities/site-content-adapter";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { NavigationDataSource } from "./datasources/navigation-datasource";
import { SiteInfoDataSource } from "./datasources/site-info-datasource";
import { createSiteBuilderTools } from "./tools";
import type { SiteBuilderConfig, LayoutComponent } from "./config";
import { siteBuilderConfigSchema } from "./config";
import { SiteInfoService } from "./services/site-info-service";
import { siteInfoSchema } from "./services/site-info-schema";
import { SiteInfoAdapter } from "./services/site-info-adapter";
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
import { generateRobotsTxt } from "./lib/robots-generator";
import { generateSitemap } from "./lib/sitemap-generator";
import { generateCmsConfig, CMS_ADMIN_HTML } from "./lib/cms-config";
import type { SiteBuildCompletedPayload } from "./types/job-types";
import { toYaml } from "@brains/utils";
import { promises as fs } from "fs";
import { join } from "path";

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<SiteBuilderConfig> {
  private siteBuilder?: SiteBuilder;
  private siteContentService?: SiteContentService;
  private pluginContext?: ServicePluginContext;
  private _routeRegistry?: RouteRegistry;
  private _slotRegistry?: UISlotRegistry;
  private siteInfoService?: SiteInfoService;
  private profileService?: ProfileService;
  private layouts: Record<string, LayoutComponent>;
  private unsubscribeFunctions: Array<() => void> = [];
  private rebuildTimeout?: Timer;

  /**
   * Get the route registry, throwing if not initialized
   */
  private get routeRegistry(): RouteRegistry {
    if (!this._routeRegistry) {
      throw new Error("RouteRegistry not initialized - plugin not registered");
    }
    return this._routeRegistry;
  }

  constructor(config: Partial<SiteBuilderConfig> = {}) {
    // Apply defaults for common settings
    const configWithDefaults = {
      ...config,
      // Don't default previewOutputDir - let it be undefined if not configured
      // This allows the build tools to default to production mode
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
    // Store layouts from config
    this.layouts = configWithDefaults.layouts;
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

    // Initialize slot registry for UI components from other plugins
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

    // Register NavigationDataSource
    const navigationDataSource = new NavigationDataSource(
      this._routeRegistry,
      context.logger.child("NavigationDataSource"),
    );
    context.entities.registerDataSource(navigationDataSource);

    // Register site-info entity type BEFORE initializing service
    context.entities.register(
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

    // Create ProfileService instance (don't initialize yet - wait for seed content)
    this.profileService = ProfileService.getInstance(
      context.entityService,
      context.logger,
    );

    // Initialize both services after seed content is loaded
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

    // Register SiteInfoDataSource with services
    const siteInfoDataSource = new SiteInfoDataSource(
      this._routeRegistry,
      this.siteInfoService,
      this.profileService,
      context.logger.child("SiteInfoDataSource"),
    );
    context.entities.registerDataSource(siteInfoDataSource);

    // Setup route message handlers
    this.setupRouteHandlers(context);

    // Register site content entity type
    context.entities.register(
      "site-content",
      siteContentSchema,
      siteContentAdapter,
    );

    // Register templates from configuration using unified registration
    if (this.config.templates) {
      context.templates.register(this.config.templates);
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
      this.config.entityRouteConfig,
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
      context,
      this.config.entityRouteConfig,
      this.config.themeCSS,
      this.config.previewUrl,
      this.config.productionUrl,
      this._slotRegistry,
    );
    context.jobs.registerHandler("site-build", siteBuildHandler);

    // Note: content-generation and content-derivation handlers are registered
    // by the shell as they are core content operations owned by ContentService

    // Set up auto-rebuild if enabled
    if (this.config.autoRebuild) {
      this.logger.debug("Auto-rebuild enabled");
      this.setupAutoRebuild(context);
    }

    // Subscribe to site:build:completed to auto-generate SEO files
    context.messaging.subscribe<
      SiteBuildCompletedPayload,
      { success: boolean }
    >("site:build:completed", async (message) => {
      try {
        const payload = message.payload;

        this.logger.info(
          `Received site:build:completed event for ${payload.environment} environment - generating SEO files`,
        );

        const baseUrl = payload.siteConfig.url ?? "https://example.com";
        const routes = this.routeRegistry.list();

        // Generate robots.txt
        const robotsTxt = generateRobotsTxt(baseUrl, payload.environment);
        await fs.writeFile(
          join(payload.outputDir, "robots.txt"),
          robotsTxt,
          "utf-8",
        );
        this.logger.info(
          `Generated robots.txt for ${payload.environment} environment`,
        );

        // Generate sitemap.xml
        const sitemap = generateSitemap(routes, baseUrl);
        await fs.writeFile(
          join(payload.outputDir, "sitemap.xml"),
          sitemap,
          "utf-8",
        );
        this.logger.info(`Generated sitemap.xml with ${routes.length} URLs`);

        // Generate CMS config if cms is configured
        if (this.config.cms && this.pluginContext) {
          const repoInfo = await this.pluginContext.messaging.send<
            Record<string, never>,
            { repo: string; branch: string }
          >("git-sync:get-repo-info", {});

          if ("noop" in repoInfo || !repoInfo.success || !repoInfo.data?.repo) {
            this.logger.warn(
              "CMS enabled but git-sync repo info unavailable — skipping CMS generation",
            );
          } else {
            const entityTypes =
              this.pluginContext.entityService.getEntityTypes();
            const cmsConfig = generateCmsConfig({
              repo: repoInfo.data.repo,
              branch: repoInfo.data.branch,
              ...(this.config.cms.baseUrl && {
                baseUrl: this.config.cms.baseUrl,
              }),
              entityTypes,
              getFrontmatterSchema: (type) =>
                this.pluginContext?.entities.getEffectiveFrontmatterSchema(
                  type,
                ),
              getAdapter: (type) =>
                this.pluginContext?.entities.getAdapter(type),
              ...(this.config.entityRouteConfig && {
                entityRouteConfig: this.config.entityRouteConfig,
              }),
            });
            const adminDir = join(payload.outputDir, "admin");
            await fs.mkdir(adminDir, { recursive: true });
            await fs.writeFile(
              join(adminDir, "config.yml"),
              toYaml(cmsConfig),
              "utf-8",
            );
            await fs.writeFile(
              join(adminDir, "index.html"),
              CMS_ADMIN_HTML,
              "utf-8",
            );
            this.logger.info("Generated CMS admin page and config.yml");
          }
        }

        return { success: true };
      } catch (error) {
        this.logger.error("Failed to generate SEO files", error);
        return { success: false };
      }
    });

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
   * Get the slot registry for UI component slots
   */
  public getSlotRegistry(): UISlotRegistry | undefined {
    return this._slotRegistry;
  }

  /**
   * Setup message handlers for route operations
   */
  private setupRouteHandlers(context: ServicePluginContext): void {
    // Register handler for route registration
    context.messaging.subscribe(
      "plugin:site-builder:route:register",
      async (message) => {
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
      },
    );

    // Handler for unregistering routes
    context.messaging.subscribe(
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
    context.messaging.subscribe(
      "plugin:site-builder:route:list",
      async (message) => {
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
      },
    );

    // Handler for getting specific route
    context.messaging.subscribe(
      "plugin:site-builder:route:get",
      async (message) => {
        try {
          const payload = GetRoutePayloadSchema.parse(message.payload);
          const route = this.routeRegistry.get(payload.path);
          return { success: true, data: { route } };
        } catch (error) {
          this.logger.error("Failed to get route", { error });
          return { success: false, error: "Failed to get route" };
        }
      },
    );
  }

  /**
   * Set up automatic site rebuilding when content changes
   * Uses timer-based debounce plus job queue deduplication as safety net
   */
  private setupAutoRebuild(context: ServicePluginContext): void {
    // Entity types to exclude from auto-rebuild
    const excludedTypes = ["base"];

    const scheduleRebuild = async (): Promise<void> => {
      // Determine target environment based on config
      const environment = this.config.previewOutputDir
        ? "preview"
        : "production";
      const outputDir =
        environment === "production"
          ? this.config.productionOutputDir
          : (this.config.previewOutputDir ?? this.config.productionOutputDir);

      this.logger.debug(
        `Auto-triggering ${environment} site rebuild after content changes`,
      );

      try {
        // Background auto-trigger - pass null for toolContext
        await context.jobs.enqueue(
          "site-build",
          {
            environment,
            outputDir,
            workingDir: this.config.workingDir,
            enableContentGeneration: true,
            metadata: {
              trigger: "auto-rebuild",
              timestamp: new Date().toISOString(),
            },
          },
          null,
          {
            priority: 0,
            source: this.id,
            metadata: {
              operationType: "content_operations" as const,
            },
            deduplication: "skip", // Skip if rebuild already PENDING
          },
        );
        this.logger.debug("Site rebuild enqueued (with deduplication)");
      } catch (error) {
        this.logger.error("Failed to enqueue auto-rebuild", { error });
      }
    };

    // Debounce wrapper — batches rapid entity changes into one rebuild
    const debouncedRebuild = (): void => {
      if (this.rebuildTimeout) clearTimeout(this.rebuildTimeout);
      this.rebuildTimeout = setTimeout((): void => {
        void scheduleRebuild();
      }, this.config.rebuildDebounce);
    };

    // Subscribe to entity events and store unsubscribe functions
    const unsubscribeCreated = context.messaging.subscribe<
      { entityType: string },
      { success: boolean }
    >("entity:created", async (message) => {
      const { entityType } = message.payload;
      this.logger.debug(
        `Received entity:created event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        debouncedRebuild();
      }
      return { success: true };
    });

    const unsubscribeUpdated = context.messaging.subscribe<
      { entityType: string },
      { success: boolean }
    >("entity:updated", async (message) => {
      const { entityType } = message.payload;
      this.logger.debug(
        `Received entity:updated event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        debouncedRebuild();
      }
      return { success: true };
    });

    const unsubscribeDeleted = context.messaging.subscribe<
      { entityType: string },
      { success: boolean }
    >("entity:deleted", async (message) => {
      const { entityType } = message.payload;
      this.logger.debug(
        `Received entity:deleted event for type: ${entityType}`,
      );
      if (!excludedTypes.includes(entityType)) {
        this.logger.debug(`Entity type ${entityType} will trigger rebuild`);
        debouncedRebuild();
      }
      return { success: true };
    });

    // Store all unsubscribe functions for cleanup
    this.unsubscribeFunctions.push(
      unsubscribeCreated,
      unsubscribeUpdated,
      unsubscribeDeleted,
    );

    this.logger.debug("Auto-rebuild enabled for all entity types except", {
      excludedTypes,
    });
    this.logger.debug(
      `Using ${this.config.rebuildDebounce}ms debounce + job queue deduplication for rebuild`,
    );
  }

  /**
   * Cleanup subscriptions on shutdown
   */
  protected override async onShutdown(): Promise<void> {
    this.logger.debug("Shutting down site-builder plugin");

    // Clear any pending rebuild timer
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }

    // Unsubscribe from all event subscriptions
    for (const unsubscribe of this.unsubscribeFunctions) {
      unsubscribe();
    }
    this.unsubscribeFunctions = [];
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
