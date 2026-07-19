import { describe, expect, it, mock } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import { createInterfacePluginContext } from "@brains/plugins/test";
import {
  createMockShell,
  createSilentLogger,
  type MockShellOptions,
} from "@brains/test-utils";
import { createMCPTools } from "../src/tools";

type AgentService = NonNullable<MockShellOptions["agentService"]>;

function externalToolContext(userId: string): {
  interfaceType: "mcp";
  actor: { kind: "external"; externalActorId: string };
} {
  return {
    interfaceType: "mcp",
    actor: {
      kind: "external",
      externalActorId: createExternalActorId("mcp", userId),
    },
  };
}

function createAgentService(conversationIds?: string[]): AgentService {
  return {
    chat: mock(async (_message, conversationId) => {
      conversationIds?.push(conversationId);
      return {
        text: "Agent response",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      };
    }),
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

    expect(tools.map((tool) => tool.name)).toEqual(["chat", "confirm"]);
    expect(tools[0]?.visibility).toBe("public");
    expect(tools[0]?.sideEffects).toBe("writes");
    expect(tools[1]?.visibility).toBe("public");
    expect(tools[1]?.sideEffects).toBe("writes");
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
        actor: {
          kind: "user",
          userId: "operator-1",
          canonicalId: "user:operator-1",
        },
        displayName: "Mira",
        conversationId: "session-conversation",
        channelId: "session-1",
        channelName: "MCP Session",
        userPermissionLevel: "admin",
        isAnchor: true,
      },
    );

    expect(response).toEqual({
      success: true,
      data: {
        text: "Agent response",
        conversationId: "client-conversation",
      },
    });
    expect(agentService.chat).toHaveBeenCalledWith(
      "Save this note",
      expect.stringMatching(/^mcp:[a-f0-9]{16}:client-conversation$/),
      {
        userPermissionLevel: "admin",
        isAnchor: true,
        interfaceType: "mcp",
        channelId: "session-1",
        channelName: "MCP Session",
        actor: {
          identity: {
            kind: "user",
            userId: "operator-1",
            canonicalId: "user:operator-1",
          },
          interfaceType: "mcp",
          role: "user",
          displayName: "Mira",
        },
      },
    );
  });

  it("scopes MCP session conversation ids to the verified caller", async () => {
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
        ...externalToolContext("operator-1"),
        conversationId: "session-conversation",
        userPermissionLevel: "trusted",
      },
    );

    expect(agentService.chat).toHaveBeenCalledWith(
      "Continue",
      expect.stringMatching(/^mcp:[a-f0-9]{16}:session-conversation$/),
      expect.objectContaining({ userPermissionLevel: "trusted" }),
    );
  });

  it("creates an isolated conversation when the caller omits one", async () => {
    const conversationIds: string[] = [];
    const agentService = createAgentService(conversationIds);
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [chatTool] = createMCPTools("mcp", () => context);
    if (!chatTool) throw new Error("Expected chat tool");

    const first = await chatTool.handler(
      { message: "First" },
      externalToolContext("operator-1"),
    );
    const second = await chatTool.handler(
      { message: "Second" },
      externalToolContext("operator-1"),
    );

    const firstConversation = (first as { data: { conversationId: string } })
      .data.conversationId;
    const secondConversation = (second as { data: { conversationId: string } })
      .data.conversationId;
    expect(firstConversation).toStartWith("conversation-");
    expect(secondConversation).toStartWith("conversation-");
    expect(secondConversation).not.toBe(firstConversation);
    expect(conversationIds[0]).not.toBe(conversationIds[1]);
  });

  it("partitions the same conversation handle by caller", async () => {
    const conversationIds: string[] = [];
    const agentService = createAgentService(conversationIds);
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [chatTool] = createMCPTools("mcp", () => context);
    if (!chatTool) throw new Error("Expected chat tool");

    for (const userId of ["operator-1", "operator-2"]) {
      await chatTool.handler(
        { message: "Continue", conversationId: "shared-handle" },
        externalToolContext(userId),
      );
    }

    expect(conversationIds[0]).not.toBe(conversationIds[1]);
  });

  it("surfaces tool results and read-your-writes handles", async () => {
    const toolResults = [
      {
        toolName: "system_create",
        args: { entityType: "note", title: "Note" },
        data: { entityId: "note-1", status: "queued", jobId: "job-1" },
      },
      {
        toolName: "system_update",
        args: { type: "note" },
        jobId: "job-2",
        data: { id: "note-2" },
      },
    ];
    const agentService: AgentService = {
      ...createAgentService(),
      chat: mock(async () => ({
        text: "Created note.",
        toolResults,
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
      externalToolContext("operator-1"),
    );

    expect(response).toEqual({
      success: true,
      data: {
        text: "Created note.",
        conversationId: expect.stringMatching(/^conversation-/),
        toolResults,
        readYourWrites: [
          {
            toolName: "system_create",
            entityType: "note",
            entityId: "note-1",
            jobId: "job-1",
          },
          {
            toolName: "system_update",
            entityType: "note",
            entityId: "note-2",
            jobId: "job-2",
          },
        ],
      },
    });
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
      externalToolContext("operator-1"),
    );

    expect(response).toEqual({
      needsConfirmation: true,
      toolName: "system_create",
      summary: "Create note?",
      args: {
        approvalId: "approval-1",
        conversationId: expect.stringMatching(/^conversation-/),
        toolCallId: "call-1",
        originalArgs: { entityType: "base", title: "Note" },
      },
    });
  });

  it("resolves pending confirmations through the shared agent entrypoint", async () => {
    const agentService = createAgentService();
    const shell = createMockShell({
      logger: createSilentLogger("mcp-tools-test"),
      agentService,
    });
    const context = createInterfacePluginContext(shell, "mcp");
    const [, confirmTool] = createMCPTools("mcp", () => context);

    if (!confirmTool) {
      throw new Error("Expected confirm tool");
    }

    const response = await confirmTool.handler(
      {
        approvalId: "approval-1",
        confirmed: true,
        conversationId: "client-conversation",
      },
      {
        ...externalToolContext("operator-1"),
        conversationId: "session-conversation",
        channelId: "session-1",
        channelName: "MCP Session",
        userPermissionLevel: "admin",
      },
    );

    expect(response).toEqual({
      success: true,
      data: {
        text: "Confirmed",
        conversationId: "client-conversation",
      },
    });
    expect(agentService.confirmPendingAction).toHaveBeenCalledWith(
      expect.stringMatching(/^mcp:[a-f0-9]{16}:client-conversation$/),
      true,
      "approval-1",
      {
        userPermissionLevel: "admin",
        isAnchor: false,
        interfaceType: "mcp",
        channelId: "session-1",
        channelName: "MCP Session",
        actor: {
          identity: {
            kind: "external",
            externalActorId: createExternalActorId("mcp", "operator-1"),
          },
          interfaceType: "mcp",
          role: "user",
        },
      },
    );
  });
});
