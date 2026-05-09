import { describe, expect, it, mock } from "bun:test";
import type {
  Conversation,
  EntityPluginContext,
  Message,
} from "@brains/plugins";
import {
  buildSummaryDashboardData,
  registerSummaryDashboardWidget,
} from "../../src/lib/dashboard-widget";
import { summaryConfigSchema } from "../../src/schemas/summary";
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

function createConversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "conversation-1",
    sessionId: "conversation-1",
    interfaceType: "mcp",
    channelId: "channel-1",
    channelName: "Design Review",
    startedAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-01-01T00:01:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function createMessages(conversationId: string): Message[] {
  return [
    {
      id: `${conversationId}-m1`,
      conversationId,
      role: "user",
      content: "Capture this as durable memory.",
      timestamp: "2026-01-01T00:00:00.000Z",
      metadata: {},
    },
  ];
}

describe("buildSummaryDashboardData", () => {
  it("reports disabled memory when no spaces are configured", async () => {
    const summaries = [createSummary()];
    const context = {
      spaces: [],
      entityService: {
        listEntities: mock(async (): Promise<SummaryEntity[]> => summaries),
      },
      conversations: {
        list: mock(async (): Promise<Conversation[]> => []),
      },
    } as unknown as EntityPluginContext;

    const data = await buildSummaryDashboardData({
      context,
      config: summaryConfigSchema.parse({}),
    });

    expect(data.items).toEqual([
      {
        id: "spaces",
        name: "Configured spaces",
        count: 0,
        status: "disabled",
      },
      {
        id: "summary:conversation-1",
        name: "Design Review",
        count: 3,
        status: "18 msgs",
      },
    ]);
  });

  it("reports eligible, stale, and unsummarized conversation memory", async () => {
    const conversations = [
      createConversation({ id: "conversation-1", channelId: "team" }),
      createConversation({
        id: "conversation-2",
        sessionId: "conversation-2",
        channelId: "team",
      }),
      createConversation({
        id: "conversation-3",
        sessionId: "conversation-3",
        channelId: "outside",
      }),
    ];
    const summaries = [
      createSummary({
        id: "conversation-1",
        metadata: {
          conversationId: "conversation-1",
          channelId: "team",
          channelName: "Team",
          interfaceType: "mcp",
          messageCount: 1,
          entryCount: 2,
          sourceHash: "old-source-hash",
          projectionVersion: 1,
        },
      }),
    ];

    const context = {
      spaces: ["mcp:team"],
      entityService: {
        listEntities: mock(async (): Promise<SummaryEntity[]> => summaries),
      },
      conversations: {
        list: mock(async (): Promise<Conversation[]> => conversations),
        get: mock(
          async (conversationId: string): Promise<Conversation | null> => {
            return (
              conversations.find(
                (conversation) => conversation.id === conversationId,
              ) ?? null
            );
          },
        ),
        getMessages: mock((conversationId: string): Promise<Message[]> => {
          return Promise.resolve(createMessages(conversationId));
        }),
      },
    } as unknown as EntityPluginContext;

    const data = await buildSummaryDashboardData({
      context,
      config: summaryConfigSchema.parse({}),
    });

    expect(data.items).toEqual([
      {
        id: "spaces",
        name: "Configured spaces",
        count: 1,
        status: "active",
      },
      {
        id: "eligible-conversations",
        name: "Eligible conversations",
        count: 2,
        status: "1/2 summarized",
      },
      {
        id: "stale-summaries",
        name: "Stale summaries",
        count: 1,
        status: "stale",
      },
      {
        id: "unsummarized-conversations",
        name: "Unsummarized eligible",
        count: 1,
        status: "pending",
      },
      {
        id: "summary:conversation-1",
        name: "Team",
        count: 2,
        status: "stale",
      },
    ]);
  });
});

describe("registerSummaryDashboardWidget", () => {
  it("registers a conversation memory dashboard widget", async () => {
    let readyHandler: (() => Promise<{ success: boolean }>) | undefined;

    let registeredWidget:
      | {
          title: string;
          dataProvider: () => Promise<{
            items: Array<Record<string, unknown>>;
          }>;
        }
      | undefined;

    const send = mock(
      async (request: {
        type: string;
        payload: {
          title: string;
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

    const context = {
      spaces: [],
      messaging: { send, subscribe },
      entityService: {
        listEntities: mock(async (): Promise<SummaryEntity[]> => []),
      },
      conversations: {
        list: mock(async (): Promise<Conversation[]> => []),
      },
    } as unknown as EntityPluginContext;

    registerSummaryDashboardWidget({
      context,
      pluginId: "summary",
      config: summaryConfigSchema.parse({}),
    });

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
        title: "Conversation Memory",
        rendererName: "ListWidget",
      }),
    });

    expect(registeredWidget).toBeDefined();
    if (!registeredWidget) throw new Error("Widget was not registered");
    expect(registeredWidget.title).toBe("Conversation Memory");
    const widgetData = await registeredWidget.dataProvider();
    expect(widgetData).toEqual({
      items: [
        {
          id: "spaces",
          name: "Configured spaces",
          count: 0,
          status: "disabled",
        },
      ],
    });
  });
});
