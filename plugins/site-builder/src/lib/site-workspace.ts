import {
  defineCmsWorkspace,
  defineEntity,
  defineWorkspaceAction,
  registerBuiltInCmsWorkspace,
  type OperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import type { RouteRegistry } from "@brains/site-engine";
import { z } from "@brains/utils/zod";
import type { SiteBuilderConfig } from "../config";
import type {
  SiteBuildEnvironment,
  SiteBuildStatusService,
} from "./site-build-status";
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
  environments: Awaited<
    ReturnType<SiteBuildStatusService["getSnapshot"]>
  >["environments"];
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
const buildEnvironmentSchema = z.object({
  environment: z.enum(["preview", "production"]),
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
  outcome: z.enum(["succeeded", "failed", "cancelled"]),
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
const siteInfoEntity = defineEntity({
  type: "site-info",
  purpose: "Site identity and navigation settings",
  metadata: z.object({}),
});

function environmentStatus(
  environment: SiteWorkspaceSnapshot["environments"][number],
): "idle" | "active" | "complete" | "failed" {
  if (environment.active) return "active";
  if (environment.lastFailure) return "failed";
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

const siteWorkspace = defineCmsWorkspace({
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
    return {
      title: data.site.title,
      blocks: [
        {
          type: "stats",
          id: "site-summary",
          items: [
            { label: "Routes", value: data.routes.length },
            { label: "Active builds", value: activeBuilds.length },
            { label: "Recent builds", value: data.recentBuilds.length },
            { label: "Warnings", value: warningCount },
          ],
        },
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
        {
          type: "meters",
          id: "build-meters",
          items: [
            { id: "routes", label: "Routes", value: data.routes.length },
            {
              id: "warnings",
              label: "Warnings",
              value: warningCount,
              tone: warningCount > 0 ? "warn" : "good",
            },
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
          rows: data.routes.map((route) => ({
            id: route.id,
            cells: { title: route.title, path: route.path },
          })),
        },
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
        { type: "links", id: "site-links", items: links },
        {
          type: "actions",
          id: "site-actions",
          items: [
            { action: buildPreviewAction, input: {} },
            { action: buildProductionAction, input: {} },
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
    const [metadata, status] = await Promise.all([
      resolveSiteMetadata(context.messaging.send, config.siteInfo),
      statusService.getSnapshot(),
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
      environments: status.environments,
      recentBuilds: status.recentBuilds,
      routes: routeRegistry.list().map((route) => ({
        id: route.id,
        path: route.path,
        title: route.title,
      })),
    });
  }

  async registerCmsWorkspace(): Promise<string | undefined> {
    const result = await registerBuiltInCmsWorkspace({
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

  async unregisterCmsWorkspace(): Promise<void> {
    if (!this.registered) return;
    await this.options.context.cms.unregisterWorkspace(
      `${this.options.context.pluginId}:site`,
    );
    this.registered = false;
  }
}
