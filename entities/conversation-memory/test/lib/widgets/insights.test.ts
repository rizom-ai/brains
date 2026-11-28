import { createTestEntity } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { buildInsightsWidgetData } from "../../../src/lib/widgets/insights";
import type { InsightEntity } from "../../../src/schemas/conversation-memory";

function insight(
  id: string,
  title: string,
  status: InsightEntity["metadata"]["status"],
  end: string,
): InsightEntity {
  return createTestEntity<InsightEntity>("insight", {
    id,
    content: `# ${title}\n\nWe found this out. More follows.\n`,
    metadata: {
      conversationId: "c1",
      channelId: "c1-channel",
      channelName: "design",
      interfaceType: "cli",
      timeRange: { start: end, end },
      status,
    },
  });
}

describe("buildInsightsWidgetData", () => {
  it("lists what still holds first, newest first, as the decisions widget does", async () => {
    const items = [
      insight("older", "Older", "active", "2026-04-20T01:00:00.000Z"),
      insight(
        "overturned",
        "Overturned",
        "superseded",
        "2026-05-08T01:00:00.000Z",
      ),
      insight("newer", "Newer", "active", "2026-05-09T01:00:00.000Z"),
    ];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => items,
    });

    const data = await buildInsightsWidgetData(context, "restricted");

    expect(data.items.map((item) => item.id)).toEqual([
      "newer",
      "older",
      "overturned",
    ]);
    expect(data.items[0]).toEqual({
      id: "newer",
      name: "Newer",
      description: "We found this out.",
      meta: ["#design", "May 9"],
      status: "active",
    });
  });
});
