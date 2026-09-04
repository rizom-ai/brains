import {
  createMockEntityService as createSharedEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { describe, it, expect, mock } from "bun:test";
import { createAgentCallTool } from "../src/client";
import type {
  ICoreEntityService,
  ToolResponse,
  BaseEntity,
} from "@brains/plugins";

function isError(
  result: ToolResponse,
): result is { success: false; error: string; code?: string } {
  return "success" in result && result.success === false;
}

/**
 * Narrow to the error branch, failing with the actual response when it is not
 * one. Asserting the predicate and then re-testing it in an `if` lets the
 * assertions inside be skipped instead of failing.
 */
function assertIsError(
  result: ToolResponse,
): asserts result is { success: false; error: string; code?: string } {
  if (!isError(result)) {
    throw new Error(
      `Expected an error response, got ${JSON.stringify(result)}`,
    );
  }
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

/**
 * Create a mock fetch that serves an Agent Card advertising the given
 * endpoint url and fails the test if the endpoint is ever contacted.
 */
function createCardFetch(cardEndpointUrl: string): ReturnType<typeof mock> {
  return mock(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    if (urlStr.includes("agent-card.json")) {
      return new Response(
        JSON.stringify({ name: "Remote Brain", url: cardEndpointUrl }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected request to ${urlStr}`);
  });
}

/**
 * Serve reads from a caller-supplied map. Everything else comes from the
 * shared factory, so this cannot fall behind the entity-service interface.
 */
function createEntityServiceFrom(
  entities: Map<string, BaseEntity>,
): ICoreEntityService {
  return createSharedEntityService({
    entityTypes: ["agent"],
    getEntityImpl: async (request) => entities.get(request.id) ?? null,
  });
}

const toolContext = {
  interfaceType: "mcp" as const,
  actor: { kind: "user" as const, userId: "test" },
};

describe("agent_call agent resolution", () => {
  it("should describe saved-agent questions as A2A calls", () => {
    const tool = createAgentCallTool();

    expect(tool.name).toBe("agent_call");
    expect(tool.visibility).toBe("trusted");
    expect(tool.sideEffects).toBe("external");
    expect(tool.description).toContain("exact domain-like target");
    expect(tool.description).toContain("skills/capabilities");
    expect(tool.description).toContain("one-shot call without saving");
  });
  it("should resolve an approved saved agent by domain from the entity service", async () => {
    const entities = new Map();
    entities.set(
      "yeehaa.io",
      createTestEntity<BaseEntity>("agent", {
        id: "yeehaa.io",
        content:
          "---\nname: Yeehaa\nurl: 'https://yeehaa.io/a2a'\nstatus: approved\n---",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io/a2a",
          status: "approved",
        },
      }),
    );

    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "yeehaa.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("should normalize an HTTPS URL for a saved agent to its hostname and contact over HTTPS", async () => {
    const entities = new Map();
    entities.set(
      "yeehaa.io",
      createTestEntity<BaseEntity>("agent", {
        id: "yeehaa.io",
        content:
          "---\nname: Yeehaa\nurl: 'https://yeehaa.io/a2a'\nstatus: approved\n---",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io/a2a",
          status: "approved",
        },
      }),
    );

    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "https://yeehaa.io/agent", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://yeehaa.io/.well-known/agent-card.json",
    );
    expect(fetchFn.mock.calls[1]?.[0]).toBe("https://yeehaa.io/a2a");
  });

  it("should refuse discovered agents until approved", async () => {
    const entities = new Map();
    entities.set(
      "old.io",
      createTestEntity<BaseEntity>("agent", {
        id: "old.io",
        content:
          "---\nname: Old\nurl: 'https://old.io'\nstatus: discovered\n---",
        metadata: { name: "Old", status: "discovered" },
      }),
    );

    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "old.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("Approve it first");
    expect(result.code).toBe("agent_not_approved");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should refuse archived agents before any network contact", async () => {
    const entities = new Map();
    entities.set(
      "archived.io",
      createTestEntity<BaseEntity>("agent", {
        id: "archived.io",
        content:
          "---\nname: Archived\nurl: 'https://archived.io'\nstatus: archived\n---",
        metadata: { name: "Archived", status: "archived" },
      }),
    );

    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "archived.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("archived");
    expect(result.code).toBe("agent_archived");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should verify and one-shot call an unsaved exact domain", async () => {
    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "unknown.io", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
    expect("success" in result && result.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://unknown.io/.well-known/agent-card.json",
    );
    expect(fetchFn.mock.calls[1]?.[0]).toBe("https://unknown.io/a2a");
    if (!("success" in result) || result.success !== true) {
      throw new Error("Expected successful tool response");
    }
    expect(result.data).toMatchObject({
      state: "completed",
      response: "hello back",
      agentContactCandidate: {
        source: { kind: "url", url: "unknown.io" },
      },
      agentCall: { mode: "one-shot", agent: "unknown.io" },
    });
  });

  it("should refuse unsaved ambiguous names before network contact", async () => {
    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "Brain", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toBe(
      "Agent Brain is not an exact domain-like id and is not saved. Connect or clarify the agent first.",
    );
    expect(result.code).toBe("agent_not_saved");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("should normalize an HTTPS URL for an unknown agent to a one-shot hostname call", async () => {
    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "https://unknown.io/path?q=1", message: "hello" },
      toolContext,
    );

    expect(isError(result)).toBe(false);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://unknown.io/.well-known/agent-card.json",
    );
    expect(fetchFn.mock.calls[1]?.[0]).toBe("https://unknown.io/a2a");
    if (!("success" in result) || result.success !== true) {
      throw new Error("Expected successful tool response");
    }
    expect(result.data).toMatchObject({
      agentCall: { mode: "one-shot", agent: "unknown.io" },
      agentContactCandidate: {
        source: { kind: "url", url: "https://unknown.io" },
      },
    });
  });

  it("should reject a one-shot card whose url points at a non-HTTPS endpoint", async () => {
    const fetchFn = createCardFetch("http://localhost:8080/a2a");
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "unknown.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("endpoint URL");
    // Only the card fetch — never the endpoint
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should reject a one-shot card whose url points at an unrelated host", async () => {
    const fetchFn = createCardFetch("https://attacker.example/a2a");
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "unknown.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("endpoint URL");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should reject an approved agent card whose url points at a non-HTTPS endpoint", async () => {
    const entities = new Map();
    entities.set(
      "yeehaa.io",
      createTestEntity<BaseEntity>("agent", {
        id: "yeehaa.io",
        content:
          "---\nname: Yeehaa\nurl: 'https://yeehaa.io/a2a'\nstatus: approved\n---",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io/a2a",
          status: "approved",
        },
      }),
    );

    const fetchFn = createCardFetch("http://localhost:8080/a2a");
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "yeehaa.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("endpoint URL");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should reject an approved agent card whose url points at an unrelated host", async () => {
    const entities = new Map();
    entities.set(
      "yeehaa.io",
      createTestEntity<BaseEntity>("agent", {
        id: "yeehaa.io",
        content:
          "---\nname: Yeehaa\nurl: 'https://yeehaa.io/a2a'\nstatus: approved\n---",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io/a2a",
          status: "approved",
        },
      }),
    );

    const fetchFn = createCardFetch("https://attacker.example/a2a");
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(entities),
    });

    const result = await tool.handler(
      { agent: "yeehaa.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toContain("endpoint URL");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should reject non-HTTPS agent URLs before network contact", async () => {
    const fetchFn = createMockFetch();
    const tool = createAgentCallTool({
      fetch: fetchFn,
      entityService: createEntityServiceFrom(new Map()),
    });

    const result = await tool.handler(
      { agent: "http://unknown.io", message: "hello" },
      toolContext,
    );

    assertIsError(result);
    expect(result.error).toBe(
      "Invalid agent URL. Agent URLs must use https://.",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
