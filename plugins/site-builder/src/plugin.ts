import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin, AnchorProfileService } from "@brains/plugins";
import { SiteBuilder } from "./lib/site-builder";
import { RouteRegistry } from "./lib/route-registry";
import { UISlotRegistry, type SlotRegistration } from "./lib/ui-slot-registry";
import { RebuildManager } from "./lib/auto-rebuild";
import { setupRouteHandlers } from "./lib/route-handlers";
import { registerConfigRoutes } from "./lib/route-helpers";
import { subscribeBuildCompleted } from "./lib/seo-file-handler";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { NavigationDataSource } from "./datasources/navigation-datasource";
import { fetchSiteInfo } from "@brains/site-info";
import { createSiteBuilderTools } from "./tools/index";
import type { SiteBuilderConfig, LayoutComponent } from "./config";
import { siteBuilderConfigSchema } from "./config";

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
  private profileService?: AnchorProfileService;
  private layouts: Record<string, LayoutComponent>;
  private rebuildManager?: RebuildManager;
  private headScripts = new Map<string, string>();

  private get routeRegistry(): RouteRegistry {
    if (!this._routeRegistry) {
      throw new Error("RouteRegistry not initialized - plugin not registered");
    }
    return this._routeRegistry;
  }

  constructor(config: Partial<SiteBuilderConfig> = {}) {
    const layouts = config.layouts ?? {};
    super(
      "site-builder",
      packageJson,
      {
        ...config,
        layouts,
      },
      siteBuilderConfigSchema,
    );
    this.layouts = layouts;
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

    // Subscribe to head script registration messages from other plugins
    context.messaging.subscribe<
      { pluginId: string; script: string },
      { success: boolean }
    >("plugin:site-builder:head-script:register", async (message) => {
      const { pluginId, script } = message.payload;
      // Use pluginId as key so re-registration replaces (no duplicates)
      this.headScripts.set(pluginId, script);
      return { success: true };
    });

    // Register data sources
    context.entities.registerDataSource(
      new NavigationDataSource(
        this._routeRegistry,
        context.logger.child("NavigationDataSource"),
      ),
    );

    // Site-info entity type + datasource registered by SiteInfoPlugin (entities/site-info)
    this.profileService = AnchorProfileService.getInstance(
      context.entityService,
      context.logger,
    );

    context.messaging.subscribe("sync:initial:completed", async () => {
      await this.profileService?.initialize();
      this.logger.info("AnchorProfileService initialized");
      return { success: true };
    });

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
      this.profileService,
      this.config.entityDisplay,
    );

    // Register site-build job handler
    context.jobs.registerHandler(
      "site-build",
      new SiteBuildJobHandler(
        this.logger.child("SiteBuildJobHandler"),
        context.messaging.send,
        {
          siteBuilder: this.siteBuilder,
          layouts: this.layouts,
          defaultSiteConfig: this.config.siteInfo,
          sharedImagesDir: this.config.sharedImagesDir,
          siteUrl: context.siteUrl,
          previewUrl: context.previewUrl,
          themeCSS: this.config.themeCSS,
          slots: this._slotRegistry,
          getHeadScripts: (): string[] => this.getRegisteredHeadScripts(),
          ...(this.config.staticAssets && {
            staticAssets: this.config.staticAssets,
          }),
        },
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

    // Register CMS admin nav link if CMS is enabled
    if (this.config.cms) {
      this._routeRegistry.register({
        id: "cms-admin",
        path: "/admin/",
        title: "Admin",
        external: true,
        navigation: {
          show: true,
          slot: "secondary",
          label: "Admin",
          priority: 100,
        },
      });
    }

    // Re-register instructions when site-info changes so agent prompt stays fresh
    context.messaging.subscribe("entity:updated", async (message) => {
      const payload = message.payload as {
        entityType: string;
        entityId: string;
      };
      if (payload.entityType === "site-info") {
        const instructions = await this.getInstructions();
        if (instructions) {
          context.registerInstructions(instructions);
        }
      }
      return { success: true };
    });

    // Subscribe to build-completed for SEO + CMS file generation
    subscribeBuildCompleted({
      context,
      routeRegistry: this._routeRegistry,
      config: this.config,
      logger: this.logger,
    });
  }

  /**
   * Get all head scripts registered by other plugins.
   * Used by the build pipeline to inject scripts into the HTML <head>.
   */
  public getRegisteredHeadScripts(): string[] {
    return Array.from(this.headScripts.values());
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.pluginContext || !this.rebuildManager) {
      throw new Error("Plugin context not initialized");
    }

    const rebuildManager = this.rebuildManager;
    return createSiteBuilderTools(this.id, (env) =>
      rebuildManager.requestBuild(env),
    );
  }

  protected override async getResources(): Promise<Resource[]> {
    const context = this.getContext();
    return [
      {
        uri: "brain://site",
        name: "Site Info",
        description: "Site metadata — title, description, domain, URLs",
        mimeType: "application/json",
        handler: async (): Promise<{
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        }> => {
          let siteInfo;
          try {
            siteInfo = await fetchSiteInfo(context.entityService);
          } catch {
            siteInfo = { title: "Brain", description: "" };
          }
          return {
            contents: [
              {
                uri: "brain://site",
                mimeType: "application/json",
                text: JSON.stringify(
                  {
                    ...siteInfo,
                    domain: context.domain,
                    siteUrl: context.siteUrl,
                    previewUrl: context.previewUrl,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
      {
        uri: "site://routes",
        name: "Site Routes",
        description: "All registered routes with sections and templates",
        mimeType: "application/json",
        handler: async (): Promise<{
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        }> => {
          const routes = this.routeRegistry.list();
          return {
            contents: [
              {
                uri: "site://routes",
                mimeType: "application/json",
                text: JSON.stringify(
                  routes.map((route) => ({
                    id: route.id,
                    path: route.path,
                    title: route.title,
                    description: route.description,
                    sections: route.sections.map((s) => ({
                      id: s.id,
                      template: s.template,
                    })),
                  })),
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
      {
        uri: "site://templates",
        name: "View Templates",
        description: "All registered view templates",
        mimeType: "application/json",
        handler: async (): Promise<{
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        }> => {
          const templates = context.views.list();
          return {
            contents: [
              {
                uri: "site://templates",
                mimeType: "application/json",
                text: JSON.stringify(
                  templates.map((t) => ({
                    name: t.name,
                    description: t.description,
                    hasWebRenderer: !!t.renderers.web,
                  })),
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
    ];
  }

  public getSiteBuilder(): SiteBuilder | undefined {
    return this.siteBuilder;
  }

  public getSlotRegistry(): UISlotRegistry | undefined {
    return this._slotRegistry;
  }

  protected override async getInstructions(): Promise<string | undefined> {
    const context = this.getContext();
    try {
      const siteInfo = await fetchSiteInfo(context.entityService);
      const parts = [
        `**Title:** ${siteInfo.title}`,
        `**Description:** ${siteInfo.description}`,
        context.domain && `**Domain:** ${context.domain}`,
        context.siteUrl && `**URL:** ${context.siteUrl}`,
      ].filter(Boolean);
      return `## Your Site\n${parts.join("\n")}`;
    } catch {
      return undefined;
    }
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.debug("Shutting down site-builder plugin");
    this.rebuildManager?.dispose();
    SiteBuilder.resetInstance();
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
