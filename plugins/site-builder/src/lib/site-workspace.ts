import {
  defineStudioWorkspace,
  defineEntity,
  defineWorkspaceAction,
  registerBuiltInStudioWorkspace,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import type { RouteRegistry } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import type { SiteBuilderConfig } from "../config";
import {
  recentSiteBuildSchema,
  siteBuildEnvironmentSchema,
  siteBuildEnvironmentStatusSchema,
  type SiteBuildEnvironment,
  type SiteBuildStatusService,
} from "./site-build-status";
import {
  readSitePublicationStatus,
  sitePublicationStatusSchema,
} from "./site-publication-status";
import { resolveSiteMetadata } from "./site-metadata";

export const siteWorkspaceActionSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ type: z.ZodLiteral<"build-preview"> }>,
    z.ZodObject<{
      type: z.ZodLiteral<"build-production">;
      confirmed: z.ZodLiteral<true>;
    }>,
  ],
  "type"
> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("build-preview") }),
  z.object({
    type: z.literal("build-production"),
    confirmed: z.literal(true),
  }),
]);

export type SiteWorkspaceAction = z.output<typeof siteWorkspaceActionSchema>;

const buildEnvironmentSchema: z.ZodObject<
  (typeof siteBuildEnvironmentStatusSchema)["shape"] & {
    publication: typeof sitePublicationStatusSchema;
  }
> = z.object({
  ...siteBuildEnvironmentStatusSchema.shape,
  publication: sitePublicationStatusSchema,
});
const siteWorkspaceDataSchema: z.ZodObject<{
  site: z.ZodObject<{
    title: z.ZodString;
    previewUrl: z.ZodOptional<z.ZodString>;
    liveUrl: z.ZodOptional<z.ZodString>;
  }>;
  automation: z.ZodObject<{
    autoRebuild: z.ZodBoolean;
    debounceMs: z.ZodNumber;
    defaultEnvironment: typeof siteBuildEnvironmentSchema;
  }>;
  environments: z.ZodArray<typeof buildEnvironmentSchema>;
  recentBuilds: z.ZodArray<typeof recentSiteBuildSchema>;
  routes: z.ZodArray<
    z.ZodObject<{ id: z.ZodString; path: z.ZodString; title: z.ZodString }>
  >;
}> = z.object({
  site: z.object({
    title: z.string().min(1),
    previewUrl: z.string().url().optional(),
    liveUrl: z.string().url().optional(),
  }),
  automation: z.object({
    autoRebuild: z.boolean(),
    debounceMs: z.number().int().nonnegative(),
    defaultEnvironment: siteBuildEnvironmentSchema,
  }),
  environments: z.array(buildEnvironmentSchema),
  recentBuilds: z.array(recentSiteBuildSchema),
  routes: z.array(
    z.object({ id: z.string().min(1), path: z.string(), title: z.string() }),
  ),
});

export type SiteWorkspaceSnapshot = z.output<typeof siteWorkspaceDataSchema>;

const actionOutputSchema = z.object({
  accepted: z.literal(true),
  environment: z.enum(["preview", "production"]),
});
const buildPreviewAction = defineWorkspaceAction({
  name: "build-preview",
  label: "Build preview",
  permission: "trusted",
  input: z.object({}),
  output: actionOutputSchema,
});
const buildProductionAction = defineWorkspaceAction({
  name: "build-production",
  label: "Build production",
  permission: "admin",
  confirmation: {
    kind: "static",
    message: "Build and publish the production site now?",
  },
  input: z.object({}),
  output: actionOutputSchema,
});
type SiteActionDefinition =
  typeof buildPreviewAction | typeof buildProductionAction;
type SiteRegionBlock = OperatorRegionBlock<SiteActionDefinition>;
type SiteCardBlock = Extract<SiteRegionBlock, { type: "card" }>;

