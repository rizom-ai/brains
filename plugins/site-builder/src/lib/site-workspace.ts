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
import type {
  SiteBuildEnvironment,
  SiteBuildEnvironmentStatus,
  SiteBuildStatusService,
} from "./site-build-status";
import {
  readSitePublicationStatus,
  type SitePublicationStatus,
} from "./site-publication-status";
import { resolveSiteMetadata } from "./site-metadata";

export type SiteWorkspaceAction =
  { type: "build-preview" } | { type: "build-production"; confirmed: true };

export const siteWorkspaceActionSchema: z.ZodType<SiteWorkspaceAction> =
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("build-preview") }),
    z.object({
      type: z.literal("build-production"),
      confirmed: z.literal(true),
    }),
  ]);

export interface SiteWorkspaceSnapshot {
  site: {
    title: string;
    previewUrl?: string | undefined;
    liveUrl?: string | undefined;
  };
  automation: {
    autoRebuild: boolean;
    debounceMs: number;
    defaultEnvironment: SiteBuildEnvironment;
  };
  environments: Array<
    SiteBuildEnvironmentStatus & { publication: SitePublicationStatus }
  >;
  recentBuilds: Awaited<
    ReturnType<SiteBuildStatusService["getSnapshot"]>
  >["recentBuilds"];
  routes: Array<{ id: string; path: string; title: string }>;
}

const activeBuildSchema = z.object({
  jobId: z.string().optional(),
  state: z.enum(["debouncing", "queued", "building"]),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
});
const publicationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not-published") }),
  z.object({
    state: z.literal("published"),
    buildId: z.string(),
    publishedAt: z.string().datetime(),
    routesBuilt: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
  z.object({ state: z.literal("unreadable"), message: z.string() }),
]);
const buildEnvironmentSchema = z.object({
  environment: z.enum(["preview", "production"]),
  publication: publicationSchema,
  active: activeBuildSchema.optional(),
  lastSuccess: z
    .object({
      jobId: z.string(),
      completedAt: z.string().datetime(),
      routesBuilt: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    })
    .optional(),
  lastFailure: z
    .object({
      jobId: z.string(),
      completedAt: z.string().datetime(),
      message: z.string(),
    })
    .optional(),
  lastCancellation: z
    .object({
      jobId: z.string(),
      completedAt: z.string().datetime(),
      message: z.string(),
    })
    .optional(),
});
const recentBuildSchema = z.object({
  jobId: z.string(),
  environment: z.enum(["preview", "production"]),
  outcome: z.enum(["succeeded", "failed", "cancelled", "skipped"]),
  completedAt: z.string().datetime(),
  routesBuilt: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
  message: z.string().optional(),
});
const siteWorkspaceDataSchema: z.ZodType<SiteWorkspaceSnapshot> = z.object({
  site: z.object({
    title: z.string().min(1),
    previewUrl: z.string().url().optional(),
    liveUrl: z.string().url().optional(),
  }),
  automation: z.object({
    autoRebuild: z.boolean(),
    debounceMs: z.number().int().nonnegative(),
    defaultEnvironment: z.enum(["preview", "production"]),
  }),
  environments: z.array(buildEnvironmentSchema),
  recentBuilds: z.array(recentBuildSchema),
  routes: z.array(
    z.object({ id: z.string().min(1), path: z.string(), title: z.string() }),
  ),
});

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

function environmentStatus(
  environment: SiteWorkspaceSnapshot["environments"][number],
): "idle" | "active" | "complete" | "failed" {
  if (environment.active) return "active";
  if (environment.publication.state === "unreadable") return "failed";
  if (environment.lastFailure) return "failed";
  if (environment.publication.state === "published") return "complete";
  if (environment.lastSuccess) return "complete";
  return "idle";
}

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

