import { createMockShell } from "@brains/plugins/test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
  type StudioWorkspaceActor,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { defineServicePlugin } from "@brains/sdk/services";
import {
  registerFixtureWorkspace,
  refuseFixtureAction,
} from "./studio-fixture-workspace";
import { runtimeFor } from "../../plugins/content-pipeline/test/helpers/install";
import {
  siteWorkspace,
  type SiteWorkspaceSnapshot,
} from "../../plugins/site-builder/src/lib/site-workspace";
import { ProviderRegistry } from "../../plugins/content-pipeline/src/provider-registry";
import { QueueManager } from "../../plugins/content-pipeline/src/queue-manager";
import { RetryTracker } from "../../plugins/content-pipeline/src/retry-tracker";
import { PublicationQueueService } from "../../plugins/content-pipeline/src/publication-queue-service";
import { PublishExecutor } from "../../plugins/content-pipeline/src/publish-executor";
import {
  publishingWorkspace,
  publishingWorkspaceHandlers,
} from "../../plugins/content-pipeline/src/lib/studio-workspace";

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
  async function siteData(): Promise<SiteWorkspaceSnapshot> {
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
      environments: (["preview", "production"] as const).map((environment) => ({
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
      })),
      recentBuilds: (["preview", "production"] as const).map((environment) => ({
        jobId: `build-20260711163352-${environment}`,
        environment,
        outcome: "succeeded",
        completedAt: "2026-07-11T16:33:52.000Z",
        routesBuilt: 31,
      })),
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
  const site = await registerFixtureWorkspace(
    shell,
    defineServicePlugin(
      { id: "site-builder", config: z.strictObject({}) },
      {
        studioWorkspaces: (context) => [
          siteWorkspace.bind(context, {
            load: siteData,
            actions: siteWorkspace.actions.map((action) =>
              action.bind(context, refuseFixtureAction, refuseFixtureAction),
            ),
          }),
        ],
      },
    ),
  );

  const runtime = runtimeFor(shell, { delegated: ["post", "note"] });
  const providers = ProviderRegistry.createFresh();
  for (const [entityType, name] of [
    ["post", "Newsletter"],
    ["note", "Site"],
  ] as const) {
    shell
      .getEntityRegistry()
      .registerEntityType(
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
    await shell.getEntityService().createEntity({
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
  runtime.jobs.active = async (): Promise<
    Awaited<ReturnType<typeof runtime.jobs.active>>
  > =>
    state === "empty"
      ? []
      : [
          {
            id: "generation-1",
            type: "image:image-render-source",
            status: "processing",
            data: {
              sourceEntityType: "post",
              sourceEntityId: "travelling-console",
              attachmentType: "og-image",
            },
          },
        ];
  const retries = RetryTracker.createFresh();
  if (state !== "empty")
    retries.recordFailure(
      "field-notes",
      "Provider rejected the last delivery attempt.",
    );
  const handlers = publishingWorkspaceHandlers(runtime, {
    providerRegistry: providers,
    queueManager: queue,
    retryTracker: retries,
    publicationQueueService: new PublicationQueueService(runtime, queue),
    publishExecutor: new PublishExecutor({
      runtime,
      providerRegistry: providers,
    }),
  });
  const publishing = await registerFixtureWorkspace(
    shell,
    defineServicePlugin(
      { id: "content-pipeline", config: z.strictObject({}) },
      {
        studioWorkspaces: (context) => [
          publishingWorkspace.bind(context, {
            load: handlers.load,
            authorize: handlers.authorize,
            listEntityTypes: handlers.listEntityTypes,
            actions: publishingWorkspace.actions.map((action) =>
              action.bind(context, refuseFixtureAction, refuseFixtureAction),
            ),
          }),
        ],
      },
    ),
  );
  return {
    site: () => site.dataProvider(actor),
    publishing: () => publishing.dataProvider(actor),
  };
}
