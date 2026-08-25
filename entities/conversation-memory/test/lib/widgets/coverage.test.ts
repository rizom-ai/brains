import { describe, expect, it } from "bun:test";
import { createTestEntityAccess } from "@brains/test-utils";
import { type Conversation, type Message } from "@brains/plugins";
import { buildSummaryCoverageData } from "../../../src/lib/widgets/coverage";
import { summaryCoverageWidgetDeclaration } from "../../../src/lib/widgets/coverage";
import { summaryConfigSchema } from "../../../src/schemas/summary-config";
import type { SummaryEntity } from "../../../src/schemas/summary";
import { createMockEntityPluginContext } from "@brains/test-utils";

const defaultMemoryVisibility = summaryConfigSchema.parse({}).memoryVisibility;

function createSummary(overrides: Partial<SummaryEntity> = {}): SummaryEntity {
  const now = new Date(Date.UTC(2026, 0, 1)).toISOString();
  return {
    id: "conversation-1",
    entityType: "summary",
    content: "# Conversation Summary\n",
    contentHash: "hash",
    visibility: defaultMemoryVisibility,
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

describe("buildSummaryCoverageData", () => {
  it("reports disabled memory when no spaces are configured", async () => {
    const summaries = [createSummary()];
    const base = createMockEntityPluginContext({
      spaces: [],
      listEntitiesImpl: async (): Promise<SummaryEntity[]> => summaries,
    });
    // Only the conversation reads this case needs; the rest of the namespace
    // stays the factory's real implementation.
    const context = {
      ...base,
      conversations: {
        ...base.conversations,
        list: async (): Promise<Conversation[]> => [],
      },
    };

    const data = await buildSummaryCoverageData({
      entities: createTestEntityAccess({
        entityService: context.entityService,
      }),
      conversations: context.conversations,
      spaces: context.spaces,
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

    const base = createMockEntityPluginContext({
      spaces: ["mcp:team"],
      listEntitiesImpl: async (): Promise<SummaryEntity[]> => summaries,
    });
    const context = {
      ...base,
      conversations: {
        ...base.conversations,
        list: async (): Promise<Conversation[]> => conversations,
        get: async (conversationId: string): Promise<Conversation | null> =>
          conversations.find(
            (conversation) => conversation.id === conversationId,
          ) ?? null,
        getMessages: (conversationId: string): Promise<Message[]> =>
          Promise.resolve(createMessages(conversationId)),
      },
    };

    const data = await buildSummaryCoverageData({
      entities: createTestEntityAccess({
        entityService: context.entityService,
      }),
      conversations: context.conversations,
      spaces: context.spaces,
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

// The runtime owns waiting for the dashboard and announcing the widget.
// What is this package's is the declaration, and that coverage is a
// question about every conversation rather than one.
describe("summaryCoverageWidgetDeclaration", () => {
  it("declares the widget and surveys conversations to load it", async () => {
    const declaration = summaryCoverageWidgetDeclaration(
      summaryConfigSchema.parse({}),
    );
    expect(declaration.definition.id).toBe("coverage");

    const context = createMockEntityPluginContext({
      listEntitiesImpl: async () => [],
    });
    let surveyed = false;
    const data = await declaration.load({
      entities: createTestEntityAccess({
        entityService: context.entityService,
      }),
      conversations: {
        get: async () => null,
        getMessages: async () => [],
        list: async () => {
          surveyed = true;
          return [];
        },
      },
      spaces: [],
      caller: null,
      signal: new AbortController().signal,
    });

    // No spaces configured, so there is nothing to survey and it says so
    // rather than reporting zero coverage.
    expect(surveyed).toBe(false);
    expect(data).toMatchObject({
      items: [{ id: "spaces", status: "disabled" }],
    });
  });
});
