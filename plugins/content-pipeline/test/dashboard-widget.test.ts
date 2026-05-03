import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "@brains/utils";
import {
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
  section: string;
  priority: number;
  rendererName: string;
  dataProvider: () => Promise<PipelineWidgetData>;
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
      .registerEntityType("social-post", z.any(), {} as never);

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
      section: "secondary",
      priority: 100,
      rendererName: "PipelineWidget",
    });
    expect(widgetPayload?.dataProvider).toBeFunction();
  });

  it("should provide status summary and items", async () => {
    await context.entityService.createEntity({
      id: "draft-post",
      entityType: "social-post",
      content: "draft",
      metadata: { status: "draft", title: "Draft Post" },
    });
    await context.entityService.createEntity({
      id: "queued-post",
      entityType: "social-post",
      content: "queued",
      metadata: { status: "queued" },
    });
    await context.entityService.createEntity({
      id: "ignored-post",
      entityType: "social-post",
      content: "ignored",
      metadata: { status: "archived" },
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
});
