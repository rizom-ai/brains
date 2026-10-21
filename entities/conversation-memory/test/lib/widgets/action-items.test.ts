import { type ActionItemEntity } from "@brains/action-items";
import { createTestEntity } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import {
  buildActionItemsWidgetData,
  registerActionItemsWidget,
} from "../../../src/lib/widgets/action-items";

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
      capturedAt: end,
      status,
    },
  });
}

describe("buildActionItemsWidgetData", () => {
  it("lists unfinished items, blocked first, then doing, then open, newest first", async () => {
    const items: ActionItemEntity[] = [
      createActionItem({
        id: "doing",
        title: "Doing",
        status: "doing",
        end: "2026-05-01T00:00:00.000Z",
      }),
      createActionItem({
        id: "blocked",
        title: "Blocked",
        status: "blocked",
        end: "2026-04-01T00:00:00.000Z",
      }),
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
      "restricted",
      new Date("2026-05-10T00:00:00.000Z"),
    );

    expect(data.items.map((item) => item.id)).toEqual([
      "blocked",
      "doing",
      "newer-open",
      "older-open",
    ]);
    const open = data.items[2];
    expect(open?.name).toBe("Newer open");
    expect(open?.description).toBe("Body sentence one.");
    expect(open?.status).toBe("open");
    expect(open?.meta).toEqual(["#design", "2d"]);
    // Counts are uncapped; finished items count toward neither.
    expect(data.unfinishedCount).toBe(4);
    expect(data.blockedCount).toBe(1);
  });

  it("caps the list at six", async () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      createActionItem({ id: `open-${index}`, title: `Open ${index}` }),
    );
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => items,
    });

    const data = await buildActionItemsWidgetData(context, "restricted");

    expect(data.items).toHaveLength(6);
    expect(data.unfinishedCount).toBe(8);
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
      "restricted",
      new Date("2026-05-10T00:00:00.000Z"),
    );
    expect(data.items[0]?.meta[0]).toBe("#raw-channel-id");
  });
});

describe("registerActionItemsWidget", () => {
  it("registers a widget on plugins-registered", async () => {
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => [
        createActionItem({ id: "stuck", title: "Stuck", status: "blocked" }),
        createActionItem({ id: "next", title: "Next" }),
      ],
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
      // Members read it in Studio Overview, where blockers ask for attention.
      visibility: "trusted",
      group: "knowledge",
      section: "secondary",
      priority: 25,
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      digestProvider: expect.any(Function),
    });
    const data = await payload.dataProvider({
      caller: {
        actor: { id: "u-niels" },
        permission: "trusted",
        isAnchor: false,
      },
      signal: new AbortController().signal,
    });
    // Blockers, not open work, ask for attention.
    expect(digestProvider(data)).toMatchObject({ needsAttention: 1 });
    const view = JSON.stringify(data);
    expect(view).toContain('"label":"Open the board"');
    expect(view).toContain('"target":"board"');
    expect(Object.hasOwn(payload, "component")).toBe(false);
    expect(Object.hasOwn(payload, "clientStyles")).toBe(false);
    expect(Object.hasOwn(payload, "clientScript")).toBe(false);
  });
});
