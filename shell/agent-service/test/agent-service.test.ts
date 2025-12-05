import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AgentService } from "../src/agent-service";
import { createSilentLogger } from "@brains/utils";
import { z } from "@brains/utils";
import type {
  IAIService,
  AITool,
  GenerateWithToolsOptions,
  GenerateWithToolsResult,
} from "@brains/ai-service";
import type { IMCPService, PluginTool } from "@brains/mcp-service";
import type { IdentityService as IIdentityService } from "@brains/identity-service";
import type { IConversationService } from "@brains/conversation-service";

// Mock AIService
const createMockAIService = (): IAIService => ({
  generateText: mock(() =>
    Promise.resolve({
      text: "Generated text",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
  ),
  generateObject: mock(() =>
    Promise.resolve({
      object: {},
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
  ),
  generateWithTools: mock(
    (_options: GenerateWithToolsOptions): Promise<GenerateWithToolsResult> =>
      Promise.resolve({
        text: "I found some results for you.",
        toolCalls: [],
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      }),
  ),
  updateConfig: mock(() => {}),
  getConfig: mock(() => ({ model: "claude-3-5-haiku-latest" })),
});

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
  let mockAIService: IAIService;
  let mockMCPService: IMCPService;
  let mockIdentityService: Partial<IIdentityService>;
  let mockConversationService: Partial<IConversationService>;

  beforeEach(() => {
    AgentService.resetInstance();
    logger = createSilentLogger();
    mockAIService = createMockAIService();
    mockMCPService = createMockMCPService();
    mockIdentityService = createMockIdentityService();
    mockConversationService = createMockConversationService();
  });

  afterEach(() => {
    AgentService.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = AgentService.getInstance(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );
      const instance2 = AgentService.getInstance(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = AgentService.getInstance(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      AgentService.resetInstance();

      const instance2 = AgentService.getInstance(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance without affecting singleton", () => {
      const singleton = AgentService.getInstance(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );
      const fresh = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      expect(fresh).not.toBe(singleton);
      expect(
        AgentService.getInstance(
          mockAIService,
          mockMCPService,
          mockConversationService as IConversationService,
          mockIdentityService as IIdentityService,
          logger,
        ),
      ).toBe(singleton);
    });
  });

  describe("chat", () => {
    it("should send message to AI and return response", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      const response = await service.chat(
        "Hello, how are you?",
        "test-conversation",
      );

      expect(response.text).toBe("I found some results for you.");
      expect(response.usage.totalTokens).toBe(150);
      expect(response.pendingConfirmation).toBeUndefined();
      expect(mockAIService.generateWithTools).toHaveBeenCalled();
    });

    it("should include identity in system prompt", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Hello", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      expect(call.system).toContain("Test Brain");
    });

    it("should include user message in messages array", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Search for notes", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
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
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("New message", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;

      // Should include history plus new message
      expect(call.messages.length).toBe(3);
      expect(call.messages[0]?.content).toBe("Previous message");
      expect(call.messages[2]?.content).toBe("New message");
    });

    it("should save messages to ConversationService", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Hello", "test-conversation");

      // Should save user message and assistant response
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("tools integration", () => {
    it("should pass MCP tools to AI service", async () => {
      const searchTool: PluginTool = {
        name: "search",
        description: "Search for content",
        inputSchema: { query: z.string() },
        handler: mock(async () => ({ status: "ok", data: { results: [] } })),
      };

      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test-plugin", tool: searchTool },
      ]);

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Search for something", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      expect(call.tools.length).toBe(1);
      expect(call.tools[0]?.name).toBe("search");
    });

    it("should convert MCP tool schema to AI tool format", async () => {
      const noteTool: PluginTool = {
        name: "create_note",
        description: "Create a new note",
        inputSchema: {
          title: z.string(),
          content: z.string(),
        },
        handler: mock(async () => ({ status: "ok" })),
      };

      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "notes", tool: noteTool },
      ]);

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Create a note", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      const tool = call.tools[0] as AITool;

      expect(tool.name).toBe("create_note");
      expect(tool.description).toBe("Create a new note");
      expect(tool.execute).toBeDefined();
    });

    it("should execute tool handler when AI calls tool", async () => {
      const searchHandler = mock(async () => ({
        status: "ok",
        data: { results: ["note1", "note2"] },
      }));

      const searchTool: PluginTool = {
        name: "search",
        description: "Search for content",
        inputSchema: { query: z.string() },
        handler: searchHandler,
      };

      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test-plugin", tool: searchTool },
      ]);

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Search for typescript", "test-conversation");

      // Get the converted tools and call execute
      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      const tool = call.tools[0] as AITool;

      // Simulate AI calling the tool
      await tool.execute({ query: "typescript" });

      expect(searchHandler).toHaveBeenCalled();
    });
  });

  describe("permission-based tool filtering", () => {
    it("should filter tools based on userPermissionLevel", async () => {
      const publicTool: PluginTool = {
        name: "public_search",
        description: "Public search tool",
        inputSchema: { query: z.string() },
        visibility: "public",
        handler: mock(async () => ({ status: "ok" })),
      };

      const anchorTool: PluginTool = {
        name: "admin_delete",
        description: "Admin delete tool",
        inputSchema: { id: z.string() },
        visibility: "anchor",
        handler: mock(async () => ({ status: "ok" })),
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
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      // Chat as public user - should only see public tool
      await service.chat("Search for something", "test-conversation", {
        userPermissionLevel: "public",
      });

      expect(mockMCPService.listToolsForPermissionLevel).toHaveBeenCalledWith(
        "public",
      );

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      expect(call.tools.length).toBe(1);
      expect(call.tools[0]?.name).toBe("public_search");
    });

    it("should provide all tools for anchor users", async () => {
      const publicTool: PluginTool = {
        name: "public_search",
        description: "Public search tool",
        inputSchema: { query: z.string() },
        visibility: "public",
        handler: mock(async () => ({ status: "ok" })),
      };

      const anchorTool: PluginTool = {
        name: "admin_delete",
        description: "Admin delete tool",
        inputSchema: { id: z.string() },
        visibility: "anchor",
        handler: mock(async () => ({ status: "ok" })),
      };

      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: publicTool },
        { pluginId: "test", tool: anchorTool },
      ]);

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      // Chat as anchor user - should see all tools
      await service.chat("Delete something", "test-conversation", {
        userPermissionLevel: "anchor",
      });

      expect(mockMCPService.listToolsForPermissionLevel).toHaveBeenCalledWith(
        "anchor",
      );

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;
      expect(call.tools.length).toBe(2);
    });

    it("should default to public permission level if not specified", async () => {
      mockMCPService.listToolsForPermissionLevel = mock(() => []);

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Hello", "test-conversation");

      // Should default to public for safety
      expect(mockMCPService.listToolsForPermissionLevel).toHaveBeenCalledWith(
        "public",
      );
    });
  });

  describe("error handling", () => {
    it("should handle AI service errors gracefully", async () => {
      mockAIService.generateWithTools = mock(() =>
        Promise.reject(new Error("AI service error")),
      );

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      void expect(service.chat("Hello", "test-conversation")).rejects.toThrow();
    });

    it("should handle empty response from AI", async () => {
      mockAIService.generateWithTools = mock(() =>
        Promise.resolve({
          text: "",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        }),
      );

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      const response = await service.chat("Hello", "test-conversation");
      expect(response.text).toBe("");
    });
  });

  describe("confirmation flow", () => {
    it("should track pending confirmation for destructive operations", async () => {
      // This test verifies the confirmation flow works
      // The actual detection of destructive operations happens via system prompt
      // and the AI deciding to ask for confirmation
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
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
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
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
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
      );

      expect(response.text).toContain("No pending");
    });
  });

  describe("system prompt", () => {
    it("should include agent instructions in system prompt", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Hello", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;

      expect(call.system).toContain("Tool");
      expect(call.system).toContain("Destructive");
    });

    it("should include brain identity in system prompt", async () => {
      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      await service.chat("Hello", "test-conversation");

      const call = (mockAIService.generateWithTools as ReturnType<typeof mock>)
        .mock.calls[0]?.[0] as GenerateWithToolsOptions;

      // Should include identity content
      expect(call.system).toContain("Test Brain");
    });
  });

  describe("toolResults in response", () => {
    it("should include tool results in response when AI calls tools", async () => {
      // Mock AI service to return tool calls with formatted output
      mockAIService.generateWithTools = mock(() =>
        Promise.resolve({
          text: "I found some notes for you.",
          toolCalls: [
            {
              name: "search",
              args: { query: "typescript" },
              result: {
                status: "ok",
                data: { results: ["note1", "note2"] },
                formatted: "- note1\n- note2",
              },
            },
          ],
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        }),
      );

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
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
      mockAIService.generateWithTools = mock(() =>
        Promise.resolve({
          text: "Hello! How can I help you?",
          toolCalls: [],
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        }),
      );

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
      );

      const response = await service.chat("Hello", "test-conversation");

      expect(response.toolResults).toBeDefined();
      expect(response.toolResults?.length).toBe(0);
    });

    it("should include multiple tool results when AI calls multiple tools", async () => {
      mockAIService.generateWithTools = mock(() =>
        Promise.resolve({
          text: "Here's what I found.",
          toolCalls: [
            {
              name: "search",
              args: { query: "typescript" },
              result: { formatted: "## Search Results\n- note1" },
            },
            {
              name: "get_note",
              args: { id: "note1" },
              result: { formatted: "## TypeScript Guide\n\nContent here..." },
            },
          ],
          usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
        }),
      );

      const service = AgentService.createFresh(
        mockAIService,
        mockMCPService,
        mockConversationService as IConversationService,
        mockIdentityService as IIdentityService,
        logger,
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
