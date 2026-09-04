import { beforeEach, describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetProviderContext,
  type RuntimeDashboardWidgetData,
  type UserPermissionLevel,
} from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type MockShell,
  type ServicePluginContext,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  registerDashboardWidget,
  type RegisterDashboardWidgetDeps,
} from "../src/lib/dashboard-widget";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";

interface DashboardWidgetPayload {
  id: string;
  pluginId: string;
  title: string;
  group: string;
  section: string;
  priority: number;
  rendererName: string;
  visibility: UserPermissionLevel;
  dataProvider: (
    context: DashboardWidgetProviderContext,
  ) => Promise<RuntimeDashboardWidgetData>;
  digestProvider: (data: unknown) => {
    digest?: Array<{ label: string; value: string; tone?: string }> | undefined;
    needsAttention?: number | undefined;
  };
}

const dashboardProviderContext: DashboardWidgetProviderContext = {
  caller: {
    actor: { id: "user:admin" },
    permission: "admin",
    isAnchor: true,
  },
  signal: new AbortController().signal,
};

describe("dashboard widget registration", () => {
  let context: ServicePluginContext;
  let mockShell: MockShell;
  let widgetPayload: DashboardWidgetPayload | undefined;
  let deps: RegisterDashboardWidgetDeps;

  beforeEach(() => {
    mockShell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(mockShell, "content-pipeline");
    for (const entityType of ["social-post", "workflow-card"]) {
      mockShell
        .getEntityRegistry()
        .registerEntityType(
          entityType,
          baseEntitySchema.partial().passthrough(),
          createTestEntityAdapter(entityType),
        );
    }

    const providerRegistry = ProviderRegistry.createFresh();
    providerRegistry.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    deps = {
      providerRegistry,
      queueManager: QueueManager.createFresh(),
      retryTracker: RetryTracker.createFresh(),
    };

    context.messaging.subscribe<DashboardWidgetPayload, { success: boolean }>(
      "dashboard:register-widget",
      async (message) => {
        widgetPayload = message.payload;
        return { success: true };
      },
    );
  });

  it("registers the primary read-only publication widget", async () => {
    await registerDashboardWidget(context, deps);

    expect(widgetPayload).toMatchObject({
      id: "publication-pipeline",
      pluginId: "content-pipeline",
      title: "Publication Pipeline",
      group: "publishing",
      section: "primary",
      priority: 100,
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      visibility: "admin",
    });
    expect(widgetPayload?.dataProvider).toBeFunction();
    expect(widgetPayload?.digestProvider).toBeFunction();
  });

  it("uses the canonical provider-bounded pipeline snapshot", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "draft-post",
        entityType: "social-post",
        content: "draft",
        metadata: { status: "draft", title: "Draft Post" },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "queued-post",
        entityType: "social-post",
        content: "queued",
        metadata: { status: "queued" },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "unrelated-draft",
        entityType: "workflow-card",
        content: "not publication content",
        metadata: { status: "draft" },
      },
    });
    await deps.queueManager.add("social-post", "queued-post");

    await registerDashboardWidget(context, deps);
    const data = await widgetPayload?.dataProvider(dashboardProviderContext);

    expect(data?.digest).toEqual({
      items: [
        { label: "Pipeline", value: "1 queued · 0 generating", tone: "warn" },
        {
          label: "Awaiting review",
          value: "1 drafts",
          tone: "warn",
        },
        { label: "Published", value: "0", tone: "good" },
      ],
      attention: 1,
    });
    expect(data?.view.blocks[0]).toMatchObject({
      type: "stats",
      items: [
        { label: "Queued", value: 1 },
        { label: "Generating", value: 0 },
        { label: "Awaiting review", value: 1 },
        { label: "Published", value: 0 },
      ],
    });
  });

  it("derives the host digest from normalized widget data", async () => {
    await registerDashboardWidget(context, deps);
    const data = await widgetPayload?.dataProvider(dashboardProviderContext);
    const derived = widgetPayload?.digestProvider(data);

    expect(derived?.digest).toEqual([
      { label: "Pipeline", value: "idle", tone: "plain" },
      { label: "Awaiting review", value: "0 drafts", tone: "plain" },
      { label: "Published", value: "0", tone: "good" },
    ]);
    expect(derived?.needsAttention).toBe(0);
  });

  it("uses a host launch instead of carrying a Studio management URL", async () => {
    await registerDashboardWidget(context, deps);
    const data = await widgetPayload?.dataProvider(dashboardProviderContext);

    expect(data?.view.blocks[2]).toEqual({
      type: "links",
      items: [
        {
          label: "Open in Studio",
          target: {
            kind: "launch",
            launch: { target: "publishing" },
          },
        },
      ],
    });
    expect(JSON.stringify(data)).not.toContain("managementUrl");
  });

  it("surfaces active content-pipeline jobs as generating items", async () => {
    type ActiveJobs = Awaited<
      ReturnType<ServicePluginContext["jobs"]["getActiveJobs"]>
    >;
    context.jobs.getActiveJobs = async (): Promise<ActiveJobs> => [
      {
        id: "job-8412",
        type: "image:image-render-source",
        data: JSON.stringify({
          sourceEntityType: "social-post",
          sourceEntityId: "domain-as-identity",
          attachmentType: "og-image",
        }),
        status: "processing" as const,
        source: "content-pipeline",
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        createdAt: 0,
        scheduledFor: 0,
        startedAt: null,
        completedAt: null,
        attemptId: "attempt-8412",
        workerSlotId: "worker-a",
        workerSessionId: "session-a",
        leaseExpiresAt: 30_000,
        attemptHeartbeatAt: 0,
        runtimeUpdatedAt: 0,
        progress: null,
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-root",
        },
      },
      {
        id: "job-other",
        type: "site:build",
        data: "{}",
        status: "processing" as const,
        source: "site-builder",
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        createdAt: 0,
        scheduledFor: 0,
        startedAt: null,
        completedAt: null,
        attemptId: "attempt-other",
        workerSlotId: "worker-a",
        workerSessionId: "session-a",
        leaseExpiresAt: 30_000,
        attemptHeartbeatAt: 0,
        runtimeUpdatedAt: 0,
        progress: null,
        metadata: {
          operationType: "content_operations",
          rootJobId: "job-root",
        },
      },
    ];

    await registerDashboardWidget(context, deps);
    const data = await widgetPayload?.dataProvider(dashboardProviderContext);

    const stats = data?.view.blocks[0];
    expect(stats?.type).toBe("stats");
    if (stats?.type !== "stats") throw new Error("Expected pipeline stats");
    expect(stats.items[1]).toEqual({ label: "Generating", value: 1 });
  });
});
