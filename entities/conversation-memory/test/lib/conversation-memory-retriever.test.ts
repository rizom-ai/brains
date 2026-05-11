import { describe, expect, it, spyOn } from "bun:test";
import type { Conversation, SearchResult } from "@brains/plugins";
import { createMockEntityPluginContext } from "@brains/test-utils";
import { ConversationMemoryRetriever } from "../../src/lib/conversation-memory-retriever";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../../src/schemas/conversation-memory";
import type { SummaryEntity } from "../../src/schemas/summary";

function createSummary(params: {
  id: string;
  channelId: string;
  channelName?: string;
  content?: string;
  score?: number;
  updated?: string;
}): SummaryEntity {
  const updated = params.updated ?? "2026-01-01T00:00:00.000Z";
  return {
    id: params.id,
    entityType: "summary",
    content:
      params.content ??
      "---\nconversationId: test\n---\n# Conversation Summary\n\nDurable team memory.",
    contentHash: `hash-${params.id}`,
    created: updated,
    updated,
    metadata: {
      conversationId: params.id,
      channelId: params.channelId,
      ...(params.channelName ? { channelName: params.channelName } : {}),
      interfaceType: "mcp",
      messageCount: 4,
      entryCount: 1,
      sourceHash: `source-${params.id}`,
      projectionVersion: 1,
    },
  };
}

function createDecision(params: {
  id: string;
  channelId: string;
  content?: string;
  score?: number;
  updated?: string;
  decidedBy?: DecisionEntity["metadata"]["decidedBy"];
}): DecisionEntity {
  const updated = params.updated ?? "2026-01-01T00:00:00.000Z";
  return {
    id: params.id,
    entityType: "decision",
    content: params.content ?? "# Decision\n\nUse separate decision entities.",
    contentHash: `hash-${params.id}`,
    created: updated,
    updated,
    metadata: {
      conversationId: "conv-decision",
      channelId: params.channelId,
      interfaceType: "mcp",
      spaceId: `mcp:${params.channelId}`,
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: "conv-decision",
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: "active",
      ...(params.decidedBy ? { decidedBy: params.decidedBy } : {}),
    },
  };
}

function createActionItem(params: {
  id: string;
  channelId: string;
  content?: string;
  score?: number;
  updated?: string;
  assignedTo?: ActionItemEntity["metadata"]["assignedTo"];
  requestedBy?: ActionItemEntity["metadata"]["requestedBy"];
}): ActionItemEntity {
  const updated = params.updated ?? "2026-01-01T00:00:00.000Z";
  return {
    id: params.id,
    entityType: "action-item",
    content: params.content ?? "# Action item\n\nCreate action-item entities.",
    contentHash: `hash-${params.id}`,
    created: updated,
    updated,
    metadata: {
      conversationId: "conv-action",
      channelId: params.channelId,
      interfaceType: "mcp",
      spaceId: `mcp:${params.channelId}`,
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      sourceSummaryId: "conv-action",
      sourceMessageCount: 2,
      projectionVersion: 1,
      status: "open",
      ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
      ...(params.requestedBy ? { requestedBy: params.requestedBy } : {}),
    },
  };
}

function createConversation(channelId: string): Conversation {
  return {
    id: "conv-current",
    sessionId: "conv-current",
    interfaceType: "mcp",
    channelId,
    channelName: channelId,
    startedAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
  };
}

type TestMemoryEntity = SummaryEntity | DecisionEntity | ActionItemEntity;

function asSearchResults(
  items: Array<{ entity: TestMemoryEntity; score: number; excerpt: string }>,
): SearchResult<TestMemoryEntity>[] {
  return items.map(({ entity, score, excerpt }) => ({
    entity,
    score,
    excerpt,
  }));
}

