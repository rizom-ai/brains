import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorCaller,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type StudioWorkspaceDefinition,
  type WorkspaceActionDefinition,
} from "@brains/sdk/services";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import type { RouteRegistry } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import type { SiteMetadataSender } from "./site-metadata";

/** One registered view template, as the site resource reports it. */
export interface SiteViewSummary {
  readonly name: string;
  readonly description: string | undefined;
  readonly hasWebRenderer: boolean;
}
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

type ActionOutputSchema = z.ZodObject<{
  accepted: z.ZodLiteral<true>;
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
}>;
type NoInputSchema = z.ZodObject<Record<string, never>>;
const actionOutputSchema: ActionOutputSchema = z.object({
  accepted: z.literal(true),
  environment: z.enum(["preview", "production"]),
});
const noInputSchema: NoInputSchema = z.object({});

export const buildPreviewAction: WorkspaceActionDefinition<
  "build-preview",
  NoInputSchema,
  ActionOutputSchema
> = defineWorkspaceAction({
  name: "build-preview",
  label: "Build preview",
  permission: "trusted",
  input: noInputSchema,
  output: actionOutputSchema,
});

export const buildProductionAction: WorkspaceActionDefinition<
  "build-production",
  NoInputSchema,
  ActionOutputSchema
> = defineWorkspaceAction({
  name: "build-production",
  label: "Build production",
  permission: "admin",
  confirmation: {
    kind: "static",
    message: "Build and publish the production site now?",
  },
  input: noInputSchema,
  output: actionOutputSchema,
});
type SiteActionDefinition =
  typeof buildPreviewAction | typeof buildProductionAction;
type SiteRegionBlock = OperatorRegionBlock<SiteActionDefinition>;
type SiteCardBlock = Extract<SiteRegionBlock, { type: "card" }>;

/** How many routes the workspace shows before summarising the remainder. */
const ROUTE_PREVIEW_COUNT = 8;

type SiteInfoMetadataSchema = z.ZodObject<Record<string, never>>;
const siteInfoMetadataSchema: SiteInfoMetadataSchema = z.object({});

/** The record the site's identity lives in, named so an action can ask
 * whether the caller may change it. */
const siteInfoEntity: EntityDefinition<"site-info", SiteInfoMetadataSchema> =
  defineEntity({
    type: "site-info",
    purpose: "Site identity and navigation settings",
    metadata: siteInfoMetadataSchema,
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

export const siteWorkspace: StudioWorkspaceDefinition<
  "site",
  typeof siteWorkspaceDataSchema,
  readonly [typeof buildPreviewAction, typeof buildProductionAction]
> = defineStudioWorkspace({
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
                compact: { title: route.title, metadata: [route.path] },
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

/**
 * What the site's operator surfaces read.
 *
 * A workspace and a widget answer the same question — what is this site
 * doing — so they take the same reads and the same way to ask for a build.
 */
export interface SiteWorkspaceReads {
  readonly config: SiteBuilderConfig;
  readonly routes: RouteRegistry;
  readonly status: SiteBuildStatusService;
  readonly send: SiteMetadataSender;
  /** The view templates registered across the brain, as a reader sees them. */
  views(): readonly SiteViewSummary[];
  readonly domain: string | undefined;
  readonly previewUrl: string | undefined;
  readonly siteUrl: string | undefined;
  requestBuild(environment: SiteBuildEnvironment): void;
}

/** Everything the site's operator surfaces show, as one read. */
export async function siteSnapshot(
  reads: SiteWorkspaceReads,
): Promise<SiteWorkspaceSnapshot> {
  const { config, routes, status, send } = reads;
  const [metadata, snapshot, previewPublication, productionPublication] =
    await Promise.all([
      resolveSiteMetadata(send, config.siteInfo),
      status.getSnapshot(),
      readSitePublicationStatus(config.previewOutputDir, "preview"),
      readSitePublicationStatus(config.productionOutputDir, "production"),
    ]);
  return siteWorkspaceDataSchema.parse({
    site: {
      title: metadata.title,
      ...(reads.previewUrl ? { previewUrl: reads.previewUrl } : {}),
      ...(reads.siteUrl ? { liveUrl: reads.siteUrl } : {}),
    },
    automation: {
      autoRebuild: config.autoRebuild,
      debounceMs: config.rebuildDebounce,
      defaultEnvironment: config.previewOutputDir ? "preview" : "production",
    },
    environments: snapshot.environments.map((environment) => ({
      ...environment,
      publication:
        environment.environment === "preview"
          ? previewPublication
          : productionPublication,
    })),
    recentBuilds: snapshot.recentBuilds,
    routes: routes.list().map((route) => ({
      id: route.id,
      path: route.path,
      title: route.title,
    })),
  });
}

/** What the site workspace declaration binds to. */
/** Whether the caller may see or change the site, as the workspace asks. */
interface SiteWorkspaceAuthority {
  readonly caller: OperatorCaller | null;
  readonly permissions: {
    allows(entity: typeof siteInfoEntity, action: "update"): boolean;
  };
}

export interface SiteWorkspaceHandlers {
  authorize(context: SiteWorkspaceAuthority): boolean;
  load(): Promise<SiteWorkspaceSnapshot>;
  buildPreview(context: {
    readonly permissions: SiteWorkspaceAuthority["permissions"];
  }): { accepted: true; environment: "preview" };
  buildProduction(): { accepted: true; environment: "production" };
}

export function siteWorkspaceHandlers(
  reads: SiteWorkspaceReads,
): SiteWorkspaceHandlers {
  return {
    authorize: ({ caller, permissions }) =>
      caller?.permission === "admin" ||
      permissions.allows(siteInfoEntity, "update"),
    load: () => siteSnapshot(reads),
    buildPreview: ({
      permissions,
    }): { accepted: true; environment: "preview" } => {
      if (!permissions.allows(siteInfoEntity, "update")) {
        throw new Error("Preview site build requires update permission");
      }
      reads.requestBuild("preview");
      return { accepted: true, environment: "preview" };
    },
    buildProduction: (): { accepted: true; environment: "production" } => {
      reads.requestBuild("production");
      return { accepted: true, environment: "production" };
    },
  };
}
