import { describe, expect, it, mock } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { MockLanguageModelV3 } from "ai/test";
import { createMockMessageBus } from "@brains/messaging-service/test";
import {
  createBrainAgentFactory,
  filterToolsForCallOptions,
} from "../src/brain-agent";

function tool(name: string): Tool {
  return {
    name,
    description: name,
    inputSchema: { value: z.string().optional() },
    visibility: "public",
    handler: mock(async () => ({ success: true as const })),
  };
}

describe("filterToolsForCallOptions", () => {
  it("keeps system_create available for upload-preserve create flows", () => {
    const tools = [tool("system_create"), tool("system_search")];

    expect(
      filterToolsForCallOptions(tools, {
        interfaceType: "agent",
        hasPriorResponseCandidate: false,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });

  it("keeps system_create available when prior-response candidates exist", () => {
    const tools = [tool("system_create"), tool("system_search")];

    expect(
      filterToolsForCallOptions(tools, {
        interfaceType: "agent",
        hasPriorResponseCandidate: true,
      }).map((t) => t.name),
    ).toEqual(["system_create", "system_search"]);
  });
});

describe("tools offered to the agent", () => {
  type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

  function answer(): ModelResponse {
    return {
      content: [{ type: "text", text: "Hello." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    };
  }

  async function offeredTools(tools: Tool[]): Promise<string[]> {
    const model = new MockLanguageModelV3({
      doGenerate: async (): Promise<ModelResponse> => answer(),
    });
    const agent = createBrainAgentFactory({
      model,
      messageBus: createMockMessageBus(),
    })({
      identity: {
        name: "Test Brain",
        role: "Researcher",
        purpose: "Answer questions",
        values: [],
      },
      tools,
      getToolsForPermission: () => tools,
    });
    await agent.generate({
      messages: [{ role: "user", content: "Hi" }],
      options: {
        conversationId: "conv-1",
        interfaceType: "cli",
        userPermissionLevel: "admin",
        isAnchor: true,
      },
    });
    return (model.doGenerateCalls[0]?.tools ?? []).map((t) => t.name);
  }

  it("leaves out a tool that cannot serve a call now", async () => {
    const unavailable: Tool = {
      ...tool("network_ask"),
      isAvailable: async () => false,
    };

    expect(await offeredTools([tool("system_search"), unavailable])).toEqual([
      "system_search",
    ]);
  });

  it("offers a tool once it can serve a call", async () => {
    const available: Tool = {
      ...tool("network_ask"),
      isAvailable: async () => true,
    };

    expect(await offeredTools([tool("system_search"), available])).toEqual([
      "system_search",
      "network_ask",
    ]);
  });

  it("leaves out a tool whose check fails", async () => {
    const failing: Tool = {
      ...tool("network_ask"),
      isAvailable: async () => {
        throw new Error("directory unavailable");
      },
    };

    expect(await offeredTools([tool("system_search"), failing])).toEqual([
      "system_search",
    ]);
  });
});
