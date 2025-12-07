import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AgentService } from "../src/agent-service";
import { createSilentLogger } from "@brains/utils";
import { z } from "@brains/utils";
import type { IMCPService, PluginTool } from "@brains/mcp-service";
import type { IdentityService as IIdentityService } from "@brains/identity-service";
import type { IConversationService } from "@brains/conversation-service";
// Mock return value for agent.generate
let mockAgentGenerateResult = {
  text: "I found some results for you.",
  steps: [] as {
    toolCalls?: { toolName: string; toolCallId: string; args: unknown }[];
    toolResults?: { toolName: string; toolCallId: string; output: unknown }[];
  }[],
  usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
};

// Mock the agent's generate function
const mockGenerate = mock(async () => mockAgentGenerateResult);

// Mock agent factory - returns a mock agent with generate
const mockAgentFactory = mock(() => ({
  generate: mockGenerate,
}));

// Mock MCPService
const createMockMCPService = (): IMCPService => ({
  listTools: mock(() => []),
  listToolsForPermissionLevel: mock(() => []),
  listResources: mock(() => []),
  registerTool: mock(() => {}),
  registerResource: mock(() => {}),
  getMcpServer: mock(() => ({}) as ReturnType<IMCPService["getMcpServer"]>),
  setPermissionLevel: mock(() => {}),
});

// Mock IdentityService
const createMockIdentityService = (): Partial<IIdentityService> => ({
  getIdentity: mock(() => ({
    name: "Test Brain",
    role: "Test assistant",
    purpose: "Help with testing",
    values: ["accuracy", "helpfulness"],
  })),
  getIdentityContent: mock(() => "# Test Brain\n\nA test assistant."),
});

// Mock ConversationService
const createMockConversationService = (): Partial<IConversationService> => ({
  startConversation: mock(() => Promise.resolve("test-conversation-id")),
  addMessage: mock(() => Promise.resolve()),
  getMessages: mock(() => Promise.resolve([])),
  getConversation: mock(() => Promise.resolve(null)),
  searchConversations: mock(() => Promise.resolve([])),
});