/** How many routes the workspace shows before summarising the remainder. */
const ROUTE_PREVIEW_COUNT = 8;

const siteInfoEntity = defineEntity({
  type: "site-info",
  purpose: "Site identity and navigation settings",
  metadata: z.object({}),
});

function activeBuildProgress(
  environment: SiteWorkspaceSnapshot["environments"][number],
): Extract<OperatorViewBlock, { type: "progress" }> {
  return {
    type: "progress",
    id: `${environment.environment}-build`,
    label: `${environment.environment} build`,
    state: environment.active?.state ?? "active",
    startedAt: environment.active?.startedAt ?? environment.active?.requestedAt,
    tone: "neutral",
  };
}

function buildFailureNotice(
  environment: SiteWorkspaceSnapshot["environments"][number],
): SiteRegionBlock[] {
  const failure = environment.lastFailure;
  if (!failure) return [];
  const failedAt = Date.parse(failure.completedAt);
  if (
    environment.lastSuccess &&
    Date.parse(environment.lastSuccess.completedAt) >= failedAt
  )
    return [];
  if (
    environment.lastCancellation &&
    Date.parse(environment.lastCancellation.completedAt) >= failedAt
  )
    return [];
  return [
    {
      type: "notice",
      id: `${environment.environment}-failure`,
      tone: "warn",
      title: "The latest completed build failed",
      text:
        environment.publication.state === "published"
          ? "The published generation is shown separately below."
          : "Review the build diagnostics before trying again.",
      details: [
        `Completed: ${failure.completedAt}\nJob: ${failure.jobId}`,
        failure.message,
      ],
    },
  ];
}

function environmentCard(
  environment: SiteWorkspaceSnapshot["environments"][number],
  href: string | undefined,
): SiteCardBlock {
  const isPreview = environment.environment === "preview";
  const publication = environment.publication;
  const publicationFacts =
    publication.state === "published"
      ? [
          { label: "Published generation", value: publication.buildId },
          { label: "Published at", value: publication.publishedAt },
          {
            label: "Published result",
            value: `${publication.routesBuilt} routes`,
          },
        ]
      : [
          {
            label: "Published generation",
            value:
              publication.state === "unreadable"
                ? publication.message
                : "not published",
          },
        ];
  return {
    type: "card",
    id: `site-${environment.environment}-card`,
    label:
      publication.state === "published"
        ? "Published"
        : publication.state === "unreadable"
          ? "Publication unavailable"
          : "Not published yet",
    presentation: "feature",
    metadata: [isPreview ? "Preview" : "Production"],
    tone: publication.state === "unreadable" ? "warn" : "neutral",
    blocks: [
      {
        type: "key-values",
        id: `${environment.environment}-facts`,
        items: [...publicationFacts],
      },
      ...(href
        ? [
            {
              type: "links" as const,
              id: `${environment.environment}-open`,
              items: [
                {
                  label: isPreview ? "Open preview" : "Open live site",
                  target: { external: href },
                },
              ],
            },
          ]
        : []),
      {
        type: "actions",
        id: `${environment.environment}-actions`,
        items: [
          isPreview
            ? {
                action: buildPreviewAction,
                input: {},
                disabled: Boolean(environment.active),
              }
            : {
                action: buildProductionAction,
                input: {},
                disabled: Boolean(environment.active),
              },
        ],
      },
    ],
  };
}

function renderDetailsCard(
  environment: SiteWorkspaceSnapshot["environments"][number],
): SiteCardBlock {
  return {
    type: "card",
    id: `${environment.environment}-render-details`,
    label: "Render details",
    presentation: "disclosure",
    blocks: [
      {
        type: "key-values",
        items: [
          {
            label: "Last successful render",
            value: environment.lastSuccess?.completedAt ?? "—",
          },
          {
            label: "Rendered result",
            value: environment.lastSuccess
              ? `${environment.lastSuccess.routesBuilt} routes · ${environment.lastSuccess.jobId}`
              : "no successful render",
          },
          ...(environment.lastFailure
            ? [
                {
                  label: "Last failed attempt",
                  value: environment.lastFailure.completedAt,
                },
                { label: "Failed job", value: environment.lastFailure.jobId },
              ]
            : []),
        ],
      },
    ],
  };
}

