import { describe, it, expect, beforeEach } from "bun:test";
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
} from "../src/lib/dashboard-widget";

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

  beforeEach(() => {
    mockShell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(mockShell, "content-pipeline");
    mockShell
      .getEntityRegistry()
      .registerEntityType(
        "social-post",
        baseEntitySchema.partial().passthrough(),
        {} as never,
      );

    context.messaging.subscribe<DashboardWidgetPayload, { success: boolean }>(
      "dashboard:register-widget",
      async (message) => {
        widgetPayload = message.payload;
        return { success: true };
      },
    );
  });

  it("should register the publication pipeline widget", async () => {
    await registerDashboardWidget(context, "content-pipeline");

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

  it("should provide status summary and items", async () => {
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
        id: "ignored-post",
        entityType: "social-post",
        content: "ignored",
        metadata: { status: "archived" },
      },
    });

    await registerDashboardWidget(context, "content-pipeline");
    const data = await widgetPayload?.dataProvider();

    expect(data?.summary).toEqual({
      draft: 1,
      queued: 1,
      published: 0,
      failed: 0,
    });
    expect(data?.items).toEqual([
      {
        id: "draft-post",
        title: "Draft Post",
        type: "social-post",
        status: "draft",
      },
      {
        id: "queued-post",
        title: "queued-post",
        type: "social-post",
        status: "queued",
      },
    ]);
  });

  it("should derive live digest figures from pipeline data", async () => {
    await registerDashboardWidget(context, "content-pipeline");

    const derived = widgetPayload?.digestProvider({
      summary: { draft: 2, queued: 3, published: 9, failed: 1 },
      items: [],
    });

    expect(derived?.digest).toEqual([
      { label: "Queued", value: "3", tone: "warn" },
      { label: "Drafts", value: "2" },
      { label: "Published", value: "9", tone: "good" },
      { label: "Failed", value: "1", tone: "warn" },
    ]);
    // Drafts and failures both wait on an operator decision.
    expect(derived?.needsOperator).toBe(3);
  });

  it("should omit the failed digest line when nothing failed", async () => {
    await registerDashboardWidget(context, "content-pipeline");

    const derived = widgetPayload?.digestProvider({
      summary: { draft: 0, queued: 0, published: 4, failed: 0 },
      items: [],
    });

    expect(derived?.digest).toEqual([
      { label: "Queued", value: "0" },
      { label: "Drafts", value: "0" },
      { label: "Published", value: "4", tone: "good" },
    ]);
    expect(derived?.needsOperator).toBe(0);
  });
});
