import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { buildActionItemsWidgetData } from "../../../src/lib/widgets/action-items";
import { buildDecisionsWidgetData } from "../../../src/lib/widgets/decisions";
import { buildRecentConversationMemoryData } from "../../../src/lib/widgets/recent-memory";

// Memory is restricted by default, and an unscoped read sees public entities
// only: the owner's dashboard showed none of it. Every widget reads at the
// scope the dashboard derives from its caller.
describe("conversation memory widgets read at the caller's scope", () => {
  function recordingContext(): {
    context: ReturnType<typeof createMockEntityPluginContext>;
    requests: Array<{ entityType: string }>;
  } {
    const requests: Array<{ entityType: string }> = [];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async (request) => {
        requests.push(request);
        return [];
      },
    });
    return { context, requests };
  }

  const scoped = {
    options: expect.objectContaining({
      filter: expect.objectContaining({ visibilityScope: "restricted" }),
    }),
  };

  it("decisions", async () => {
    const { context, requests } = recordingContext();
    await buildDecisionsWidgetData(context, "restricted");
    expect(requests).toEqual([expect.objectContaining(scoped)]);
  });

  it("action items", async () => {
    const { context, requests } = recordingContext();
    await buildActionItemsWidgetData(context, "restricted");
    expect(requests).toEqual([expect.objectContaining(scoped)]);
  });

  it("recent memory", async () => {
    const { context, requests } = recordingContext();
    await buildRecentConversationMemoryData(context, "restricted");
    expect(requests).toEqual([expect.objectContaining(scoped)]);
  });
});
