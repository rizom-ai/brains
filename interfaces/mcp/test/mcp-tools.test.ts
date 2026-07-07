import { describe, expect, it, mock } from "bun:test";
import { createInterfacePluginContext } from "@brains/plugins/test";
import {
  createMockShell,
  createSilentLogger,
  type MockShellOptions,
} from "@brains/test-utils";
import { createMCPTools } from "../src/tools";

type AgentService = NonNullable<MockShellOptions["agentService"]>;

function createAgentService(): AgentService {
  return {
    chat: mock(async () => ({
      text: "Agent response",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    })),
    confirmPendingAction: mock(async () => ({
      text: "Confirmed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    })),
    invalidateAgent: mock(() => {}),
  };
}

describe("MCP tools", () => {
  it("creates a chat command tool", () => {
    const tools = createMCPTools("mcp", () => undefined);

    expect(tools.map((tool) => tool.name)).toEqual(["chat"]);
    expect(tools[0]?.visibility).toBe("public");
    expect(tools[0]?.sideEffects).toBe("writes");
  });

  it("routes chat through the shared agent entrypoint with MCP context", async () => {
    const agentService = createAgentService();
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [chatTool] = createMCPTools("mcp", () => context);

    if (!chatTool) {
      throw new Error("Expected chat tool");
    }

    const response = await chatTool.handler(
      { message: "Save this note", conversationId: "client-conversation" },
      {
        interfaceType: "mcp",
        userId: "operator-1",
        conversationId: "session-conversation",
        channelId: "session-1",
        channelName: "MCP Session",
        userPermissionLevel: "anchor",
      },
    );

    expect(response).toEqual({
      success: true,
      data: { text: "Agent response" },
    });
    expect(agentService.chat).toHaveBeenCalledWith(
      "Save this note",
      "client-conversation",
      {
        userPermissionLevel: "anchor",
        interfaceType: "mcp",
        channelId: "session-1",
        channelName: "MCP Session",
        actor: {
          actorId: "operator-1",
          interfaceType: "mcp",
          role: "user",
        },
      },
    );
  });

  it("defaults chat conversation id to MCP session context", async () => {
    const agentService = createAgentService();
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [chatTool] = createMCPTools("mcp", () => context);

    if (!chatTool) {
      throw new Error("Expected chat tool");
    }

    await chatTool.handler(
      { message: "Continue" },
      {
        interfaceType: "mcp",
        userId: "operator-1",
        conversationId: "session-conversation",
        userPermissionLevel: "trusted",
      },
    );

    expect(agentService.chat).toHaveBeenCalledWith(
      "Continue",
      "session-conversation",
      expect.objectContaining({ userPermissionLevel: "trusted" }),
    );
  });

  it("maps pending confirmations to MCP confirmation responses", async () => {
    const agentService: AgentService = {
      ...createAgentService(),
      chat: mock(async () => ({
        text: "Confirmation required.",
        pendingConfirmations: [
          {
            id: "approval-1",
            toolCallId: "call-1",
            toolName: "system_create",
            summary: "Create note?",
            args: { entityType: "base", title: "Note" },
          },
        ],
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      })),
    };
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [chatTool] = createMCPTools("mcp", () => context);

    if (!chatTool) {
      throw new Error("Expected chat tool");
    }

    const response = await chatTool.handler(
      { message: "Save note" },
      { interfaceType: "mcp", userId: "operator-1" },
    );

    expect(response).toEqual({
      needsConfirmation: true,
      toolName: "system_create",
      summary: "Create note?",
      args: {
        approvalId: "approval-1",
        toolCallId: "call-1",
        originalArgs: { entityType: "base", title: "Note" },
      },
    });
  });
});
