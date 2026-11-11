import { access } from "node:fs/promises";
import { join } from "node:path";
import { siteHeadScriptsContract } from "@brains/contracts";
import { defineServicePlugin } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  serviceRuntime,
  withJobHandlers,
  withStaticSiteOutput,
  withTools,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { IMessagingNamespace } from "@brains/plugins";
import {
  siteBuilderPagesContract,
  siteBuilderSlotsContract,
  siteMetadataUpdatedChannel,
  type RouteDefinition,
} from "@brains/site-composition";
import { RouteRegistry, UISlotRegistry } from "@brains/site-engine";
import type { Logger } from "@brains/utils/logger";
import { SiteBuilder, type SiteBuilderServices } from "./lib/site-builder";
import { RebuildManager } from "./lib/auto-rebuild";
import { setupRouteHandlers } from "./lib/route-handlers";
import { registerConfigRoutes } from "./lib/route-helpers";
import { siteBuildJob } from "./handlers/siteBuildJobHandler";
import { navigationDataSource } from "./datasources/navigation-datasource";
import { resolveSiteMetadata } from "./lib/site-metadata";
import { createSiteBuilderTools } from "./tools/index";
import { SiteBuildStatusService } from "./lib/site-build-status";
import { SiteWorkspaceProvider } from "./lib/site-workspace";
import { registerSiteHealthWidget } from "./lib/dashboard-widget";
import {
  siteBuilderConfigSchema,
  type SiteBuilderConfig,
  type SiteBuilderConfigInput,
} from "./config";

export type { SiteBuilderConfig, SiteBuilderConfigInput };

/** What the site builder holds while it runs, built once when it registers. */
export interface SiteBuilderState {
  readonly routes: RouteRegistry;
  readonly builder: SiteBuilder;
  readonly status: SiteBuildStatusService;
  readonly rebuilds: RebuildManager;
  readonly workspace: SiteWorkspaceProvider;
  /** Every page's head scripts: the site package's own, then each plugin's. */
  getHeadScripts(): Promise<string[]>;
  /** The pages plugins add to one build, such as forms defined in content. */
  getPages(): Promise<RouteDefinition[]>;
  /** The layout slots plugins fill for one build. */
  getSlots(): Promise<UISlotRegistry>;
  /** The agent instructions naming the site. */
  instructions(): Promise<string>;
  /** The site's metadata, domain and URLs, for the brain://site resource. */
  siteResource(): Promise<string>;
  /** Every registered view template, for the site://templates resource. */
  viewTemplatesResource(): string;
}

/** What a test hands the package to watch it set up. */
export interface SiteBuilderDeps {
  /** Told the state once setup has built it. */
  onSetup?: ((state: SiteBuilderState) => void) | undefined;
}

/**
 * Answer as the class answered through context.messaging.answer: the
 * runtime answers as the package and releases the answer when the package
 * shuts down, so the release handed back has nothing left to do.
 */
function classAnswer(
  runtime: ServiceRuntime,
): Pick<IMessagingNamespace, "answer"> {
  return {
    answer: (contract, handler, options) => {
      runtime.answer(
        contract,
        ({ request, sender }) => handler(request, { sender }),
        options?.everyProcess === true ? { everyProcess: true } : {},
      );
      return (): void => {};
    },
  };
}

/**
 * A start, an upgrade included, may bring new renderer code that the input
 * fingerprint cannot see; the renderer identity is fresh per process, so a
 * requested build renders again. Every environment that already has an
 * output is built again; one never built stays untouched.
 */
async function rebuildOutputsAfterStart(
  config: SiteBuilderConfig,
  rebuilds: RebuildManager,
): Promise<void> {
  const outputs = [
    ["production", config.productionOutputDir],
    ["preview", config.previewOutputDir],
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
    if (exists) rebuilds.requestBuild(environment);
  }
}

