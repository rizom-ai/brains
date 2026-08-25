import { describe, expect, it } from "bun:test";
import { createTestEntityAccess } from "@brains/test-utils";
import {
  createMockEntityPluginContext,
  createTestEntity,
} from "@brains/test-utils";
import { buildActionItemsWidgetData } from "../../../src/lib/widgets/action-items";
import { actionItemsWidgetDeclaration } from "../../../src/lib/widgets/action-items";
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
      createTestEntityAccess({ entityService: context.entityService }),
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
      createTestEntityAccess({ entityService: context.entityService }),
      new Date("2026-05-10T00:00:00.000Z"),
    );
    expect(data.items[0]?.meta[0]).toBe("#raw-channel-id");
  });
});

// The runtime owns waiting for the dashboard to mount and announcing the
// widget — covered where that lives. What is this package's is the
// declaration: the widget it describes, and the data it loads.
describe("actionItemsWidgetDeclaration", () => {
  it("declares the widget and loads from entity access", async () => {
    expect(actionItemsWidgetDeclaration.definition.id).toBe("action-items");

    const entities = createTestEntityAccess({
      entityService: createMockEntityPluginContext({
        listEntitiesImpl: async () => [],
      }).entityService,
    });
    const data = await actionItemsWidgetDeclaration.load({
      entities,
      conversations: {
        get: async () => null,
        getMessages: async () => [],
        list: async () => [],
      },
      spaces: [],
      caller: null,
      signal: new AbortController().signal,
    });

    expect(data).toEqual({ items: [], openCount: 0 });
  });
});
