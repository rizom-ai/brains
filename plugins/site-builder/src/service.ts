import {
  defineDataSource,
  defineServicePlugin,
  defineSubscription,
  defineTool,
  z,
  type ServicePackageDefinition,
  type StaticSiteOutput,
} from "@brains/sdk/services";
import {
  PROJECTION_CHANNELS,
  ProjectionWaveReadySchema,
} from "@brains/contracts";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { SITE_METADATA_UPDATED_CHANNEL } from "@brains/site-composition";
import { RouteRegistry, UISlotRegistry } from "@brains/site-engine";
import type { SlotRegistration } from "@brains/site-engine";
import { siteBuilderConfigSchema } from "./config";
import { navigationFor } from "./datasources/navigation-datasource";
import { handleSiteBuild } from "./handlers/siteBuildJobHandler";
import { RebuildManager } from "./lib/auto-rebuild";
import { routeSubscriptions } from "./lib/route-handlers";
import { registerConfigRoutes } from "./lib/route-helpers";
import { SiteBuilder } from "./lib/site-builder";
import { SiteBuildStatusService } from "./lib/site-build-status";
import { resolveSiteMetadata } from "./lib/site-metadata";
import { siteHealthWidget, loadSiteHealthWidget } from "./lib/dashboard-widget";
import {
  buildPreviewAction,
  buildProductionAction,
  siteWorkspace,
  siteWorkspaceHandlers,
  type SiteWorkspaceReads,
} from "./lib/site-workspace";

/**
 * Registries a caller supplies rather than letting the service build them.
 *
 * Only tests pass these: a test that asserts what a package registered needs
 * the same registry the service used. Production leaves them unset.
 */
export interface SiteBuilderDeps {
  routes?: RouteRegistry;
  slots?: UISlotRegistry;
  headScripts?: Map<string, string>;
}

/** What the site builder holds while it runs. */
export interface SiteBuilderState {
  readonly routes: RouteRegistry;
  readonly slots: UISlotRegistry;
  readonly headScripts: Map<string, string>;
  readonly builder: SiteBuilder;
  readonly status: SiteBuildStatusService;
  readonly rebuilds: RebuildManager;
  readonly reads: SiteWorkspaceReads;
  readonly build: ReturnType<typeof handleSiteBuild>;
}

const buildSiteInput = z.object({
  environment: z
    .enum(["preview", "production"])
    .optional()
    .describe(
      "Build environment (defaults to production, or preview if configured)",
    ),
});

// A slot contribution carries a bound renderer, which is a function rather
// than data — the schema checks that one arrived, and the site engine's own
// type says what it must be.
const slotRegistrationPayload = z.looseObject({
  slotName: z.string().min(1),
  pluginId: z.string().min(1),
  render: z.custom<SlotRegistration["render"]>(
    (value) => typeof value === "function",
  ),
  priority: z.number().optional(),
});

const headScriptPayload = z.looseObject({
  pluginId: z.string().min(1),
  script: z.string(),
});

/**
 * The brain's own website: the routes it serves, the templates that fill
 * them, and the builds that write them out.
 *
 * It renders types it does not own — the package that owns one registers
 * how it looks and the build asks what exists. What a build writes is
 * files, never entities, and the runtime serves the directories this
 * declaration names.
 */