/** The site's metadata, as the brain://site resource and the instructions read it. */
function siteDescription(
  runtime: ServiceRuntime,
  config: SiteBuilderConfig,
): {
  instructions(): Promise<string>;
  resource(): Promise<string>;
} {
  return {
    instructions: async (): Promise<string> => {
      const siteMetadata = await resolveSiteMetadata(
        runtime.messaging,
        config.siteInfo,
      );
      const parts = [
        `**Title:** ${siteMetadata.title}`,
        `**Description:** ${siteMetadata.description}`,
        runtime.domain && `**Domain:** ${runtime.domain}`,
        runtime.siteUrl && `**URL:** ${runtime.siteUrl}`,
      ].filter(Boolean);
      return `## Your Site\n${parts.join("\n")}`;
    },
    resource: async (): Promise<string> => {
      const siteMetadata = await resolveSiteMetadata(
        runtime.messaging,
        config.siteInfo,
      );
      return JSON.stringify(
        {
          ...siteMetadata,
          domain: runtime.domain,
          siteUrl: runtime.siteUrl,
          previewUrl: runtime.previewUrl,
        },
        null,
        2,
      );
    },
  };
}

/** Build the site builder's pipeline, as its class built it when it registered. */
async function setUpSiteBuilder(
  runtime: ServiceRuntime,
  config: SiteBuilderConfig,
  onCleanup: (cleanup: () => void | Promise<void>) => void,
): Promise<SiteBuilderState> {
  const logger: Logger = runtime.logger;
  const routes = new RouteRegistry(logger);
  runtime.dataSource(
    navigationDataSource(routes, logger.child("NavigationDataSource")),
    { asWritten: true },
  );

  const status = new SiteBuildStatusService(
    runtime.classRuntimeState,
    runtime.jobs,
  );
  await status.initialize();

  const messaging = classAnswer(runtime);
  setupRouteHandlers({ messaging }, routes, logger);

  for (const [name, template] of Object.entries(config.templates ?? {})) {
    runtime.template(name, template);
  }
  if (config.routes) {
    registerConfigRoutes(config.routes, "site-builder", routes);
  }

  const services: SiteBuilderServices = {
    entityService: runtime.entityReads,
    command: runtime.messaging.command,
    resolveTemplateContent: (templateName, options) =>
      runtime.resolveTemplate(templateName, options),
    getViewTemplate: (name) => runtime.views.get(name),
    listViewTemplateNames: (): string[] =>
      runtime.views.list().map((template) => template.name),
    hasSavedContent: async (id): Promise<boolean> =>
      (await runtime.entityReads.getEntity({
        entityType: "site-content",
        id,
      })) !== null,
  };
  const builder = SiteBuilder.createFresh(
    logger.child("SiteBuilder"),
    services,
    routes,
    { getProfile: () => runtime.identity.getProfile() },
    undefined,
    runtime.entityDisplay,
  );

  const rebuilds = new RebuildManager(
    config,
    { messaging, jobs: runtime.jobs },
    "site-builder",
    logger,
    status,
  );
  const workspace = new SiteWorkspaceProvider({
    messaging: runtime.messaging,
    siteUrl: runtime.siteUrl,
    previewUrl: runtime.previewUrl,
    studio: runtime.studio,
    config,
    routeRegistry: routes,
    statusService: status,
    requestBuild: (environment): void => {
      rebuilds.requestBuild(environment);
    },
  });

  if (config.autoRebuild) {
    logger.debug("Auto-rebuild enabled");
    rebuilds.setupAutoRebuild();
  }

  // Rebuilt once startup content has settled, so a queued startup import
  // is in the site before it renders.
  runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
    await rebuildOutputsAfterStart(config, rebuilds);
  });

  const description = siteDescription(runtime, config);
  // Registered again when site metadata changes, so the prompt stays fresh.
  runtime.listen(siteMetadataUpdatedChannel, async () => {
    runtime.instructions(await description.instructions());
  });

  registerSiteHealthWidget(runtime, workspace);
  runtime.ready(async () => {
    await workspace.registerStudioWorkspace();
  });

  // Run last first when the package shuts down: the workspace comes off
  // Studio, pending rebuilds stop, then running builds are cancelled.
  onCleanup(() => builder.cancelActiveBuilds());
  onCleanup(() => rebuilds.dispose());
  onCleanup(() => workspace.unregisterStudioWorkspace());

  return {
    routes,
    builder,
    status,
    rebuilds,
    workspace,
    // Asked at build time, so they reach the worker whatever order plugins
    // registered in.
    getHeadScripts: async (): Promise<string[]> => {
      const collection = await runtime.messaging.gather(
        siteHeadScriptsContract,
        {},
      );
      const contributed =
        collection.status === "answered" ? collection.answers : [];
      return [...config.headScripts, ...contributed];
    },
    getPages: async (): Promise<RouteDefinition[]> => {
      const collection = await runtime.messaging.gather(
        siteBuilderPagesContract,
        {},
      );
      return collection.status === "answered" ? collection.answers.flat() : [];
    },
    getSlots: async (): Promise<UISlotRegistry> => {
      const collection = await runtime.messaging.gather(
        siteBuilderSlotsContract,
        {},
      );
      const slots = new UISlotRegistry();
      const answers =
        collection.status === "answered" ? collection.answers : [];
      for (const { slotName, pluginId, render, priority } of answers.flat())
        slots.register(slotName, {
          pluginId,
          render,
          ...(priority !== undefined && { priority }),
        });
      return slots;
    },
    instructions: description.instructions,
    siteResource: description.resource,
    viewTemplatesResource: (): string =>
      JSON.stringify(
        runtime.views.list().map((t) => ({
          name: t.name,
          description: t.description,
          hasWebRenderer: !!t.renderers.web,
        })),
        null,
        2,
      ),
  };
}

