import { describe, expect, it, mock } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
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
    const context = {
      entityService: {
        listEntities: mock(async () => items),
      },
    } as unknown as EntityPluginContext;

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
    const context = {
      entityService: { listEntities: mock(async () => items) },
    } as unknown as EntityPluginContext;

    const data = await buildActionItemsWidgetData(
      context,
      new Date("2026-05-10T00:00:00.000Z"),
    );
    expect(data.items[0]?.meta?.[0]).toBe("#raw-channel-id");
  });
});

describe("registerActionItemsWidget", () => {
  it("registers a widget on system:plugins:ready", async () => {
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;
    let payload: Record<string, unknown> | undefined;
    const send = mock(async (request: { type: string; payload: unknown }) => {
      payload = request.payload as Record<string, unknown>;
    });
    const subscribe = mock(
      (
        _topic: string,
        handler: () => Promise<{ success: boolean }>,
      ): (() => void) => {
        readyHandler = handler;
        return (): void => undefined;
      },
    );
    const context = {
      messaging: { send, subscribe },
      entityService: { listEntities: mock(async () => []) },
    } as unknown as EntityPluginContext;

    registerActionItemsWidget({ context, pluginId: "conversation-memory" });
    await readyHandler?.();

    expect(payload).toMatchObject({
      id: "conversation-memory:action-items",
      pluginId: "conversation-memory",
      title: "Open action items",
      section: "secondary",
      priority: 25,
      rendererName: "ListWidget",
    });
  });
});
