import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createAgentDirectoryTools } from "../../src/tools";
import type { Tool, ToolResult } from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

function parseResult(raw: unknown): {
  success: boolean;
  data?: Record<string, unknown> | undefined;
  error?: string | undefined;
  message?: string | undefined;
} {
  const result = raw as ToolResult;
  if (result.success) {
    return {
      success: true,
      data: result.data as Record<string, unknown>,
      message: result.message,
    };
  }
  return { success: false, error: result.error };
}

const toolContext = { interfaceType: "mcp" as const, userId: "test" };

const mockAgentCard = {
  name: "Yeehaa's Brain",
  url: "https://yeehaa.io/a2a",
  description: "Personal knowledge brain for institutional design",
  skills: [
    {
      id: "content-creation",
      description: "Create blog posts",
      tags: ["blog"],
    },
    { id: "search", description: "Search knowledge base", tags: ["search"] },
  ],
  capabilities: {
    extensions: [
      {
        uri: "https://rizom.ai/ext/anchor-profile/v1",
        description: "Anchor identity",
        params: {
          name: "Yeehaa",
          kind: "professional",
          organization: "Rizom",
          description: "Founder of Rizom, working on institutional design",
        },
      },
    ],
  },
};

function createMockFetch(cardData: unknown = mockAgentCard) {
  return mock(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("agent-card.json")) {
      return new Response(JSON.stringify(cardData), { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  });
}

describe("agent_add tool", () => {
  let shell: MockShell;
  let context: ServicePluginContext;

  beforeEach(() => {
    shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "agent-directory");
  });

  it("should create agent entity from Agent Card", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });
    const tool = findTool(tools, "agent-directory_add");

    const result = parseResult(
      await tool.handler({ url: "yeehaa.io" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["domain"]).toBe("yeehaa.io");
    expect(result.data?.["name"]).toBe("Yeehaa");
  });

  it("should populate anchor info from extension", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });
    const tool = findTool(tools, "agent-directory_add");
    await tool.handler({ url: "yeehaa.io" }, toolContext);

    const entity = await context.entityService.getEntity("agent", "yeehaa.io");
    expect(entity).toBeDefined();
    expect(entity?.content).toContain("name: Yeehaa");
    expect(entity?.content).toContain("kind: professional");
    expect(entity?.content).toContain("Rizom");
    expect(entity?.content).toContain("Founder of Rizom");
  });

  it("should build Skills section from Agent Card skills", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });
    const tool = findTool(tools, "agent-directory_add");
    await tool.handler({ url: "yeehaa.io" }, toolContext);

    const entity = await context.entityService.getEntity("agent", "yeehaa.io");
    expect(entity?.content).toContain("content-creation: Create blog posts");
    expect(entity?.content).toContain("search: Search knowledge base");
  });

  it("should handle card without anchor extension", async () => {
    const cardNoExtension = {
      name: "External Agent",
      url: "https://external.io/a2a",
      description: "Some external agent",
      skills: [],
    };

    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(cardNoExtension),
    });
    const tool = findTool(tools, "agent-directory_add");
    const result = parseResult(
      await tool.handler({ url: "external.io" }, toolContext),
    );

    expect(result.success).toBe(true);
    const entity = await context.entityService.getEntity(
      "agent",
      "external.io",
    );
    expect(entity?.content).toContain("name: External Agent");
  });

  it("should fail gracefully when card unreachable", async () => {
    const failFetch = mock(async () => {
      return new Response("Not found", { status: 404 });
    });

    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: failFetch,
    });
    const tool = findTool(tools, "agent-directory_add");
    const result = parseResult(
      await tool.handler({ url: "unreachable.io" }, toolContext),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("unreachable.io");
  });

  it("should handle https:// prefix in url", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });
    const tool = findTool(tools, "agent-directory_add");
    const result = parseResult(
      await tool.handler({ url: "https://yeehaa.io" }, toolContext),
    );

    expect(result.success).toBe(true);
    expect(result.data?.["domain"]).toBe("yeehaa.io");
  });
});

describe("agent_remove tool", () => {
  let shell: MockShell;
  let context: ServicePluginContext;

  beforeEach(() => {
    shell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(shell, "agent-directory");
  });

  it("should set status to archived", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });

    // Add agent first
    const addTool = findTool(tools, "agent-directory_add");
    await addTool.handler({ url: "yeehaa.io" }, toolContext);

    // Remove it
    const removeTool = findTool(tools, "agent-directory_remove");
    const result = parseResult(
      await removeTool.handler({ agent: "yeehaa.io" }, toolContext),
    );

    expect(result.success).toBe(true);
    const entity = await context.entityService.getEntity("agent", "yeehaa.io");
    expect(entity?.content).toContain("status: archived");
  });

  it("should fail when agent not found", async () => {
    const tools = createAgentDirectoryTools("agent-directory", context, {
      fetch: createMockFetch(),
    });
    const tool = findTool(tools, "agent-directory_remove");
    const result = parseResult(
      await tool.handler({ agent: "unknown.io" }, toolContext),
    );

    expect(result.success).toBe(false);
  });
});