/**
 * The brain's static site: the routes it serves, the templates that fill
 * them and the builds that write them out, to the directories the runtime's
 * HTTP host serves.
 */
export function createSiteBuilderPackage(
  deps: SiteBuilderDeps = {},
): ServicePackageDefinition<typeof siteBuilderConfigSchema> {
  const service = defineServicePlugin(
    {
      id: "site-builder",
      config: siteBuilderConfigSchema,
      setup: async (context): Promise<SiteBuilderState> => {
        const state = await setUpSiteBuilder(
          serviceRuntime(context),
          context.config,
          context.lifecycle.onCleanup,
        );
        deps.onSetup?.(state);
        return state;
      },
    },
    {
      instructions: ({ state }) => state.instructions(),
      resources: ({ state }) => ({
        "Site Metadata": {
          uri: "brain://site",
          description: "Site metadata — title, description, domain, URLs",
          mimeType: "application/json",
          read: (): Promise<string> => state.siteResource(),
        },
        "Site Routes": {
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
                sections: route.sections.map((s) => ({
                  id: s.id,
                  template: s.template,
                })),
              })),
              null,
              2,
            ),
        },
        "View Templates": {
          uri: "site://templates",
          description: "All registered view templates",
          mimeType: "application/json",
          read: (): string => state.viewTemplatesResource(),
        },
      }),
    },
  );
  return withStaticSiteOutput(
    withTools<typeof siteBuilderConfigSchema, SiteBuilderState>(
      withJobHandlers<typeof siteBuilderConfigSchema, SiteBuilderState>(
        service,
        (context) => {
          const runtime = serviceRuntime(context);
          const { config, state } = context;
          return [
            siteBuildJob(
              runtime.logger.child("SiteBuildJobHandler"),
              runtime.messaging,
              {
                siteBuilder: state.builder,
                layouts: config.layouts ?? {},
                defaultSiteConfig: config.siteInfo,
                sharedImagesDir: config.sharedImagesDir,
                siteUrl: runtime.siteUrl,
                previewUrl: runtime.previewUrl,
                localSiteUrl: runtime.localSiteUrl,
                preferLocalUrls: runtime.preferLocalUrls,
                themeCSS: config.themeCSS,
                getSlots: () => state.getSlots(),
                getHeadScripts: () => state.getHeadScripts(),
                getPages: () => state.getPages(),
                ...(config.staticAssets && {
                  staticAssets: config.staticAssets,
                }),
                ...(config.languages && { languages: config.languages }),
                statusService: state.status,
              },
            ),
          ];
        },
      ),
      ({ state }) =>
        createSiteBuilderTools("site-builder", (environment) =>
          state.rebuilds.requestBuild(environment),
        ),
    ),
    ({ config }) => ({
      productionOutputDir: config.productionOutputDir,
      previewOutputDir: config.previewOutputDir,
      sharedImagesDir: config.sharedImagesDir,
    }),
  );
}