describe("AgentService", () => {
  let logger: ReturnType<typeof createSilentLogger>;
  let mockMCPService: IMCPService;
  let mockIdentityService: Partial<IIdentityService>;
  let mockConversationService: Partial<IConversationService>;

  beforeEach(() => {
    AgentService.resetInstance();
    logger = createSilentLogger();
    mockMCPService = createMockMCPService();
    mockIdentityService = createMockIdentityService();
    mockConversationService = createMockConversationService();

    // Reset mock generate result and call count
    mockAgentGenerateResult = {
      text: "I found some results for you.",
      steps: [],
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
    };
    mockGenerate.mockClear();
    mockAgentFactory.mockClear();
  });

  afterEach(() => {
    AgentService.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      const instance2 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      AgentService.resetInstance();

      const instance2 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance without affecting singleton", () => {
      const singleton = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      const fresh = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      expect(fresh).not.toBe(singleton);
      expect(
        AgentService.getInstance(
          mockMCPService,
          mockConversationService as IConversationService,
          mockIdentityService as IIdentityService,
          logger,
          { agentFactory: mockAgentFactory },
        ),
      ).toBe(singleton);
    });
  });

  describe("chat", () => {
    it("should send message to agent and return response", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Hello, how are you?",
        "test-conversation",
      );

      expect(response.text).toBe("I found some results for you.");
      expect(response.usage.totalTokens).toBe(150);
      expect(response.pendingConfirmation).toBeUndefined();
      expect(mockGenerate).toHaveBeenCalled();
    });

    it("should include user message in messages array", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Search for notes", "test-conversation");

      const call = mockGenerate.mock.calls[0]?.[0] as {
        messages: { role: string; content: string }[];
      };
      expect(call.messages).toContainEqual({
        role: "user",
        content: "Search for notes",
      });
    });

    it("should load conversation history from ConversationService", async () => {
      // Mock existing messages in conversation
      mockConversationService.getMessages = mock(() =>
        Promise.resolve([
          {
            id: "msg1",
            conversationId: "test-conversation",
            role: "user",
            content: "Previous message",
            timestamp: new Date().toISOString(),
            metadata: null,
          },
          {
            id: "msg2",
            conversationId: "test-conversation",
            role: "assistant",
            content: "Previous response",
            timestamp: new Date().toISOString(),
            metadata: null,
          },
        ]),
      );

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("New message", "test-conversation");

      const call = mockGenerate.mock.calls[0]?.[0] as {
        messages: { role: string; content: string }[];
      };

      // Should include history plus new message
      expect(call.messages.length).toBe(3);
      expect(call.messages[0]?.content).toBe("Previous message");
      expect(call.messages[2]?.content).toBe("New message");
    });

    it("should save messages to ConversationService", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      // Should save user message and assistant response
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("tools integration", () => {
    it("should create agent with MCP tools", async () => {
      const searchTool: PluginTool = {
        name: "search",
        description: "Search for content",
        inputSchema: { query: z.string() },
        handler: mock(async () => ({
          status: "ok",
          data: { results: [] },
          formatted: "No results",
        })),
      };

      mockMCPService.listTools = mock(() => [
        { pluginId: "test-plugin", tool: searchTool },
      ]);
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test-plugin", tool: searchTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Search for something", "test-conversation");

      // Verify agentFactory was called with tools
      const createCall = mockAgentFactory.mock.calls[0]?.[0] as {
        tools: PluginTool[];
      };
      expect(createCall.tools.length).toBe(1);
      expect(createCall.tools[0]?.name).toBe("search");
    });
  });

  describe("permission-based tool filtering", () => {
    it("should filter tools based on userPermissionLevel", async () => {
      const publicTool: PluginTool = {
        name: "public_search",
        description: "Public search tool",
        inputSchema: { query: z.string() },
        visibility: "public",
        handler: mock(async () => ({ status: "ok", formatted: "ok" })),
      };

      const anchorTool: PluginTool = {
        name: "admin_delete",
        description: "Admin delete tool",
        inputSchema: { id: z.string() },
        visibility: "anchor",
        handler: mock(async () => ({ status: "ok", formatted: "ok" })),
      };

      // Mock listToolsForPermissionLevel to return filtered tools
      mockMCPService.listToolsForPermissionLevel = mock((level: string) => {
        if (level === "public") {
          return [{ pluginId: "test", tool: publicTool }];
        }
        return [
          { pluginId: "test", tool: publicTool },
          { pluginId: "test", tool: anchorTool },
        ];
      });

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      // Chat as public user
      await service.chat("Search for something", "test-conversation", {
        userPermissionLevel: "public",
      });

      // Verify options passed to agent.generate
      const call = mockGenerate.mock.calls[0]?.[0] as {
        options: { userPermissionLevel: string };
      };
      expect(call.options.userPermissionLevel).toBe("public");
    });

    it("should default to public permission level if not specified", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      const call = mockGenerate.mock.calls[0]?.[0] as {
        options: { userPermissionLevel: string };
      };
      expect(call.options.userPermissionLevel).toBe("public");
    });
  });

  describe("error handling", () => {
    it("should handle agent errors gracefully", async () => {
      mockGenerate.mockImplementationOnce(() =>
        Promise.reject(new Error("Agent error")),
      );

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      void expect(service.chat("Hello", "test-conversation")).rejects.toThrow();
    });

    it("should handle empty response from agent", async () => {
      mockAgentGenerateResult = {
        text: "",
        steps: [],
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat("Hello", "test-conversation");
      expect(response.text).toBe("");
    });
  });

  describe("confirmation flow", () => {
    it("should track pending confirmation for destructive operations", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      // Store a pending confirmation
      service.setPendingConfirmation("test-conversation", {
        toolName: "delete_note",
        description: "Delete note 'Meeting Notes'?",
        args: { noteId: "123" },
      });

      // Confirm the action
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
      );

      expect(response.text).toBeDefined();
    });

    it("should cancel pending confirmation when user declines", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      service.setPendingConfirmation("test-conversation", {
        toolName: "delete_note",
        description: "Delete note 'Meeting Notes'?",
        args: { noteId: "123" },
      });

      const response = await service.confirmPendingAction(
        "test-conversation",
        false,
      );

      expect(response.text).toContain("cancelled");
    });

    it("should return error when confirming without pending action", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
      );

      expect(response.text).toContain("No pending");
    });
  });

  describe("agent creation", () => {
    it("should create agent with identity from IdentityService", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      const createCall = mockAgentFactory.mock.calls[0]?.[0] as {
        identity: { name: string };
      };

      expect(createCall.identity.name).toBe("Test Brain");
    });
  });

  describe("toolResults in response", () => {
    it("should include tool results in response when agent calls tools", async () => {
      // Mock agent to return tool calls with formatted output
      mockAgentGenerateResult = {
        text: "I found some notes for you.",
        steps: [
          {
            toolCalls: [
              {
                toolName: "search",
                toolCallId: "call1",
                args: { query: "typescript" },
              },
            ],
            toolResults: [
              {
                toolName: "search",
                toolCallId: "call1",
                output: {
                  status: "ok",
                  data: { results: ["note1", "note2"] },
                  formatted: "- note1\n- note2",
                },
              },
            ],
          },
        ],
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Search for typescript",
        "test-conversation",
      );

      expect(response.toolResults).toBeDefined();
      expect(response.toolResults?.length).toBe(1);
      expect(response.toolResults?.[0]?.toolName).toBe("search");
      expect(response.toolResults?.[0]?.formatted).toBe("- note1\n- note2");
    });

    it("should return empty toolResults array when no tools are called", async () => {
      mockAgentGenerateResult = {
        text: "Hello! How can I help you?",
        steps: [],
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat("Hello", "test-conversation");

      expect(response.toolResults).toBeDefined();
      expect(response.toolResults?.length).toBe(0);
    });

    it("should include multiple tool results when agent calls multiple tools", async () => {
      mockAgentGenerateResult = {
        text: "Here's what I found.",
        steps: [
          {
            toolCalls: [
              {
                toolName: "search",
                toolCallId: "call1",
                args: { query: "typescript" },
              },
            ],
            toolResults: [
              {
                toolName: "search",
                toolCallId: "call1",
                output: { formatted: "## Search Results\n- note1" },
              },
            ],
          },
          {
            toolCalls: [
              {
                toolName: "get_note",
                toolCallId: "call2",
                args: { id: "note1" },
              },
            ],
            toolResults: [
              {
                toolName: "get_note",
                toolCallId: "call2",
                output: { formatted: "## TypeScript Guide\n\nContent here..." },
              },
            ],
          },
        ],
        usage: { inputTokens: 100, outputTokens: 150, totalTokens: 250 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Find typescript notes and show me the first one",
        "test-conversation",
      );

      expect(response.toolResults?.length).toBe(2);
      expect(response.toolResults?.[0]?.toolName).toBe("search");
      expect(response.toolResults?.[0]?.formatted).toContain("Search Results");
      expect(response.toolResults?.[1]?.toolName).toBe("get_note");
      expect(response.toolResults?.[1]?.formatted).toContain(
        "TypeScript Guide",
      );
    });
  });
});