export function siteBuilderService(
  deps: SiteBuilderDeps = {},
): ServicePackageDefinition<typeof siteBuilderConfigSchema> {
  return defineServicePlugin(
    {
      id: "site-builder",
      config: siteBuilderConfigSchema,

      setup: async ({
        config,
        lifecycle,
        entities,
        identity,
        messaging,
        jobs,
        views,
        templates,
        runtimeState,
        logger,
        domain,
        siteUrl,
        previewUrl,
        localSiteUrl,
        preferLocalUrls,
      }): Promise<SiteBuilderState> => {
        const routes = deps.routes ?? new RouteRegistry(logger);
        const slots = deps.slots ?? new UISlotRegistry();
        const headScripts = deps.headScripts ?? new Map<string, string>();
        for (const [index, script] of config.headScripts.entries()) {
          headScripts.set(`site-package:${index}`, script);
        }
        if (config.routes) {
          registerConfigRoutes(config.routes, "site-builder", routes);
        }

        const status = new SiteBuildStatusService(
          { scoped: runtimeState },
          jobs,
        );
        await status.initialize();

        const builder = SiteBuilder.createFresh(
          logger.child("SiteBuilder"),
          {
            entityService: entities,
            sendMessage: messaging.request,
            publishMessage: messaging.publish,
            resolveTemplateContent: (name, options) =>
              templates.resolve(name, options),
            getViewTemplate: (name) => views.get(name),
            listViewTemplateNames: (): string[] =>
              views.list().map((template) => template.name),
          },
          routes,
          { getProfile: () => identity.getProfile() },
          undefined,
          config.entityDisplay,
        );

        const rebuilds = new RebuildManager(config, jobs, logger, status);

        const reads: SiteWorkspaceReads = {
          config,
          routes,
          status,
          send: messaging.request,
          views: () =>
            views.list().map((template) => ({
              name: template.name,
              description: template.description,
              hasWebRenderer: Boolean(template.renderers.web),
            })),
          domain,
          previewUrl,
          siteUrl,
          requestBuild: (environment): void => {
            rebuilds.requestBuild(environment);
          },
        };

        const build = handleSiteBuild({
          siteBuilder: builder,
          messaging,
          logger: logger.child("SiteBuildJob"),
          layouts: config.layouts ?? {},
          defaultSiteConfig: config.siteInfo,
          sharedImagesDir: config.sharedImagesDir,
          siteUrl,
          previewUrl,
          localSiteUrl,
          preferLocalUrls,
          themeCSS: config.themeCSS,
          slots,
          getHeadScripts: (): string[] => [...headScripts.values()],
          ...(config.staticAssets && { staticAssets: config.staticAssets }),
          statusService: status,
          onBuildStarted: (environment, jobId, inputGeneration): void => {
            rebuilds.markBuildStarted(environment, jobId, inputGeneration);
          },
          onBuildFinished: (
            environment,
            jobId,
            inputGeneration,
          ): Promise<void> =>
            rebuilds.markBuildFinished(environment, jobId, inputGeneration),
        });

        lifecycle.onCleanup(async () => {
          await rebuilds.dispose();
          await builder.cancelActiveBuilds();
        });

        return {
          routes,
          slots,
          headScripts,
          builder,
          status,
          rebuilds,
          reads,
          build,
        };
      },
    },
    {
      jobs: ({ state }) => [state.build],

      // Routes, slots and head scripts all arrive from the packages that own
      // what they render. The payload schema is the boundary.
      subscriptions: ({ state }) => [
        ...routeSubscriptions(state.routes),
        defineSubscription({
          topic: SITE_BUILDER_CHANNELS.slotRegister,
          payload: slotRegistrationPayload,
          handle: ({ payload }) => {
            state.slots.register(payload.slotName, {
              pluginId: payload.pluginId,
              render: payload.render,
              ...(payload.priority !== undefined && {
                priority: payload.priority,
              }),
            });
            return { success: true };
          },
        }),
        defineSubscription({
          topic: SITE_BUILDER_CHANNELS.headScriptRegister,
          payload: headScriptPayload,
          handle: ({ payload }) => {
            // Keyed by package, so re-registering replaces rather than repeats.
            state.headScripts.set(payload.pluginId, payload.script);
            return { success: true };
          },
        }),
        // The instructions are rebuilt from the site's own metadata, so a
        // change to it means the prompt this package supplies is stale.
        defineSubscription({
          topic: SITE_METADATA_UPDATED_CHANNEL,
          payload: z.looseObject({}),
          handle: () => ({ success: true }),
        }),
        // A finished projection wave is when the brain's records have settled
        // enough to be worth rendering; individual writes are not.
        defineSubscription({
          topic: PROJECTION_CHANNELS.waveReady,
          payload: ProjectionWaveReadySchema,
          handle: async ({ payload }) => {
            await state.rebuilds.onProjectionWave(payload);
            return { success: true };
          },
        }),
      ],

      dataSources: ({ state }) => [
        defineDataSource({
          id: "navigation",
          name: "Site Navigation DataSource",
          description: "Provides navigation items for site menus",
          fetch: async (query) => navigationFor(state.routes, query),
        }),
      ],

      tools: ({ state }) => [
        defineTool({
          name: "build-site",
          description:
            "Build a static site from registered routes. Call this for every user build/rebuild request, including repeated requests like 'build it again' or 'one more build'.",
          input: buildSiteInput,
          output: z.object({ requested: z.string() }),
          permission: "admin",
          sideEffects: "external",
          execute: ({ input }) => {
            state.rebuilds.requestBuild(input.environment);
            return { requested: input.environment ?? "default" };
          },
        }),
      ],

      // What the site is and what it serves, for an agent reading rather
      // than building. Every answer is a read of what packages registered.
      resources: ({ config, state }) => ({
        site: {
          uri: "brain://site",
          description: "Site metadata — title, description, domain, URLs",
          mimeType: "application/json",
          read: async (): Promise<string> => {
            const metadata = await resolveSiteMetadata(
              state.reads.send,
              config.siteInfo,
            );
            return JSON.stringify(
              {
                ...metadata,
                domain: state.reads.domain,
                siteUrl: state.reads.siteUrl,
                previewUrl: state.reads.previewUrl,
              },
              null,
              2,
            );
          },
        },
        routes: {
          uri: "site://routes",
          description: "All registered routes with sections and templates",
          mimeType: "application/json",
          read: (): string =>
            JSON.stringify(
              state.routes.list().map((route) => ({
                id: route.id,
                path: route.path,
                title: route.title,
                description: route.description,
                sections: route.sections.map((section) => ({
                  id: section.id,
                  template: section.template,
                })),
              })),
              null,
              2,
            ),
        },
        templates: {
          uri: "site://templates",
          description: "All registered view templates",
          mimeType: "application/json",
          read: (): string =>
            JSON.stringify(
              state.reads.views().map((template) => ({
                name: template.name,
                description: template.description,
                hasWebRenderer: template.hasWebRenderer,
              })),
              null,
              2,
            ),
        },
      }),

      staticSite: ({ config }): StaticSiteOutput => ({
        productionOutputDir: config.productionOutputDir,
        previewOutputDir: config.previewOutputDir,
        sharedImagesDir: config.sharedImagesDir,
      }),

      dashboardWidgets: (context) => [
        siteHealthWidget.bind(
          context,
          loadSiteHealthWidget(context.state.reads),
        ),
      ],

      studioWorkspaces: (context) => {
        const handlers = siteWorkspaceHandlers(context.state.reads);
        return [
          siteWorkspace.bind(context, {
            authorize: handlers.authorize,
            load: handlers.load,
            actions: [
              buildPreviewAction.bind(context, handlers.buildPreview),
              buildProductionAction.bind(context, handlers.buildProduction),
            ],
          }),
        ];
      },

      instructions: async ({ config, state }) => {
        const metadata = await resolveSiteMetadata(
          state.reads.send,
          config.siteInfo,
        );
        const parts = [
          `**Title:** ${metadata.title}`,
          `**Description:** ${metadata.description}`,
          state.reads.domain && `**Domain:** ${state.reads.domain}`,
          state.reads.siteUrl && `**URL:** ${state.reads.siteUrl}`,
        ].filter(Boolean);
        return `## Your Site\n${parts.join("\n")}\n\n## Site Builder Actions
- When the user asks to build, rebuild, publish, or build the website/site again, call \`site-builder_build-site\` immediately.
- Every repeated build request requires a fresh \`site-builder_build-site\` call. Do not say a build was started, queued, or requested unless this turn invoked the tool.`;
      },
    },
  );
}