const siteWorkspace = defineStudioWorkspace({
  id: "site",
  label: "Site",
  permission: "trusted",
  data: siteWorkspaceDataSchema,
  actions: [buildPreviewAction, buildProductionAction],
  refresh: ({ data }) =>
    data.environments.some((environment) => environment.active)
      ? 1_000
      : undefined,
  view: ({ data }) => {
    const links: Extract<OperatorViewBlock, { type: "links" }>["items"] = [
      ...(data.site.previewUrl
        ? [
            {
              label: "Open preview",
              target: { external: data.site.previewUrl },
            },
          ]
        : []),
      ...(data.site.liveUrl
        ? [
            {
              label: "Open live site",
              target: { external: data.site.liveUrl },
            },
          ]
        : []),
      {
        label: "Edit site settings",
        target: { entity: siteInfoEntity, id: "site-info" },
      },
    ];
    const routeRemainder: Extract<OperatorViewBlock, { type: "notice" }>[] =
      data.routes.length > ROUTE_PREVIEW_COUNT
        ? [
            {
              type: "notice",
              id: "routes-remainder",
              text: `${data.routes.length - ROUTE_PREVIEW_COUNT} further routes are configured.`,
            },
          ]
        : [];
    const routesCard: SiteCardBlock = {
      type: "card",
      id: "site-routes",
      label: "Configured routes",
      presentation: "disclosure",
      metadata: [`${data.routes.length} configured`],
      blocks: [
        {
          type: "table",
          id: "routes",
          empty: "No site routes are configured.",
          columns: [
            { key: "title", label: "Route" },
            { key: "path", label: "Path" },
          ],
          rows: data.routes.slice(0, ROUTE_PREVIEW_COUNT).map((route) => ({
            id: route.id,
            cells: { title: route.title, path: route.path },
            compact: { title: route.title, metadata: [route.path] },
          })),
        },
        ...routeRemainder,
      ],
    };
    return {
      title: "Site",
      blocks: [
        {
          type: "tabs",
          id: "site-environments",
          label: "Environment",
          defaultTab: "preview",
          tabs: data.environments.map((environment) => ({
            id: environment.environment,
            label:
              environment.environment === "preview" ? "Preview" : "Production",
            blocks: [
              {
                type: "columns",
                id: "site-body",
                primary: [
                  ...buildFailureNotice(environment),
                  ...(environment.active
                    ? [activeBuildProgress(environment)]
                    : []),
                  environmentCard(
                    environment,
                    environment.environment === "preview"
                      ? data.site.previewUrl
                      : data.site.liveUrl,
                  ),
                  renderDetailsCard(environment),
                  routesCard,
                  {
                    type: "card",
                    id: "site-recent-builds",
                    label: "Recent builds",
                    blocks: [
                      {
                        type: "list",
                        id: "recent-builds",
                        presentation: "activity",
                        empty: "No site builds have completed yet.",
                        items: data.recentBuilds
                          .filter(
                            (build) =>
                              build.environment === environment.environment,
                          )
                          .map((build) => ({
                            id: build.jobId,
                            title: `${build.environment} · ${build.outcome}`,
                            description: build.message,
                            tone:
                              build.outcome === "succeeded"
                                ? "good"
                                : build.outcome === "failed"
                                  ? "error"
                                  : "neutral",
                            metadata: [
                              `Completed: ${build.completedAt}`,
                              ...(build.routesBuilt === undefined
                                ? []
                                : [`Routes: ${build.routesBuilt}`]),
                              ...(build.warnings?.length
                                ? [`Warnings: ${build.warnings.length}`]
                                : []),
                            ],
                          })),
                      },
                    ],
                  },
                ],
                aside: [
                  {
                    type: "card",
                    id: "site-automation-card",
                    label: "Automation",
                    blocks: [
                      {
                        type: "key-values",
                        id: "automation",
                        items: [
                          {
                            label: "Automatic rebuild",
                            value: data.automation.autoRebuild,
                          },
                          {
                            label: "Debounce",
                            value: `${data.automation.debounceMs} ms`,
                          },
                          {
                            label: "Default environment",
                            value: data.automation.defaultEnvironment,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "card",
                    id: "site-automation-links",
                    label: "Site links",
                    presentation: "disclosure",
                    blocks: [{ type: "links", id: "site-links", items: links }],
                  },
                ],
              },
            ],
          })),
        },
      ],
    };
  },
});

export interface SiteWorkspaceProviderOptions {
  context: ServicePluginContext;
  config: SiteBuilderConfig;
  routeRegistry: RouteRegistry;
  statusService: SiteBuildStatusService;
  requestBuild: (environment: SiteBuildEnvironment) => void;
}

export class SiteWorkspaceProvider {
  private readonly options: SiteWorkspaceProviderOptions;
  private registered = false;

  constructor(options: SiteWorkspaceProviderOptions) {
    this.options = options;
  }

  async getSnapshot(): Promise<SiteWorkspaceSnapshot> {
    const { context, config, routeRegistry, statusService } = this.options;
    const [metadata, status, previewPublication, productionPublication] =
      await Promise.all([
        resolveSiteMetadata(context.messaging.send, config.siteInfo),
        statusService.getSnapshot(),
        readSitePublicationStatus(config.previewOutputDir, "preview"),
        readSitePublicationStatus(config.productionOutputDir, "production"),
      ]);
    return siteWorkspaceDataSchema.parse({
      site: {
        title: metadata.title,
        ...(context.previewUrl ? { previewUrl: context.previewUrl } : {}),
        ...(context.siteUrl ? { liveUrl: context.siteUrl } : {}),
      },
      automation: {
        autoRebuild: config.autoRebuild,
        debounceMs: config.rebuildDebounce,
        defaultEnvironment: config.previewOutputDir ? "preview" : "production",
      },
      environments: status.environments.map((environment) => ({
        ...environment,
        publication:
          environment.environment === "preview"
            ? previewPublication
            : productionPublication,
      })),
      recentBuilds: status.recentBuilds,
      routes: routeRegistry.list().map((route) => ({
        id: route.id,
        path: route.path,
        title: route.title,
      })),
    });
  }

  async registerStudioWorkspace(): Promise<string | undefined> {
    const result = await registerBuiltInStudioWorkspace({
      context: this.options.context,
      definition: siteWorkspace,
      bind: (context) =>
        siteWorkspace.bind(context, {
          authorize: ({ caller, permissions }) =>
            caller?.permission === "admin" ||
            permissions.allows(siteInfoEntity, "update"),
          load: () => this.getSnapshot(),
          actions: [
            buildPreviewAction.bind(context, ({ permissions }) => {
              if (!permissions.allows(siteInfoEntity, "update")) {
                throw new Error(
                  "Preview site build requires update permission",
                );
              }
              this.options.requestBuild("preview");
              return { accepted: true, environment: "preview" };
            }),
            buildProductionAction.bind(context, () => {
              this.options.requestBuild("production");
              return { accepted: true, environment: "production" };
            }),
          ],
        }),
    });
    this.registered = result !== false;
    return result === false ? undefined : result.workspaceUrl;
  }

  async unregisterStudioWorkspace(): Promise<void> {
    if (!this.registered) return;
    await this.options.context.studio.unregisterWorkspace(
      `${this.options.context.pluginId}:site`,
    );
    this.registered = false;
  }
}