describe("ConversationMemoryRetriever", () => {
  it("retrieves only same-space summaries by default", async () => {
    const context = createMockEntityPluginContext();
    const sameSpace = createSummary({
      id: "summary-team",
      channelId: "team",
      channelName: "Team",
    });
    const otherSpace = createSummary({
      id: "summary-other",
      channelId: "other",
      channelName: "Other",
    });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: otherSpace, score: 0.95, excerpt: "Other space memory" },
        { entity: sameSpace, score: 0.6, excerpt: "Team memory" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "memory",
      interfaceType: "mcp",
      channelId: "team",
    });

    expect(result.spaceId).toBe("mcp:team");
    expect(result.results.map((item) => item.id)).toEqual(["summary-team"]);
    expect(result.results[0]).toMatchObject({
      conversationId: "summary-team",
      spaceId: "mcp:team",
      channelName: "Team",
      excerpt: "Team memory",
    });
  });

  it("can include other spaces while ranking same-space results first", async () => {
    const context = createMockEntityPluginContext();
    const sameSpace = createSummary({ id: "summary-team", channelId: "team" });
    const otherSpace = createSummary({
      id: "summary-other",
      channelId: "other",
    });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: otherSpace, score: 0.95, excerpt: "Other space memory" },
        { entity: sameSpace, score: 0.6, excerpt: "Team memory" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "memory",
      interfaceType: "mcp",
      channelId: "team",
      includeOtherSpaces: true,
    });

    expect(result.results.map((item) => item.id)).toEqual([
      "summary-team",
      "summary-other",
    ]);
  });

  it("retrieves decisions and action items as first-class memory", async () => {
    const context = createMockEntityPluginContext();
    const decision = createDecision({ id: "decision-1", channelId: "team" });
    const actionItem = createActionItem({ id: "action-1", channelId: "team" });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        {
          entity: decision,
          score: 0.9,
          excerpt: "Use separate decision entities.",
        },
        {
          entity: actionItem,
          score: 0.8,
          excerpt: "Create action-item entities.",
        },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "separate entities",
      interfaceType: "mcp",
      channelId: "team",
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        id: "decision-1",
        entityType: "decision",
        status: "active",
        excerpt: "Use separate decision entities.",
      }),
      expect.objectContaining({
        id: "action-1",
        entityType: "action-item",
        status: "open",
        excerpt: "Create action-item entities.",
      }),
    ]);
  });

  it("derives retrieval space from conversation id", async () => {
    const context = createMockEntityPluginContext();
    spyOn(context.conversations, "get").mockResolvedValue(
      createConversation("team"),
    );
    const sameSpace = createSummary({ id: "summary-team", channelId: "team" });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: sameSpace, score: 0.8, excerpt: "Team memory" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "memory",
      conversationId: "conv-current",
    });

    expect(context.conversations.get).toHaveBeenCalledWith("conv-current");
    expect(result.spaceId).toBe("mcp:team");
    expect(result.results.map((item) => item.id)).toEqual(["summary-team"]);
  });

  it("filters memory by canonical identity without crossing spaces by default", async () => {
    const context = createMockEntityPluginContext();
    const sameSpaceDaniel = createDecision({
      id: "decision-daniel-same",
      channelId: "team",
      content: "# Decision\n\nDaniel chose the team checklist.",
      decidedBy: [
        {
          actorId: "discord:user-daniel",
          canonicalId: "person:daniel",
          displayName: "Daniel",
        },
      ],
    });
    const otherSpaceDaniel = createDecision({
      id: "decision-daniel-other",
      channelId: "other",
      content: "# Decision\n\nDaniel chose the other checklist.",
      decidedBy: [
        {
          actorId: "mcp:daniel",
          canonicalId: "person:daniel",
          displayName: "Daniel",
        },
      ],
    });
    const sameSpaceAlex = createDecision({
      id: "decision-alex-same",
      channelId: "team",
      content: "# Decision\n\nAlex chose a separate checklist.",
      decidedBy: [{ actorId: "discord:user-alex", displayName: "Daniel" }],
    });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: otherSpaceDaniel, score: 0.95, excerpt: "Other Daniel" },
        { entity: sameSpaceAlex, score: 0.9, excerpt: "Unlinked same name" },
        { entity: sameSpaceDaniel, score: 0.8, excerpt: "Same Daniel" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "checklist",
      interfaceType: "mcp",
      channelId: "team",
      canonicalId: "person:daniel",
    });

    expect(result.results.map((item) => item.id)).toEqual([
      "decision-daniel-same",
    ]);
  });

  it("filters memory by source actor id", async () => {
    const context = createMockEntityPluginContext();
    const linkedSummary = createSummary({
      id: "summary-linked",
      channelId: "team",
    });
    linkedSummary.metadata.participants = [
      {
        actorId: "discord:user-daniel",
        canonicalId: "person:daniel",
        displayName: "Daniel",
        roles: ["user"],
        sourceActorIds: ["discord:user-daniel", "mcp:daniel"],
      },
    ];
    const otherSummary = createSummary({
      id: "summary-other",
      channelId: "team",
    });
    otherSummary.metadata.participants = [
      {
        actorId: "discord:user-other",
        displayName: "Daniel",
        roles: ["user"],
      },
    ];
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: otherSummary, score: 0.99, excerpt: "Other Daniel" },
        { entity: linkedSummary, score: 0.7, excerpt: "Linked Daniel" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "Daniel",
      interfaceType: "mcp",
      channelId: "team",
      actorId: "mcp:daniel",
    });

    expect(result.results.map((item) => item.id)).toEqual(["summary-linked"]);
  });

  it("can expand canonical identity retrieval across spaces when requested", async () => {
    const context = createMockEntityPluginContext();
    const discordDaniel = createDecision({
      id: "decision-discord-daniel",
      channelId: "discord-team",
      content: "# Decision\n\nDaniel chose the Discord checklist.",
      decidedBy: [
        {
          actorId: "discord:user-daniel",
          canonicalId: "person:daniel",
          displayName: "Daniel",
        },
      ],
    });
    const mcpDaniel = createActionItem({
      id: "action-mcp-daniel",
      channelId: "mcp-team",
      content: "# Action item\n\nDaniel will update the MCP checklist.",
      assignedTo: [
        {
          actorId: "mcp:daniel",
          canonicalId: "person:daniel",
          displayName: "Daniel",
        },
      ],
    });
    const unlinkedDaniel = createDecision({
      id: "decision-unlinked-daniel",
      channelId: "discord-team",
      content: "# Decision\n\nAnother Daniel chose the launch plan.",
      decidedBy: [{ actorId: "discord:user-other", displayName: "Daniel" }],
    });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { entity: unlinkedDaniel, score: 0.99, excerpt: "Unlinked Daniel" },
        { entity: mcpDaniel, score: 0.8, excerpt: "MCP Daniel" },
        { entity: discordDaniel, score: 0.7, excerpt: "Discord Daniel" },
      ]),
    );

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "Daniel checklist",
      interfaceType: "mcp",
      channelId: "mcp-team",
      canonicalId: "person:daniel",
      includeOtherSpaces: true,
    });

    expect(result.results.map((item) => item.id)).toEqual([
      "action-mcp-daniel",
      "decision-discord-daniel",
    ]);
  });

  it("lists recent summaries when no query is provided", async () => {
    const context = createMockEntityPluginContext();
    const newest = createSummary({
      id: "newest",
      channelId: "team",
      content: "# Conversation Summary\n\nNewest memory.",
      updated: "2026-01-02T00:00:00.000Z",
    });
    const listSpy = spyOn(
      context.entityService,
      "listEntities",
    ).mockImplementation(<T>() => Promise.resolve([newest] as unknown as T[]));

    const retriever = new ConversationMemoryRetriever(context);
    const result = await retriever.retrieve({ limit: 1 });

    expect(listSpy).toHaveBeenCalledWith({
      entityType: "summary",
      options: {
        limit: 4,
        sortFields: [{ field: "updated", direction: "desc" }],
      },
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        id: "newest",
        excerpt: "Newest memory.",
      }),
    ]);
  });
});
