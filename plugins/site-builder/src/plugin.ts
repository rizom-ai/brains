import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { ServicePlugin, SYSTEM_CHANNELS } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { SiteBuilder, type SiteBuilderServices } from "./lib/site-builder";
import type {
  SiteBuildProfile,
  SiteBuildProfileService,
} from "./lib/site-build-profile-service";
import {
  RouteRegistry,
  UISlotRegistry,
  type LayoutComponent,
  type SlotRegistration,
} from "@brains/site-engine";
import { RebuildManager } from "./lib/auto-rebuild";
import { setupRouteHandlers } from "./lib/route-handlers";
import { registerConfigRoutes } from "./lib/route-helpers";
import { SiteBuildJobHandler } from "./handlers/siteBuildJobHandler";
import { NavigationDataSource } from "./datasources/navigation-datasource";
import {
  SITE_METADATA_UPDATED_CHANNEL,
  type SiteMetadata,
} from "@brains/site-composition";
import { resolveSiteMetadata } from "./lib/site-metadata";
import { createSiteBuilderTools } from "./tools/index";
import { SiteBuildStatusService } from "./lib/site-build-status";
import { SiteWorkspaceProvider } from "./lib/site-workspace";
import { registerSiteHealthWidget } from "./lib/dashboard-widget";
import type { SiteBuilderConfig, SiteBuilderConfigInput } from "./config";
import { siteBuilderConfigSchema } from "./config";

import packageJson from "../package.json";

/** One plugin's answer on SITE_BUILDER_CHANNELS.slots. */
const slotContributionsSchema = z.array(
  z.object({
    pluginId: z.string(),
    slotName: z.string(),
    // A render function cannot be validated beyond being one.
    render: z.custom<SlotRegistration["render"]>(
      (value) => typeof value === "function",
    ),
    priority: z.number().optional(),
  }),
);

/**
 * Site Builder Plugin
 * Provides static site generation capabilities
 */
export class SiteBuilderPlugin extends ServicePlugin<
  SiteBuilderConfig,
  SiteBuilderConfigInput
