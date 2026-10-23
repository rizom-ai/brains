import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it, mock, spyOn } from "bun:test";
import type { EvalHandler, SearchResult } from "@brains/plugins";
import { registerMemoryEvalHandlers } from "../../src/lib/eval-handlers";
import type { SummaryEntity } from "../../src/schemas/summary";
import { summaryConfigSchema } from "../../src/schemas/summary-config";

const defaultMemoryVisibility = summaryConfigSchema.parse({}).memoryVisibility;

function registerHandlers(): {
  context: ReturnType<typeof createMockEntityPluginContext>;
  handlers: Map<string, EvalHandler>;
} {
  const context = createMockEntityPluginContext();
  const handlers = new Map<string, EvalHandler>();
  context.eval.registerHandler = mock(
    (handlerId: string, handler: EvalHandler) => {
      handlers.set(handlerId, handler);
    },
  );

  registerMemoryEvalHandlers({ context });

  return { context, handlers };
}

describe("registerMemoryEvalHandlers", () => {
  it("registers only the memory recall handlers", () => {
    const { handlers } = registerHandlers();

    expect([...handlers.keys()]).toEqual([
      "retrieveMemory",
      "buildAgentContext",
    ]);
  });

  it("retrieveMemory returns same-space summary memory", async () => {
    const { context, handlers } = registerHandlers();
    const summary: SummaryEntity = {
      id: "conv-1",
      entityType: "summary",
      content: "# Conversation Summary\n\nTeam chose same-space retrieval.",
      contentHash: "hash",
      visibility: defaultMemoryVisibility,
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      metadata: {
        channelId: "team",
        interfaceType: "mcp",
        messageCount: 3,
        sourceHash: "source",
      },
    };
    spyOn(context.entityService, "search").mockResolvedValue([
      {
        entity: summary,
        score: 0.9,
        excerpt: "Team chose same-space retrieval.",
      },
    ] satisfies SearchResult<SummaryEntity>[]);

    const handler = handlers.get("retrieveMemory");
    if (!handler) throw new Error("retrieveMemory handler missing");

    const result = await handler({
      query: "retrieval",
      interfaceType: "mcp",
      channelId: "team",
    });

    expect(result).toEqual({
      query: "retrieval",
      spaceId: "mcp:team",
      results: [
        expect.objectContaining({
          id: "conv-1",
          conversationId: "conv-1",
          spaceId: "mcp:team",
          excerpt: "Team chose same-space retrieval.",
        }),
      ],
    });
  });

  it("buildAgentContext evaluates injected same-space memory with provenance", async () => {
    const { handlers } = registerHandlers();
    const handler = handlers.get("buildAgentContext");
    if (!handler) throw new Error("buildAgentContext handler missing");

    const result = await handler({
      message: "What did the team decide about memory?",
      interfaceType: "mcp",
      channelId: "team",
      memory: [
        {
          id: "conv-1",
          entityType: "summary",
          conversationId: "conv-1",
          interfaceType: "mcp",
          channelId: "team",
          content:
            "# Conversation Summary\n\nThe team chose explicit memory retrieval.",
          excerpt: "The team chose explicit memory retrieval.",
          score: 0.8,
          visibility: "shared",
        },
        {
          id: "conv-other",
          entityType: "summary",
          conversationId: "conv-other",
          interfaceType: "mcp",
          channelId: "other-team",
          content: "# Conversation Summary\n\nOther team memory.",
          excerpt: "Other team memory.",
          score: 0.99,
          visibility: "shared",
        },
      ],
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "conv-1",
          source: "conversation-memory",
          content: "The team chose explicit memory retrieval.",
          provenance: expect.objectContaining({
            entityType: "summary",
            conversationId: "conv-1",
            spaceId: "mcp:team",
          }),
        }),
      ],
    });
  });

  it("retrieveMemory can evaluate first-class decision and action memory", async () => {
    const { handlers } = registerHandlers();
    const handler = handlers.get("retrieveMemory");
    if (!handler) throw new Error("retrieveMemory handler missing");

    const result = await handler({
      query: "separate memory",
      interfaceType: "mcp",
      channelId: "team",
      memory: [
        {
          id: "decision-1",
          entityType: "decision",
          conversationId: "conv-1",
          interfaceType: "mcp",
          channelId: "team",
          content: "# Decision\n\nUse separate decision entities.",
          excerpt: "Use separate decision entities.",
          score: 0.8,
          status: "active",
        },
        {
          id: "action-1",
          entityType: "action-item",
          conversationId: "conv-1",
          interfaceType: "mcp",
          channelId: "team",
          content: "# Action item\n\nAdd retrieval evals.",
          excerpt: "Add retrieval evals.",
          score: 0.7,
          status: "open",
        },
      ],
    });

    expect(result).toEqual({
      query: "separate memory",
      spaceId: "mcp:team",
      results: [
        expect.objectContaining({
          id: "decision-1",
          entityType: "decision",
          status: "active",
        }),
        expect.objectContaining({
          id: "action-1",
          entityType: "action-item",
          status: "open",
        }),
      ],
    });
  });
});
