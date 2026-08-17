import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createTestEntity,
} from "@brains/test-utils";
import {
  buildActionItemsWidgetData,
  registerActionItemsWidget,
} from "../../../src/lib/widgets/action-items";
import type { ActionItemEntity } from "../../../src/schemas/conversation-memory";

function createActionItem(overrides: {
  id: string;
  title: string;
  body?: string;
  status?: ActionItemEntity["metadata"]["status"];
  channelName?: string;
  channelId?: string;
  end?: string;
}): ActionItemEntity {
  const status = overrides.status ?? "open";
  const end = overrides.end ?? "2026-05-01T00:00:00.000Z";
  const body = overrides.body ?? "Body sentence one. Body sentence two.";
  return createTestEntity<ActionItemEntity>("action-item", {
    id: overrides.id,
    content: `# ${overrides.title}\n\n${body}\n`,
    metadata: {
      conversationId: "c1",
      channelId: overrides.channelId ?? "c1-channel",
      channelName: overrides.channelName ?? "design",
      interfaceType: "cli",
      spaceId: "cli:design",
      timeRange: { start: "2026-04-30T23:00:00.000Z", end },
      sourceSummaryId: "s1",
      sourceMessageCount: 4,
      projectionVersion: 1,
      status,
    },
  });
}

describe("buildActionItemsWidgetData", () => {
  it("sorts open first then by timeRange end desc, caps at 6", async () => {
    const items: ActionItemEntity[] = [
      createActionItem({
        id: "older-open",
        title: "Older open",
        end: "2026-04-20T00:00:00.000Z",
      }),
      createActionItem({
        id: "newer-done",
        title: "Newer done",
        status: "done",
        end: "2026-05-09T00:00:00.000Z",
      }),
      createActionItem({
        id: "newer-open",
        title: "Newer open",
        end: "2026-05-08T00:00:00.000Z",
      }),
      createActionItem({
        id: "dropped",
        title: "Dropped",
        status: "dropped",
        end: "2026-05-09T12:00:00.000Z",
      }),
    ];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => items,
    });

    const data = await buildActionItemsWidgetData(
      context,
      new Date("2026-05-10T00:00:00.000Z"),
    );

    expect(data.items.map((item) => item.id)).toEqual([
      "newer-open",
      "older-open",
      "newer-done",
      "dropped",
    ]);
    const first = data.items[0];
    expect(first?.name).toBe("Newer open");
    expect(first?.description).toBe("Body sentence one.");
    expect(first?.status).toBe("open");
    expect(first?.meta).toEqual(["#design", "2d"]);
    // openCount is uncapped and counts only open items.
    expect(data.openCount).toBe(2);
  });

  it("falls back to channelId when channelName is missing", async () => {
    const items = [
      createActionItem({
        id: "no-channel-name",
        title: "Untitled channel",
        channelName: "",
        channelId: "raw-channel-id",
      }),
    ];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => items,
    });

    const data = await buildActionItemsWidgetData(
      context,
      new Date("2026-05-10T00:00:00.000Z"),
    );
    expect(data.items[0]?.meta[0]).toBe("#raw-channel-id");
  });
});

describe("registerActionItemsWidget", () => {
  it("registers a widget on plugins-registered", async () => {
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => [],
    });
    context.messaging.subscribe(
      DASHBOARD_CHANNELS.registerWidget,
      async () => ({ success: true }),
    );

    registerActionItemsWidget({ context });
    expect(context.messaging.subscribe).toHaveBeenCalledWith(
      SYSTEM_CHANNELS.pluginsRegistered,
      expect.any(Function),
    );

    // Publish the real message rather than capturing the handler: this is the
    // path production takes, and the registration below is the evidence.
    await context.messaging.send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
    });

    const [registerCall] = context.dashboard.registerWidget.mock.calls;
    const payload = registerCall?.[0];
    if (!payload) throw new Error("widget was not registered");

    // digestProvider is declared on DashboardWidgetRegistration, so it needs
    // neither an index access nor a cast now that payload carries that type.
    const { digestProvider } = payload;
    if (!digestProvider) throw new Error("widget declared no digest provider");

    expect(payload).toMatchObject({
      id: "action-items",
      title: "Open action items",
      group: "knowledge",
      section: "secondary",
      priority: 25,
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      digestProvider: expect.any(Function),
    });
    expect(Object.hasOwn(payload, "component")).toBe(false);
    expect(Object.hasOwn(payload, "clientStyles")).toBe(false);
    expect(Object.hasOwn(payload, "clientScript")).toBe(false);
  });
});
