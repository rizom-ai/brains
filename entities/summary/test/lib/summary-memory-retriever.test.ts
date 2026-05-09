import { describe, expect, it, spyOn } from "bun:test";
import type { Conversation, SearchResult } from "@brains/plugins";
import { createMockEntityPluginContext } from "@brains/test-utils";
import { SummaryMemoryRetriever } from "../../src/lib/summary-memory-retriever";
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

function asSearchResults(
  summaries: Array<{ summary: SummaryEntity; score: number; excerpt: string }>,
): SearchResult<SummaryEntity>[] {
  return summaries.map(({ summary, score, excerpt }) => ({
    entity: summary,
    score,
    excerpt,
  }));
}

describe("SummaryMemoryRetriever", () => {
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
        { summary: otherSpace, score: 0.95, excerpt: "Other space memory" },
        { summary: sameSpace, score: 0.6, excerpt: "Team memory" },
      ]),
    );

    const retriever = new SummaryMemoryRetriever(context);
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
        { summary: otherSpace, score: 0.95, excerpt: "Other space memory" },
        { summary: sameSpace, score: 0.6, excerpt: "Team memory" },
      ]),
    );

    const retriever = new SummaryMemoryRetriever(context);
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

  it("derives retrieval space from conversation id", async () => {
    const context = createMockEntityPluginContext();
    spyOn(context.conversations, "get").mockResolvedValue(
      createConversation("team"),
    );
    const sameSpace = createSummary({ id: "summary-team", channelId: "team" });
    spyOn(context.entityService, "search").mockResolvedValue(
      asSearchResults([
        { summary: sameSpace, score: 0.8, excerpt: "Team memory" },
      ]),
    );

    const retriever = new SummaryMemoryRetriever(context);
    const result = await retriever.retrieve({
      query: "memory",
      conversationId: "conv-current",
    });

    expect(context.conversations.get).toHaveBeenCalledWith("conv-current");
    expect(result.spaceId).toBe("mcp:team");
    expect(result.results.map((item) => item.id)).toEqual(["summary-team"]);
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

    const retriever = new SummaryMemoryRetriever(context);
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
