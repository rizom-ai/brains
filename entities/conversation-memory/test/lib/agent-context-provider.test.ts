import { type ActionItemEntity } from "@brains/action-items";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import type { AgentContextRequest } from "@brains/contracts";
import { buildConversationMemoryAgentContext } from "../../src/lib/agent-context-provider";
import { conversationMemorySearchEntitySchema } from "../../src/lib/conversation-memory-retriever";
import type { SummaryEntity } from "../../src/schemas/summary";
import type { DecisionEntity } from "../../src/schemas/conversation-memory";
import { createMockSummaryEntity } from "../fixtures/summary-entities";
import {
  createMockActionItemEntity,
  createMockDecisionEntity,
} from "../fixtures/conversation-memory-entities";

const defaultVisibility = "restricted" as const;

describe("buildConversationMemoryAgentContext", () => {
  it("returns relevant same-space memory as agent context", async () => {
    const sameSpace = createSummary({
      id: "conv-team",
      channelId: "relay-team",
      channelName: "Relay Team",
      content:
        "# Conversation Summary\n\nTeam chose same-space memory retrieval.",
    });
    const otherSpace = createSummary({
      id: "conv-other",
      channelId: "other-team",
      channelName: "Other Team",
      content: "# Conversation Summary\n\nOther team memory should not appear.",
    });
    const context = createContextWithSearchResults([
      { entity: otherSpace, score: 0.99, excerpt: "Other team memory" },
      {
        entity: sameSpace,
        score: 0.5,
        excerpt: "Team chose same-space memory retrieval.",
      },
    ]);

    const response = await buildConversationMemoryAgentContext(
      context,
      createRequest("relay-team"),
    );

    expect(context.entityService.search).toHaveBeenCalledWith(
      {
        query: "What memory is relevant?",
        options: {
          types: ["summary", "decision", "action-item"],
          limit: 20,
          visibilityScope: "shared",
        },
      },
      conversationMemorySearchEntitySchema,
    );
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: "conv-team",
      source: "conversation-memory",
      title: "summary from Relay Team",
      content: "Team chose same-space memory retrieval.",
      provenance: {
        entityType: "summary",
        conversationId: "conv-team",
        spaceId: "mcp:relay-team",
        channelId: "relay-team",
      },
    });
    expect(context.logger.info).toHaveBeenCalledWith(
      "Conversation memory agent context audit",
      expect.objectContaining({
        conversationId: "conv-current",
        channelId: "relay-team",
        userPermissionLevel: "trusted",
        visibilityScope: "shared",
        spaceId: "mcp:relay-team",
        reason: "memory-injected",
        itemCount: 1,
        items: [
          expect.objectContaining({
            id: "conv-team",
            entityType: "summary",
            conversationId: "conv-team",
            spaceId: "mcp:relay-team",
            visibility: "restricted",
            eligibilityReason: "same-space-query-match",
          }),
        ],
      }),
    );
  });

  it("audits when channel context is missing", async () => {
    const context = createContextWithSearchResults([]);
    const response = await buildConversationMemoryAgentContext(context, {
      conversationId: "conv-current",
      message: "What memory is relevant?",
      interfaceType: "mcp",
      userPermissionLevel: "trusted" as const,
    });

    expect(response.items).toEqual([]);
    expect(context.logger.info).toHaveBeenCalledWith(
      "Conversation memory agent context audit",
      expect.objectContaining({
        conversationId: "conv-current",
        visibilityScope: "shared",
        reason: "no-channel-context",
        itemCount: 0,
        items: [],
      }),
    );
  });

  it("audits when no same-space memory is available", async () => {
    const context = createContextWithSearchResults([]);
    const response = await buildConversationMemoryAgentContext(
      context,
      createRequest("relay-team"),
    );

    expect(response.items).toEqual([]);
    expect(context.logger.info).toHaveBeenCalledWith(
      "Conversation memory agent context audit",
      expect.objectContaining({
        channelId: "relay-team",
        spaceId: "mcp:relay-team",
        reason: "no-same-space-memory",
        itemCount: 0,
        items: [],
      }),
    );
  });

  it("falls back to recent same-space memory when search has no matches", async () => {
    const summary = createSummary({
      id: "conv-recent",
      channelId: "relay-team",
      channelName: "Relay Team",
      content: "# Conversation Summary\n\nRecent same-space memory.",
    });
    const context = createMockEntityPluginContext({
      returns: {
        entityService: {
          search: [],
          listEntities: [summary],
        },
      },
    });

    const response = await buildConversationMemoryAgentContext(
      context,
      createRequest("relay-team"),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        id: "conv-recent",
        content: "Recent same-space memory.",
      }),
    ]);
  });

  it("expands structured summary entries for agent context", async () => {
    const summary = createSummary({
      id: "conv-team",
      channelId: "relay-team",
      channelName: "Relay Team",
      content: [
        "# Conversation Summary",
        "",
        "## Relay preset direction",
        "",
        "Time: 2026-01-01T00:00:00.000Z → 2026-01-01T00:05:00.000Z",
        "Messages summarized: 3",
        "",
        "Core validates private team memory, default adds a minimal public site, and full adds docs/decks.",
        "",
        "### Key Points",
        "",
        "- Keep publishing plugins out for now.",
      ].join("\n"),
    });
    const context = createContextWithSearchResults([
      { entity: summary, score: 0.7, excerpt: "Relay preset direction" },
    ]);

    const response = await buildConversationMemoryAgentContext(
      context,
      createRequest("relay-team"),
    );

    expect(response.items[0]?.content).toContain("Relay preset direction");
    expect(response.items[0]?.content).toContain(
      "Core validates private team memory",
    );
    expect(response.items[0]?.content).toContain(
      "Keep publishing plugins out for now.",
    );
  });

  it("preserves summary, decision, and action item provenance", async () => {
    const summary = createSummary({
      id: "conv-team",
      channelId: "relay-team",
      channelName: "Relay Team",
      content: "# Conversation Summary\n\nDurable summary memory.",
    });
    const decision = createDecision("decision-team", "relay-team");
    const actionItem = createActionItem("action-team", "relay-team");
    const context = createContextWithSearchResults([
      { entity: summary, score: 0.7, excerpt: "Durable summary memory." },
      { entity: decision, score: 0.6, excerpt: "Ship explicit retrieval." },
      { entity: actionItem, score: 0.5, excerpt: "Add future-use evals." },
    ]);

    const response = await buildConversationMemoryAgentContext(
      context,
      createRequest("relay-team"),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        id: "conv-team",
        provenance: expect.objectContaining({
          entityType: "summary",
          conversationId: "conv-team",
          spaceId: "mcp:relay-team",
          messageCount: 2,
          // Counted from the body, which holds no entries here.
          entryCount: 0,
        }),
      }),
      expect.objectContaining({
        id: "decision-team",
        provenance: expect.objectContaining({
          entityType: "decision",
          conversationId: "conv-1",
          spaceId: "mcp:relay-team",
          status: "active",
        }),
      }),
      expect.objectContaining({
        id: "action-team",
        provenance: expect.objectContaining({
          entityType: "action-item",
          conversationId: "conv-1",
          spaceId: "mcp:relay-team",
          status: "open",
        }),
      }),
    ]);
  });
});

