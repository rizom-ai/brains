import { describe, it, expect, mock } from "bun:test";
import { createA2ACallTool } from "../src/client";
import type { ICoreEntityService, ToolResponse } from "@brains/plugins";

function isError(
  result: ToolResponse,
): result is { success: false; error: string } {
  return "success" in result && result.success === false;
}

/**
 * Create a mock fetch that serves an Agent Card and a successful A2A response.
 */
function createMockFetch(): ReturnType<typeof mock> {
  return mock(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    if (urlStr.includes("agent-card.json")) {
      return new Response(
        JSON.stringify({
          name: "Remote Brain",
          url: urlStr.replace("/.well-known/agent-card.json", "/a2a"),
        }),
        { status: 200 },
      );
    }

    // SSE response with final event
    const sseBody = `data: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        kind: "task",
        final: true,
        status: {
          state: "completed",
          message: { parts: [{ kind: "text", text: "hello back" }] },
        },
      },
    })}\n\n`;

    return new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });
}

function createMockEntityService(
  entities: Map<
    string,
    {
      id: string;
      entityType: string;
      content: string;
      metadata: Record<string, unknown>;
    }
  >,
): ICoreEntityService {
  return {
    getEntity: mock(async (_type: string, id: string) => {
      return entities.get(id) ?? null;
    }),
    hasEntityType: () => true,
    getEntityTypes: () => ["agent"],
    listEntities: mock(async () => []),
    search: mock(async () => []),
    countEntities: mock(async () => 0),
    getEntityCounts: mock(async () => []),
    getWeightMap: () => ({}),
  } as unknown as ICoreEntityService;
}

const toolContext = { interfaceType: "mcp" as const, userId: "test" };

describe("a2a_call agent resolution", () => {
  it("should resolve agent by domain from entity service", async () => {
    const entities = new Map();
    entities.set("yeehaa.io", {
      id: "yeehaa.io",
      entityType: "agent",
      content:
        "---\nname: Yeehaa\nurl: 'https://yeehaa.io'\nstatus: active\n---",
      metadata: { name: "Yeehaa", status: "active" },
    });

    const fetchFn = createMockFetch();
    const tool = createA2ACallTool({
      fetch: fetchFn,
      entityService: createMockEntityService(entities),
      outboundTokens: { "yeehaa.io": "token-123" },
    });

    const result = await tool.handler(
      { agent: "yeehaa.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("should still work with full URLs (backward compatible)", async () => {
    const fetchFn = createMockFetch();
    const tool = createA2ACallTool({ fetch: fetchFn });

    const result = await tool.handler(
      { agent: "https://yeehaa.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
  });

  it("should refuse archived agents", async () => {
    const entities = new Map();
    entities.set("old.io", {
      id: "old.io",
      entityType: "agent",
      content: "---\nname: Old\nurl: 'https://old.io'\nstatus: archived\n---",
      metadata: { name: "Old", status: "archived" },
    });

    const tool = createA2ACallTool({
      fetch: createMockFetch(),
      entityService: createMockEntityService(entities),
    });

    const result = await tool.handler(
      { agent: "old.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(true);
    if (isError(result)) {
      expect(result.error).toContain("archived");
    }
  });

  it("should fall back to direct URL when no entity found", async () => {
    const fetchFn = createMockFetch();
    const tool = createA2ACallTool({
      fetch: fetchFn,
      entityService: createMockEntityService(new Map()),
    });

    const result = await tool.handler(
      { agent: "unknown.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
  });
});