> {
  private siteBuilder?: SiteBuilder;
  private pluginContext?: ServicePluginContext;
  private _routeRegistry?: RouteRegistry;
  private profileService?: SiteBuildProfileService;
  private layouts: Record<string, LayoutComponent>;
  private rebuildManager?: RebuildManager;
  private buildStatusService?: SiteBuildStatusService;
  private siteWorkspaceProvider?: SiteWorkspaceProvider;

  private get routeRegistry(): RouteRegistry {
    if (!this._routeRegistry) {
      throw new Error("RouteRegistry not initialized - plugin not registered");
    }
    return this._routeRegistry;
  }

  constructor(config: SiteBuilderConfigInput = {}) {
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

    // Register data sources
    context.entities.registerDataSource(
      new NavigationDataSource(
        this._routeRegistry,
        context.logger.child("NavigationDataSource"),
      ),
    );

    this.profileService = {
      getProfile: (): SiteBuildProfile => context.identity.getProfile(),
    };
    this.buildStatusService = new SiteBuildStatusService(
      context.runtimeState,
      context.jobs,
    );
    await this.buildStatusService.initialize();

    setupRouteHandlers(context, this._routeRegistry, this.logger);

    if (this.config.templates) {
      context.templates.register(this.config.templates);
    }

    if (this.config.routes) {
      registerConfigRoutes(this.config.routes, this.id, this.routeRegistry);
    }

    const siteBuilderServices: SiteBuilderServices = {
      entityService: context.entityService,
      sendMessage: context.messaging.send,
      resolveTemplateContent: (templateName, options) =>
        context.templates.resolve(templateName, options),
      getViewTemplate: (name) => context.views.get(name),
      listViewTemplateNames: (): string[] =>
        context.views.list().map((template) => template.name),
    };

    // Initialize site builder
    this.siteBuilder = SiteBuilder.createFresh(
      context.logger.child("SiteBuilder"),
      siteBuilderServices,
      this.routeRegistry,
      this.profileService,
      undefined,
      context.entityDisplay,
    );

    // Register site-build job handler
    context.jobs.registerHandler(
      "site-build",
      new SiteBuildJobHandler(
        this.logger.child("SiteBuildJobHandler"),
        context.messaging.send,
        {
          siteBuilder: this.siteBuilder,
          entityDisplay: context.entityDisplay,
          layouts: this.layouts,
          defaultSiteConfig: this.config.siteInfo,
          sharedImagesDir: this.config.sharedImagesDir,
          siteUrl: context.siteUrl,
          previewUrl: context.previewUrl,
          localSiteUrl: context.localSiteUrl,
          preferLocalUrls: context.preferLocalUrls,
          themeCSS: this.config.themeCSS,
          getSlots: (): Promise<UISlotRegistry> => this.getSlots(),
          getHeadScripts: (): Promise<string[]> => this.getHeadScripts(),
          ...(this.config.staticAssets && {
            staticAssets: this.config.staticAssets,
          }),
          statusService: this.buildStatusService,
        },
      ),
    );

    // Set up rebuild manager (handles debounced builds and auto-rebuild)
    this.rebuildManager = new RebuildManager(
      this.config,
      context,
      this.id,
      this.logger,
      this.buildStatusService,
    );

    this.siteWorkspaceProvider = new SiteWorkspaceProvider({
      context,
      config: this.config,
      routeRegistry: this.routeRegistry,
      statusService: this.buildStatusService,
      requestBuild: (environment): void => {
        this.rebuildManager?.requestBuild(environment);
      },
    });

    if (this.config.autoRebuild) {
      this.logger.debug("Auto-rebuild enabled");
      this.rebuildManager.setupAutoRebuild();
    }

    // Rebuilt once startup content has settled, so a queued startup import
    // is in the site before it renders.
    context.messaging.subscribe(
      SYSTEM_CHANNELS.startupContentSettled,
      async () => {
        await this.rebuildOutputsAfterStart();
        return { success: true };
      },
    );

    // Re-register instructions when site metadata changes so the prompt stays fresh.
    context.messaging.subscribe<SiteMetadata, { success: boolean }>(
      SITE_METADATA_UPDATED_CHANNEL,
      async () => {
        const instructions = await this.getInstructions();
        if (instructions) {
          context.registerInstructions(instructions);
        }
        return { success: true };
      },
    );
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.siteWorkspaceProvider) return;
    await this.siteWorkspaceProvider.registerStudioWorkspace();
    await registerSiteHealthWidget(context, this.siteWorkspaceProvider);
  }

  /**
   * A start, an upgrade included, may bring new renderer code that the input
   * fingerprint cannot see; the renderer identity is fresh per process, so a
   * requested build renders again. Every environment that already has an
   * output is built again; one never built stays untouched.
   */
  private async rebuildOutputsAfterStart(): Promise<void> {
    const outputs = [
      ["production", this.config.productionOutputDir],
      ["preview", this.config.previewOutputDir],
    ] as const;
    const built = await Promise.all(
      outputs.map(async ([environment, dir]) => ({
        environment,
        exists: await access(join(dir, "index.html")).then(
          () => true,
          () => false,
        ),
      })),
    );
    for (const { environment, exists } of built) {
      if (exists) this.rebuildManager?.requestBuild(environment);
    }
  }

  /**
   * The scripts for every page's head: the site package's own, then each
   * plugin's answer, asked for at build time so it works in the worker and
   * whatever order plugins registered in.
   */
  public async getHeadScripts(): Promise<string[]> {
    const answers = await this.getContext().messaging.collect({
      type: SITE_BUILDER_CHANNELS.headScripts,
      payload: {},
    });
    const contributed = answers.flatMap((answer) => {
      const script =
        "data" in answer ? z.string().safeParse(answer.data) : null;
      return script?.success ? [script.data] : [];
    });
    return [...this.config.headScripts, ...contributed];
  }

  /**
   * The layout slots for one build, from each plugin's answer: asked for at
   * build time, like the head scripts, so they reach the worker.
   */
  public async getSlots(): Promise<UISlotRegistry> {
    const answers = await this.getContext().messaging.collect({
      type: SITE_BUILDER_CHANNELS.slots,
      payload: {},
    });
    const slots = new UISlotRegistry();
    for (const answer of answers) {
      const contributions =
        "data" in answer
          ? slotContributionsSchema.safeParse(answer.data)
          : null;
      for (const {
        slotName,
        pluginId,
        render,
        priority,
      } of contributions?.success ? contributions.data : [])
        slots.register(slotName, {
          pluginId,
          render,
          ...(priority !== undefined && { priority }),
        });
    }
    return slots;
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
        name: "Site Metadata",
        description: "Site metadata — title, description, domain, URLs",
        mimeType: "application/json",
        handler: async (): Promise<{
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        }> => {
          const siteMetadata = await resolveSiteMetadata(
            context.messaging.send,
            this.config.siteInfo,
          );
          return {
            contents: [
              {
                uri: "brain://site",
                mimeType: "application/json",
                text: JSON.stringify(
                  {
                    ...siteMetadata,
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

  protected override async getInstructions(): Promise<string | undefined> {
    const context = this.getContext();
    const buildInstructions = `## Site Builder Actions
- When the user asks to build, rebuild, publish, or build the website/site again, call \`site-builder_build-site\` immediately.
- Every repeated build request requires a fresh \`site-builder_build-site\` call. Do not say a build was started, queued, or requested unless this turn invoked the tool.`;

    const siteMetadata = await resolveSiteMetadata(
      context.messaging.send,
      this.config.siteInfo,
    );
    const parts = [
      `**Title:** ${siteMetadata.title}`,
      `**Description:** ${siteMetadata.description}`,
      context.domain && `**Domain:** ${context.domain}`,
      context.siteUrl && `**URL:** ${context.siteUrl}`,
    ].filter(Boolean);
    return `## Your Site\n${parts.join("\n")}\n\n${buildInstructions}`;
  }

  protected override async onShutdown(): Promise<void> {
    this.logger.debug("Shutting down site-builder plugin");
    await this.siteWorkspaceProvider?.unregisterStudioWorkspace();
    await this.rebuildManager?.dispose();
    await this.siteBuilder?.cancelActiveBuilds();
    delete this.rebuildManager;
    delete this.siteBuilder;
    this.logger.debug("Cleaned up all event subscriptions");
  }
}

/**
 * Factory function to create the plugin
 */
export function siteBuilderPlugin(config: SiteBuilderConfigInput = {}): Plugin {
  return new SiteBuilderPlugin(config);
}