function createContextWithSearchResults(
  results: Array<{
    entity: SummaryEntity | DecisionEntity | ActionItemEntity;
    score: number;
    excerpt: string;
  }>,
): ReturnType<typeof createMockEntityPluginContext> {
  return createMockEntityPluginContext({
    returns: {
      entityService: {
        search: results,
      },
    },
  });
}

function createRequest(channelId: string): AgentContextRequest {
  return {
    conversationId: "conv-current",
    message: "What memory is relevant?",
    interfaceType: "mcp",
    channelId,
    channelName: "Relay Team",
    userPermissionLevel: "trusted" as const,
  };
}

/** A summary is its conversation: its id is the conversation id. */
function createSummary(params: {
  id: string;
  channelId: string;
  channelName: string;
  content: string;
}): SummaryEntity {
  return createMockSummaryEntity({
    id: params.id,
    visibility: defaultVisibility,
    content: params.content,
    metadata: {
      channelId: params.channelId,
      channelName: params.channelName,
      interfaceType: "mcp",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:10:00.000Z",
      },
      messageCount: 2,
      sourceHash: `${params.id}-hash`,
    },
  });
}

function createDecision(id: string, channelId: string): DecisionEntity {
  const entity = createMockDecisionEntity(id, defaultVisibility);
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      interfaceType: "mcp",
      channelId,
      channelName: "Relay Team",
    },
  };
}

function createActionItem(id: string, channelId: string): ActionItemEntity {
  const entity = createMockActionItemEntity(id, defaultVisibility);
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      interfaceType: "mcp",
      channelId,
      channelName: "Relay Team",
    },
  };
}
