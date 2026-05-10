import { describe, expect, it, mock, spyOn } from "bun:test";
import type { EvalHandler, SearchResult } from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import { registerSummaryEvalHandlers } from "../../src/lib/eval-handlers";
import {
  summaryConfigSchema,
  type SummaryEntity,
} from "../../src/schemas/summary";

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

  registerSummaryEvalHandlers({
    context,
    logger: createSilentLogger(),
    config: summaryConfigSchema.parse({ projectionVersion: 3 }),
  });

  return { context, handlers };
}

describe("registerSummaryEvalHandlers", () => {
  it("registers the projection decision eval handler", () => {
    const { handlers } = registerHandlers();

    expect(handlers.has("summarizeMessages")).toBe(true);
    expect(handlers.has("decideProjection")).toBe(true);
    expect(handlers.has("retrieveMemory")).toBe(true);
    expect(handlers.has("projectConversation")).toBe(true);
  });

  it("retrieveMemory returns same-space summary memory", async () => {
    const { context, handlers } = registerHandlers();
    const summary: SummaryEntity = {
      id: "summary-1",
      entityType: "summary",
      content: "# Conversation Summary\n\nTeam chose same-space retrieval.",
      contentHash: "hash",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      metadata: {
        conversationId: "summary-1",
        channelId: "team",
        interfaceType: "mcp",
        messageCount: 3,
        entryCount: 1,
        sourceHash: "source",
        projectionVersion: 1,
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
          id: "summary-1",
          conversationId: "summary-1",
          spaceId: "mcp:team",
          excerpt: "Team chose same-space retrieval.",
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

  it("projectMessages returns separate decision and action-item entities", async () => {
    const { context, handlers } = registerHandlers();
    spyOn(context.ai, "generate").mockResolvedValue({
      entries: [
        {
          title: "Memory entities",
          summary: "Conversation memory uses separate entities.",
          startMessageIndex: 1,
          endMessageIndex: 2,
          keyPoints: ["Summaries stay narrative-only"],
          decisions: ["Use separate decision entities"],
          actionItems: ["Add projection evals"],
        },
      ],
    });

    const handler = handlers.get("projectMessages");
    if (!handler) throw new Error("projectMessages handler missing");

    const result = await handler({
      conversationId: "conv-1",
      interfaceType: "mcp",
      channelId: "team",
      messages: [
        {
          role: "user",
          content: "Decision: use separate decision entities.",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
        {
          role: "user",
          content: "Action item: add projection evals.",
          timestamp: "2026-01-01T00:01:00.000Z",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({ skipped: false }),
        summaries: [
          expect.objectContaining({
            entityType: "summary",
            content: expect.not.stringContaining("### Decisions"),
          }),
        ],
        decisions: [
          expect.objectContaining({
            entityType: "decision",
            metadata: expect.objectContaining({ status: "active" }),
          }),
        ],
        actionItems: [
          expect.objectContaining({
            entityType: "action-item",
            metadata: expect.objectContaining({ status: "open" }),
          }),
        ],
      }),
    );
  });

  it("decideProjection returns the AI skip/update/append decision", async () => {
    const { context, handlers } = registerHandlers();
    const generateSpy = spyOn(context.ai, "generateObject").mockResolvedValue({
      object: {
        decision: "append",
        rationale: "New durable decision",
      },
    });

    const handler = handlers.get("decideProjection");
    if (!handler) throw new Error("decideProjection handler missing");

    const result = await handler({
      conversationId: "conv-1",
      existingSummary:
        "# Conversation Summary\n\n## Existing\n\nEarlier durable context.",
      existingMessageCount: 1,
      messages: [
        {
          role: "user",
          content: "Earlier durable context.",
          timestamp: "2026-05-04T10:00:00Z",
        },
        {
          role: "user",
          content: "Decision: use a 90 second delayed projection window.",
          timestamp: "2026-05-04T10:01:00Z",
        },
      ],
    });

    expect(result).toEqual({
      decision: "append",
      rationale: "New durable decision",
    });
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const prompt = String(generateSpy.mock.calls[0]?.[0]);
    expect(prompt).toContain("Existing summary");
    expect(prompt).toContain("90 second delayed projection");
    expect(prompt).not.toContain("1. [2026-05-04T10:00:00Z]");
  });
});
