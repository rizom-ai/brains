import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AgentService } from "../src/agent-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import type { IMCPService, PluginTool } from "@brains/mcp-service";
import type { IdentityService as IIdentityService } from "@brains/identity-service";
import type { IConversationService } from "@brains/conversation-service";
import type { BrainAgent, BrainAgentResult } from "../src/types";
import type { BrainAgentConfig, BrainCallOptions } from "../src/brain-agent";
import type { ModelMessage } from "@brains/ai-service";

// Mock return value for agent.generate
let mockAgentGenerateResult: BrainAgentResult = {
  text: "I found some results for you.",
  steps: [],
  usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
};

// Mock the agent's generate function
const mockGenerate = mock(
  async (_params: { messages: ModelMessage[]; options: BrainCallOptions }) =>
    mockAgentGenerateResult,
);

// Mock agent factory - returns a mock agent with generate
const mockAgent: BrainAgent = { generate: mockGenerate };
const mockAgentFactory = mock(
  (_config: BrainAgentConfig): BrainAgent => mockAgent,
);

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

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: "user", content: "Search for notes" },
          ]),
        }),
      );
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

      const callArgs = mockGenerate.mock.calls[0]?.[0];
      const messages = callArgs?.messages ?? [];

      // Should include history plus new message
      expect(messages.length).toBe(3);
      expect(messages[0]).toEqual(
        expect.objectContaining({ content: "Previous message" }),
      );
      expect(messages[2]).toEqual(
        expect.objectContaining({ content: "New message" }),
      );
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
          success: true as const,
          data: { results: [] },
          message: "No results",
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
      const createCallArgs = mockAgentFactory.mock.calls[0]?.[0];
      const tools = createCallArgs?.tools ?? [];
      expect(tools.length).toBe(1);
      expect(tools[0]?.name).toBe("search");
    });
  });

  describe("permission-based tool filtering", () => {
    it("should filter tools based on userPermissionLevel", async () => {
      const publicTool: PluginTool = {
        name: "public_search",
        description: "Public search tool",
        inputSchema: { query: z.string() },
        visibility: "public",
        handler: mock(async () => ({ success: true as const, data: {} })),
      };

      const anchorTool: PluginTool = {
        name: "admin_delete",
        description: "Admin delete tool",
        inputSchema: { id: z.string() },
        visibility: "anchor",
        handler: mock(async () => ({ success: true as const, data: {} })),
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
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            userPermissionLevel: "public",
          }),
        }),
      );
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

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            userPermissionLevel: "public",
          }),
        }),
      );
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

      expect(mockAgentFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          identity: expect.objectContaining({ name: "Test Brain" }),
        }),
      );
    });
  });

  describe("toolResults in response", () => {
    it("should include tool results in response when agent calls tools", async () => {
      // Mock agent to return tool calls with data output
      mockAgentGenerateResult = {
        text: "I found some notes for you.",
        steps: [
          {
            toolCalls: [
              {
                toolName: "search",
                toolCallId: "call1",
                input: { query: "typescript" },
              },
            ],
            toolResults: [
              {
                toolName: "search",
                toolCallId: "call1",
                output: {
                  success: true,
                  data: { results: ["note1", "note2"] },
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
      expect(response.toolResults?.[0]?.data).toEqual({
        results: ["note1", "note2"],
      });
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
                input: { query: "typescript" },
              },
            ],
            toolResults: [
              {
                toolName: "search",
                toolCallId: "call1",
                output: { success: true, data: { results: ["note1"] } },
              },
            ],
          },
          {
            toolCalls: [
              {
                toolName: "get_note",
                toolCallId: "call2",
                input: { id: "note1" },
              },
            ],
            toolResults: [
              {
                toolName: "get_note",
                toolCallId: "call2",
                output: {
                  success: true,
                  data: {
                    title: "TypeScript Guide",
                    content: "Content here...",
                  },
                },
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
      expect(response.toolResults?.[0]?.data).toBeDefined();
      expect(response.toolResults?.[1]?.toolName).toBe("get_note");
      expect(response.toolResults?.[1]?.data).toBeDefined();
    });
  });
});
