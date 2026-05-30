import { describe, expect, it } from "bun:test";
import type { AgentContextRequest } from "@brains/contracts";
import { createMockEntityPluginContext } from "@brains/test-utils";
import { buildConversationMemoryAgentContext } from "../../src/lib/agent-context-provider";
import type { SummaryEntity } from "../../src/schemas/summary";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../../src/schemas/conversation-memory";
import { createMockSummaryEntity } from "../fixtures/summary-entities";
import {
  createMockActionItemEntity,
  createMockDecisionEntity,
} from "../fixtures/conversation-memory-entities";

const defaultVisibility = "restricted" as const;

describe("buildConversationMemoryAgentContext", () => {
  it("returns relevant same-space memory as agent context", async () => {
    const sameSpace = createSummary({
      id: "summary-team",
      conversationId: "conv-team",
      channelId: "relay-team",
      channelName: "Relay Team",
      content:
        "# Conversation Summary\n\nTeam chose same-space memory retrieval.",
    });
    const otherSpace = createSummary({
      id: "summary-other",
      conversationId: "conv-other",
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

    expect(context.entityService.search).toHaveBeenCalledWith({
      query: "What memory is relevant?",
      options: {
        types: ["summary", "decision", "action-item"],
        limit: 20,
        visibilityScope: "shared",
      },
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: "summary-team",
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
  });

  it("preserves summary, decision, and action item provenance", async () => {
    const summary = createSummary({
      id: "summary-team",
      conversationId: "conv-team",
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
        id: "summary-team",
        provenance: expect.objectContaining({
          entityType: "summary",
          conversationId: "conv-team",
          spaceId: "mcp:relay-team",
          messageCount: 2,
          entryCount: 1,
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

function createSummary(params: {
  id: string;
  conversationId: string;
  channelId: string;
  channelName: string;
  content: string;
}): SummaryEntity {
  return createMockSummaryEntity({
    id: params.id,
    visibility: defaultVisibility,
    content: params.content,
    metadata: {
      conversationId: params.conversationId,
      channelId: params.channelId,
      channelName: params.channelName,
      interfaceType: "mcp",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:10:00.000Z",
      },
      messageCount: 2,
      entryCount: 1,
      sourceHash: `${params.id}-hash`,
      projectionVersion: 1,
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
      spaceId: `mcp:${channelId}`,
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
      spaceId: `mcp:${channelId}`,
    },
  };
}
