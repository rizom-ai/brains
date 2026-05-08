import { describe, expect, it, mock } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { registerSummaryDashboardWidget } from "../../src/lib/dashboard-widget";
import type { SummaryEntity } from "../../src/schemas/summary";

function createSummary(overrides: Partial<SummaryEntity> = {}): SummaryEntity {
  const now = new Date(Date.UTC(2026, 0, 1)).toISOString();
  return {
    id: "conversation-1",
    entityType: "summary",
    content: "# Conversation Summary\n",
    contentHash: "hash",
    created: now,
    updated: now,
    metadata: {
      conversationId: "conversation-1",
      channelId: "channel-1",
      channelName: "Design Review",
      interfaceType: "mcp",
      messageCount: 18,
      entryCount: 3,
      sourceHash: "source-hash",
      projectionVersion: 1,
    },
    ...overrides,
  };
}

describe("registerSummaryDashboardWidget", () => {
  it("registers a dashboard widget with recent summaries", async () => {
    const summaries = [createSummary()];
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;

    let registeredWidget:
      | {
          dataProvider: () => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        }
      | undefined;

    const send = mock(
      async (request: {
        type: string;
        payload: {
          dataProvider: () => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        };
      }): Promise<void> => {
        registeredWidget = request.payload;
      },
    );

    const subscribe = mock(
      (
        _topic: string,
        handler: () => Promise<{ success: boolean }>,
      ): (() => void) => {
        readyHandler = handler;
        return (): void => undefined;
      },
    );

    const listEntities = mock(async (): Promise<SummaryEntity[]> => summaries);
    const context = {
      messaging: { send, subscribe },
      entityService: { listEntities },
    } as unknown as EntityPluginContext;

    registerSummaryDashboardWidget({ context, pluginId: "summary" });

    expect(subscribe).toHaveBeenCalledWith(
      "system:plugins:ready",
      expect.any(Function),
    );
    expect(readyHandler).toBeDefined();

    const result = await readyHandler?.();
    expect(result).toEqual({ success: true });

    expect(send).toHaveBeenCalledWith({
      type: "dashboard:register-widget",
      payload: expect.objectContaining({
        id: "summary",
        pluginId: "summary",
        title: "Summaries",
        rendererName: "ListWidget",
      }),
    });

    expect(registeredWidget).toBeDefined();
    if (!registeredWidget) throw new Error("Widget was not registered");

    const data = await registeredWidget.dataProvider();

    expect(listEntities).toHaveBeenCalledWith({
      entityType: "summary",
      options: {
        limit: 10,
        sortFields: [{ field: "updated", direction: "desc" }],
      },
    });
    expect(data.items).toEqual([
      {
        id: "conversation-1",
        name: "Design Review",
        count: 3,
        status: "18 msgs",
      },
    ]);
  });
});
