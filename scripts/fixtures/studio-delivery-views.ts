import { createMockShell } from "@brains/plugins/test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
  type BaseEntity,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { RouteRegistry } from "@brains/site-engine";
import { siteBuilderConfigSchema } from "../../plugins/site-builder/src/config";
import { SiteBuildStatusService } from "../../plugins/site-builder/src/lib/site-build-status";
import {
  SiteWorkspaceProvider,
  type SiteWorkspaceSnapshot,
} from "../../plugins/site-builder/src/lib/site-workspace";
import { ProviderRegistry } from "../../plugins/content-pipeline/src/provider-registry";
import { QueueManager } from "../../plugins/content-pipeline/src/queue-manager";
import { RetryTracker } from "../../plugins/content-pipeline/src/retry-tracker";
import { PublicationQueueService } from "../../plugins/content-pipeline/src/publication-queue-service";
import { PublishExecutor } from "../../plugins/content-pipeline/src/publish-executor";
import { registerStudioWorkspace } from "../../plugins/content-pipeline/src/lib/studio-workspace";

import type { StudioStudyState } from "./studio-study-state";

class FixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Delivery visual fixture",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }
  override fromMarkdown(content: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content };
  }
}

/** Only source records are seeded; production providers compile the views. */
export async function createDeliveryViewFixtures(
  state?: StudioStudyState,
): Promise<{
  site: () => Promise<unknown>;
  publishing: () => Promise<unknown>;
}> {
  const shell = createMockShell({ domain: "example.com" });
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "visual-admin",
    actor: { kind: "user", userId: "visual-admin" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  const registrations = new Map<string, StudioWorkspaceRegistration>();
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      "studio:register-workspace",
      async (message) => {
        registrations.set(message.payload.id, message.payload);
        return {
          success: true,
          data: { workspaceUrl: `/studio/workspaces/${message.payload.id}` },
        };
      },
    );
  const siteContext = createServicePluginContext(shell, "site-builder");
  siteContext.entities.register(
    "site-info",
    baseEntitySchema,
    new FixtureAdapter("site-info"),
  );
  class FixtureSiteProvider extends SiteWorkspaceProvider {
    override async getSnapshot(): Promise<SiteWorkspaceSnapshot> {
      const snapshot: SiteWorkspaceSnapshot = {
        site: {
          title: "Rover collective",
          previewUrl: "https://preview.example.com",
          liveUrl: "https://example.com",
        },
        automation: {
          autoRebuild: true,
          debounceMs: 2000,
          defaultEnvironment: "preview",
        },
        environments: (["preview", "production"] as const).map(
          (environment) => ({
            environment,
            publication: {
              state: "published",
              buildId: `build-20260711163352-${environment}`,
              publishedAt: "2026-07-11T16:33:52.000Z",
              routesBuilt: 31,
              warnings: [],
            },
            lastSuccess: {
              jobId: `build-20260711163352-${environment}`,
              completedAt: "2026-07-11T16:33:52.000Z",
              routesBuilt: 31,
              warnings: [],
            },
          }),
        ),
        recentBuilds: (["preview", "production"] as const).map(
          (environment) => ({
            jobId: `build-20260711163352-${environment}`,
            environment,
            outcome: "succeeded",
            completedAt: "2026-07-11T16:33:52.000Z",
            routesBuilt: 31,
          }),
        ),
        routes: Array.from({ length: 31 }, (_, index) => ({
          id: `route-${index}`,
          title:
            [
              "Home",
              "Notes",
              "About",
              "Newsletter",
              "Essays",
              "Topics",
              "Now",
              "Archive",
            ][index] ?? `Note ${index - 7}`,
          path: index === 0 ? "/" : `/notes/${index}/`,
        })),
      };
      if (state === "empty")
        return {
          ...snapshot,
          site: { title: snapshot.site.title },
          recentBuilds: [],
          routes: [],
          environments: snapshot.environments.map(({ environment }) => ({
            environment,
            publication: { state: "not-published" },
          })),
        };
      if (state === "busy")
        return {
          ...snapshot,
          environments: snapshot.environments.map((environment) =>
            environment.environment === "preview"
              ? {
                  ...environment,
                  active: {
                    state: "building",
                    jobId: "fixture-preview-active",
                    requestedAt: "2026-07-11T16:39:00.000Z",
                    startedAt: "2026-07-11T16:39:10.000Z",
                  },
                }
              : environment,
          ),
        };
      if (state === "failure")
        return {
          ...snapshot,
          environments: snapshot.environments.map((environment) =>
            environment.environment === "preview"
              ? {
                  ...environment,
                  lastFailure: {
                    jobId: "fixture-preview-failed",
                    completedAt: "2026-07-11T16:39:00.000Z",
                    message:
                      "Preview rendering failed.\n" +
                      "Retained renderer diagnostic.\n".repeat(180) +
                      "Exact diagnostic reference: fixture-preview-failed",
                  },
                }
              : environment,
          ),
        };
      return snapshot;
    }
  }
  await new FixtureSiteProvider({
    context: siteContext,
    config: siteBuilderConfigSchema.parse({}),
    routeRegistry: new RouteRegistry(siteContext.logger),
    statusService: new SiteBuildStatusService(
      siteContext.runtimeState,
      siteContext.jobs,
    ),
    requestBuild: (): void => {},
  }).registerStudioWorkspace();

  const context = createServicePluginContext(shell, "content-pipeline");
  const providers = ProviderRegistry.createFresh();
  for (const [entityType, name] of [
    ["post", "Newsletter"],
    ["note", "Site"],
  ] as const) {
    context.entities.register(
      entityType,
      baseEntitySchema,
      new FixtureAdapter(entityType),
    );
    providers.register(entityType, {
      name,
      publish: async () => ({ id: "fixture-only" }),
    });
  }
  const records = [
    {
      entityType: "post",
      id: "quiet-infrastructure",
      title: "Quiet infrastructure",
      status: "queued",
      scheduledFor: "2026-07-12T09:00:00.000Z",
    },
    {
      entityType: "post",
      id: "travelling-console",
      title: "A console that travels well",
      status: "queued",
    },
    {
      entityType: "note",
      id: "alpha-release-log",
      title: "Alpha release log",
      status: "queued",
    },
    {
      entityType: "post",
      id: "field-notes",
      title: "Notes from the rhizome",
      status: "failed",
      error: "Provider rejected the last delivery attempt.",
    },
    ...Array.from({ length: 14 }, (_, index) => ({
      entityType: "post",
      id: `published-${index}`,
      title: `Published note ${index}`,
      status: "published",
    })),
  ];
  const queue = QueueManager.createFresh();
  for (const record of state === "empty" ? [] : records) {
    await context.entityService.createEntity({
      entity: {
        id: record.id,
        entityType: record.entityType,
        content: record.title,
        metadata: record,
        visibility: "public",
      },
    });
    if (record.status === "queued")
      await queue.add(record.entityType, record.id);
  }
  context.jobs.getActiveJobs = async (): Promise<
    Awaited<ReturnType<typeof context.jobs.getActiveJobs>>
  > =>
    state === "empty"
      ? []
      : [
          {
            id: "generation-1",
            type: "image:image-render-source",
            source: "content-pipeline",
            status: "processing",
            data: JSON.stringify({
              sourceEntityType: "post",
              sourceEntityId: "travelling-console",
              attachmentType: "og-image",
            }),
            priority: 0,
            retryCount: 0,
            maxRetries: 3,
            lastError: null,
            createdAt: 0,
            scheduledFor: 0,
            startedAt: null,
            completedAt: null,
            attemptId: "generation-attempt",
            workerSlotId: "fixture-worker",
            workerSessionId: "fixture-session",
            leaseExpiresAt: 30000,
            attemptHeartbeatAt: 0,
            runtimeUpdatedAt: 0,
            progress: null,
            metadata: {
              operationType: "content_operations",
              rootJobId: "generation-1",
            },
          },
        ];
  const retries = RetryTracker.createFresh();
  if (state !== "empty")
    retries.recordFailure(
      "field-notes",
      "Provider rejected the last delivery attempt.",
    );
  await registerStudioWorkspace(context, {
    providerRegistry: providers,
    queueManager: queue,
    retryTracker: retries,
    publicationQueueService: new PublicationQueueService(context, queue),
    publishExecutor: new PublishExecutor({
      context,
      providerRegistry: providers,
    }),
  });
  const read = async (id: string): Promise<unknown> => {
    const registration = registrations.get(id);
    if (!registration)
      throw new Error(`Missing delivery fixture workspace: ${id}`);
    return registration.dataProvider(actor);
  };
  return {
    site: () => read("site-builder:site"),
    publishing: () => read("content-pipeline:publishing"),
  };
}