function environmentCard(
  environment: SiteWorkspaceSnapshot["environments"][number],
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
    label: isPreview ? "Preview" : "Live",
    tone: environment.active
      ? "neutral"
      : environment.lastFailure
        ? "warn"
        : environment.lastSuccess
          ? "good"
          : "neutral",
    blocks: [
      {
        type: "key-values",
        id: `${environment.environment}-facts`,
        items: [
          { label: "State", value: environmentStatus(environment) },
          ...publicationFacts,
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
                  label: "Previous failed attempt",
                  value: `${environment.lastFailure.completedAt} · ${environment.lastFailure.jobId}`,
                },
              ]
            : []),
        ],
      },
      {
        type: "actions",
        id: `${environment.environment}-actions`,
        items: [
          isPreview
            ? { action: buildPreviewAction, input: {} }
            : { action: buildProductionAction, input: {} },
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
    const activeBuilds = data.environments.filter(
      (environment) => environment.active,
    );
    const warningCount = data.recentBuilds.reduce(
      (total, build) => total + (build.warnings?.length ?? 0),
      0,
    );
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
    const routeRemainder: SiteRegionBlock[] =
      data.routes.length > ROUTE_PREVIEW_COUNT
        ? [
            {
              type: "notice",
              id: "routes-remainder",
              text: `${data.routes.length - ROUTE_PREVIEW_COUNT} further routes are configured.`,
            },
          ]
        : [];
    const environmentCards = data.environments.map(environmentCard);
    return {
      kicker: "Website operations",
      title: "Site control",
      description:
        "Build a proof with public drafts, then update the live site from published public content.",
      status: {
        label: data.site.title,
        ...(activeBuilds.length > 0
          ? { detail: `${activeBuilds.length} building` }
          : {}),
        tone: warningCount > 0 ? "warn" : "good",
      },
      blocks: [
        {
          type: "stats",
          id: "site-summary",
          items: [
            {
              label: "Routes",
              value: data.routes.length,
              caption: "configured",
            },
            {
              label: "Active builds",
              value: activeBuilds.length,
              caption: activeBuilds.length > 0 ? "running" : "none running",
            },
            {
              label: "Warnings",
              value: warningCount,
              caption: "last build",
              tone: warningCount > 0 ? "warn" : "good",
            },
          ],
        },
        {
          type: "columns",
          id: "site-body",
          primary: [
            {
              type: "flow",
              id: "release-flow",
              label: "Release flow",
              steps: [
                {
                  id: "routes",
                  label: "Routes",
                  status: data.routes.length > 0 ? "complete" : "idle",
                  detail: `${data.routes.length} configured`,
                },
                ...data.environments.map((environment) => ({
                  id: environment.environment,
                  label:
                    environment.environment === "preview"
                      ? "Preview"
                      : "Production",
                  status: environmentStatus(environment),
                  detail:
                    environment.active?.state ??
                    environment.lastFailure?.message ??
                    environment.lastSuccess?.completedAt,
                })),
              ],
            },
            ...activeBuilds.map(activeBuildProgress),
            {
              type: "table",
              id: "routes",
              empty: "No site routes are configured.",
              columns: [
                { key: "title", label: "Route" },
                { key: "path", label: "Path" },
              ],
              // A route list is reference, not the work: show enough to
              // recognise the shape of the site and say how much is beyond it.
              rows: data.routes.slice(0, ROUTE_PREVIEW_COUNT).map((route) => ({
                id: route.id,
                cells: { title: route.title, path: route.path },
              })),
            },
            ...routeRemainder,
            {
              type: "list",
              id: "recent-builds",
              empty: "No site builds have completed yet.",
              items: data.recentBuilds.map((build) => ({
                id: build.jobId,
                title: `${build.environment} · ${build.outcome}`,
                description: build.message,
                badges: [{ label: build.outcome }],
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
          aside: [
            {
              type: "card",
              id: "site-automation-card",
              label: "Automation",
              blocks: [
                {
                  type: "group",
                  id: "automation",
                  label: "Automation",
                  items: [
                    {
                      id: "auto-rebuild",
                      label: "Automatic rebuild",
                      value: data.automation.autoRebuild,
                    },
                    {
                      id: "debounce",
                      label: "Debounce",
                      value: `${data.automation.debounceMs} ms`,
                    },
                    {
                      id: "default-environment",
                      label: "Default environment",
                      value: data.automation.defaultEnvironment,
                    },
                  ],
                },
              ],
            },
            ...environmentCards,
            {
              type: "card",
              id: "site-automation-links",
              label: "Elsewhere",
              blocks: [{ type: "links", id: "site-links", items: links }],
            },
          ],
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
