import { beforeEach, describe, expect, it } from "bun:test";
import type { UserPermissionLevel } from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type MockShell,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  registerDashboardWidget,
  type PipelineWidgetData,
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
  dataProvider: () => Promise<PipelineWidgetData>;
  digestProvider: (data: unknown) => {
    digest: Array<{ label: string; value: string; tone?: string }>;
    needsOperator: number;
  };
}

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
          {} as never,
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

  it("registers a compact, read-only publication widget", async () => {
    await registerDashboardWidget(context, "content-pipeline", deps);

    expect(widgetPayload).toMatchObject({
      id: "publication-pipeline",
      pluginId: "content-pipeline",
      title: "Publication Pipeline",
      group: "publishing",
      section: "secondary",
      priority: 100,
      rendererName: "PipelineWidget",
      visibility: "anchor",
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

    await registerDashboardWidget(context, "content-pipeline", deps);
    const data = await widgetPayload?.dataProvider();

    expect(data?.summary).toEqual({
      draft: 1,
      queued: 1,
      generating: 0,
      failed: 0,
      published: 0,
      needsOperator: 1,
    });
    expect(data?.queue).toEqual([
      expect.objectContaining({
        entityId: "queued-post",
        entityType: "social-post",
        destination: "linkedin",
      }),
    ]);
    expect(data?.publishableEntityTypes).toEqual(["social-post"]);
  });

  it("derives live digest figures from canonical summary data", async () => {
    await registerDashboardWidget(context, "content-pipeline", deps);

    const derived = widgetPayload?.digestProvider({
      summary: {
        draft: 2,
        queued: 3,
        generating: 1,
        published: 9,
        failed: 1,
        needsOperator: 3,
      },
      queue: [],
      generating: [{ id: "job-1" }],
      failures: [],
      publishableEntityTypes: ["social-post"],
    });

    expect(derived?.digest).toEqual([
      { label: "Pipeline", value: "3 queued · 1 generating", tone: "warn" },
      { label: "Awaiting review", value: "2 drafts · 1 failed", tone: "warn" },
      { label: "Published", value: "9", tone: "good" },
    ]);
    expect(derived?.needsOperator).toBe(3);
  });

  it("renders a quiet digest when the pipeline is idle", async () => {
    await registerDashboardWidget(context, "content-pipeline", deps);

    const derived = widgetPayload?.digestProvider({
      summary: {
        draft: 0,
        queued: 0,
        generating: 0,
        published: 4,
        failed: 0,
        needsOperator: 0,
      },
      queue: [],
      generating: [],
      failures: [],
      publishableEntityTypes: ["social-post"],
    });

    expect(derived?.digest).toEqual([
      { label: "Pipeline", value: "idle" },
      { label: "Awaiting review", value: "0 drafts" },
      { label: "Published", value: "4", tone: "good" },
    ]);
    expect(derived?.needsOperator).toBe(0);
  });

  it("includes the CMS management URL only when registration succeeded", async () => {
    await registerDashboardWidget(context, "content-pipeline", {
      ...deps,
      managementUrl: "/studio#/workspace/publishing",
    });
    expect((await widgetPayload?.dataProvider())?.managementUrl).toBe(
      "/studio#/workspace/publishing",
    );

    await registerDashboardWidget(context, "content-pipeline", deps);
    expect(
      (await widgetPayload?.dataProvider())?.managementUrl,
    ).toBeUndefined();
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
        metadata: {} as never,
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
        metadata: {} as never,
      },
    ];

    await registerDashboardWidget(context, "content-pipeline", deps);
    const data = await widgetPayload?.dataProvider();

    expect(data?.generating).toEqual([
      {
        id: "job-8412",
        label: "og-image",
        target: "social-post/domain-as-identity",
        status: "processing",
      },
    ]);
  });
});
