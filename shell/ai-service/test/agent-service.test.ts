import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { AgentService } from "../src/agent-service";
import { createMockMCPService, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import { MCPService, type IMCPService, type Tool } from "@brains/mcp-service";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
  AnchorProfile,
} from "@brains/identity-service";
import type {
  ConversationMessageActor,
  IConversationService,
} from "@brains/conversation-service";
import type { BrainAgent, BrainAgentResult } from "../src/agent-types";
import type { BrainAgentConfig, BrainCallOptions } from "../src/brain-agent";
import type { ModelMessage } from "ai";

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

function expectNoSystemMessages(messages: ModelMessage[]): void {
  expect(messages.some((message) => message.role === "system")).toBe(false);
}

// Mock BrainCharacterService
const createMockCharacterService = (): IBrainCharacterService => ({
  getCharacter: mock(() => ({
    name: "Test Brain",
    role: "Test assistant",
    purpose: "Help with testing",
    values: ["accuracy", "helpfulness"],
  })),
});

// Mock ConversationService
const createMockConversationService = (): IConversationService => ({
  startConversation: mock(() => Promise.resolve("test-conversation-id")),
  addMessage: mock(() => Promise.resolve()),
  getMessages: mock(() => Promise.resolve([])),
  countMessages: mock(() => Promise.resolve(0)),
  getConversation: mock(() => Promise.resolve(null)),
  listConversations: mock(() => Promise.resolve([])),
  searchConversations: mock(() => Promise.resolve([])),
  updateConversationMetadata: mock(() => Promise.resolve(false)),
  deleteConversation: mock(() => Promise.resolve(false)),
  close: mock(() => {}),
});

describe("AgentService", () => {
  let logger: ReturnType<typeof createSilentLogger>;
  let mockMCPService: IMCPService;
  let mockCharacterService: IBrainCharacterService;
  let mockProfileService: IAnchorProfileService;
  let mockConversationService: IConversationService;

  beforeEach(() => {
    AgentService.resetInstance();
    logger = createSilentLogger();
    mockMCPService = createMockMCPService();
    mockCharacterService = createMockCharacterService();
    mockProfileService = {
      getProfile: (): AnchorProfile => ({
        name: "Test Anchor",
        kind: "professional" as const,
        description: "Test",
      }),
    };
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
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      const instance2 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      AgentService.resetInstance();

      const instance2 = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance without affecting singleton", () => {
      const singleton = AgentService.getInstance(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      const fresh = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      expect(fresh).not.toBe(singleton);
      expect(
        AgentService.getInstance(
          mockMCPService,
          mockConversationService as IConversationService,
          mockCharacterService,
          mockProfileService,
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
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Hello, how are you?",
        "test-conversation",
      );

      expect(response.text).toBe("I found some results for you.");
      expect(response.usage.totalTokens).toBe(150);
      expect(response.pendingConfirmations).toBeUndefined();
      expect(response.cards).toBeUndefined();
      expect(mockGenerate).toHaveBeenCalled();
    });

    it("should include user message in messages array", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
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
        mockCharacterService,
        mockProfileService,
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

    it("injects stored entity memory metadata into the model turn without polluting visible history text", async () => {
      const entityMemoryNote =
        '\n\n[Entities affected this turn: image "wild-robot" (generating). Reference these IDs directly in follow-ups instead of searching for them.]';
      mockConversationService.getMessages = mock(() =>
        Promise.resolve([
          {
            id: "msg1",
            conversationId: "test-conversation",
            role: "assistant",
            content: "Queued image generation.",
            timestamp: new Date().toISOString(),
            metadata: JSON.stringify({ entityMemoryNote }),
          },
        ]),
      );

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Use that image", "test-conversation");

      const callArgs = mockGenerate.mock.calls[0]?.[0];
      expect(callArgs?.messages[0]).toEqual({
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Queued image generation.${entityMemoryNote}`,
          },
        ],
      });
    });

    it("adds native file attachments to the current model turn without mutating stored user text", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );
      const imageBytes = new Uint8Array([137, 80, 78, 71]);

      await service.chat("Describe this image", "test-conversation", {
        attachments: [
          {
            kind: "file",
            filename: "robot.png",
            mediaType: "image/png",
            data: imageBytes,
            sizeBytes: imageBytes.byteLength,
            source: { kind: "web-chat-upload", id: "upload-123" },
          },
        ],
      });

      const callArgs = mockGenerate.mock.calls[0]?.[0];
      const messages = callArgs?.messages ?? [];
      expect(messages.at(-1)).toEqual({
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          {
            type: "file",
            data: imageBytes,
            mediaType: "image/png",
            filename: "robot.png",
          },
        ],
      });
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          role: "user",
          content: "Describe this image",
          metadata: expect.objectContaining({
            attachments: [
              {
                kind: "file",
                filename: "robot.png",
                mediaType: "image/png",
                sizeBytes: imageBytes.byteLength,
                source: { kind: "web-chat-upload", id: "upload-123" },
              },
            ],
          }),
        }),
      );
    });

    it("adds native text attachments to the current model turn without mutating the stored user text", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Summarize this", "test-conversation", {
        attachments: [
          {
            kind: "text",
            filename: "durable-notes.md",
            mediaType: "text/markdown",
            content: "# Durable Notes",
            sizeBytes: 16,
            source: { kind: "web-chat-upload", id: "upload-123" },
          },
        ],
      });

      const callArgs = mockGenerate.mock.calls[0]?.[0];
      const messages = callArgs?.messages ?? [];
      expect(messages.at(-1)).toEqual({
        role: "user",
        content:
          'Summarize this\n\nUser uploaded a file "durable-notes.md":\n\n# Durable Notes',
      });
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          role: "user",
          content: "Summarize this",
          metadata: expect.objectContaining({
            attachments: [
              {
                kind: "text",
                filename: "durable-notes.md",
                mediaType: "text/markdown",
                sizeBytes: 16,
                source: { kind: "web-chat-upload", id: "upload-123" },
              },
            ],
          }),
        }),
      );
    });

    it("should save messages to ConversationService", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      // Should save user message and assistant response
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
    });

    it("should persist chat actor and source metadata on conversation messages", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello from Mira", "test-conversation", {
        userPermissionLevel: "trusted",
        interfaceType: "discord",
        channelId: "thread-456",
        channelName: "Ops Guild",
        actor: {
          actorId: "discord:user-789",
          interfaceType: "discord",
          role: "user",
          displayName: "Mira Ops",
          username: "mira",
        },
        source: {
          messageId: "message-123",
          channelId: "channel-123",
          threadId: "thread-456",
          metadata: {
            guildId: "guild-123",
            guildName: "Ops Guild",
          },
        },
      });

      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          role: "user",
          content: "Hello from Mira",
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              actorId: "discord:user-789",
              displayName: "Mira Ops",
            }),
            source: expect.objectContaining({
              messageId: "message-123",
              threadId: "thread-456",
            }),
          }),
        }),
      );

      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: "assistant",
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              role: "assistant",
              isBot: true,
            }),
          }),
        }),
      );
    });

    it("enriches user actor metadata with explicit canonical identity links", async () => {
      const enrichActor = mock(
        (actor: ConversationMessageActor): ConversationMessageActor =>
          actor.actorId === "discord:user-789"
            ? { ...actor, canonicalId: "person:mira" }
            : actor,
      );
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        {
          agentFactory: mockAgentFactory,
          canonicalIdentityResolver: { enrichActor },
        },
      );

      await service.chat("Hello from Mira", "test-conversation", {
        interfaceType: "discord",
        actor: {
          actorId: "discord:user-789",
          interfaceType: "discord",
          role: "user",
          displayName: "Mira Ops",
        },
      });

      expect(enrichActor).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "discord:user-789" }),
      );
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              actorId: "discord:user-789",
              canonicalId: "person:mira",
              displayName: "Mira Ops",
            }),
          }),
        }),
      );
    });

    it("preserves the actor returned by enrichActor when no enrichment applies", async () => {
      const enrichActor = mock(
        (actor: ConversationMessageActor): ConversationMessageActor => actor,
      );
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        {
          agentFactory: mockAgentFactory,
          canonicalIdentityResolver: { enrichActor },
        },
      );

      await service.chat("Hello", "test-conversation", {
        actor: {
          actorId: "discord:user-789",
          canonicalId: "person:explicit",
          interfaceType: "discord",
          role: "user",
        },
      });

      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              canonicalId: "person:explicit",
            }),
          }),
        }),
      );
    });

    it("leaves unlinked actors without canonical ids", async () => {
      const enrichActor = mock(
        (actor: ConversationMessageActor): ConversationMessageActor => actor,
      );
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        {
          agentFactory: mockAgentFactory,
          canonicalIdentityResolver: { enrichActor },
        },
      );

      await service.chat("Hello", "test-conversation", {
        actor: {
          actorId: "discord:user-789",
          interfaceType: "discord",
          role: "user",
        },
      });

      expect(enrichActor).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "discord:user-789" }),
      );
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          metadata: expect.objectContaining({
            actor: expect.not.objectContaining({
              canonicalId: expect.anything(),
            }),
          }),
        }),
      );
    });

    it("uses configured brain actor id and character name for assistant metadata", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        {
          agentFactory: mockAgentFactory,
          assistantActorId: "brain:relay",
        },
      );

      await service.chat("Hello", "test-conversation");

      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: "assistant",
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              actorId: "brain:relay",
              interfaceType: "agent",
              role: "assistant",
              displayName: "Test Brain",
              isBot: true,
            }),
          }),
        }),
      );
    });

    it("keeps a stable assistant actor fallback when no brain actor id is configured", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          metadata: expect.objectContaining({
            actor: expect.objectContaining({
              actorId: "brain:assistant",
              displayName: "Test Brain",
            }),
          }),
        }),
      );
    });
  });

  describe("tools integration", () => {
    it("should create agent with MCP tools", async () => {
      const searchTool: Tool = {
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
        mockCharacterService,
        mockProfileService,
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
      const publicTool: Tool = {
        name: "public_search",
        description: "Public search tool",
        inputSchema: { query: z.string() },
        visibility: "public",
        handler: mock(async () => ({ success: true as const, data: {} })),
      };

      const anchorTool: Tool = {
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
        mockCharacterService,
        mockProfileService,
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
        mockCharacterService,
        mockProfileService,
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

  describe("agent context retrieval", () => {
    it("passes retrieved context through agent instructions with provenance", async () => {
      const agentContextProvider = mock(async () => [
        {
          id: "summary-1",
          source: "conversation-memory",
          title: "summary from #relay-team",
          content: "The team decided to use explicit memory retrieval.",
          provenance: {
            entityType: "summary",
            conversationId: "relay-conv",
            spaceId: "mcp:relay-team",
          },
        },
      ]);
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory, agentContextProvider },
      );

      await service.chat("What did we decide?", "relay-conv", {
        interfaceType: "mcp",
        channelId: "relay-team",
        channelName: "Relay Team",
        userPermissionLevel: "trusted",
      });

      expect(agentContextProvider).toHaveBeenCalledWith({
        conversationId: "relay-conv",
        message: "What did we decide?",
        interfaceType: "mcp",
        channelId: "relay-team",
        channelName: "Relay Team",
        userPermissionLevel: "trusted",
      });

      const generateInput = mockGenerate.mock.calls[0]?.[0];
      const messages = generateInput?.messages ?? [];
      expectNoSystemMessages(messages);
      expect(generateInput?.options.agentContextInstructions).toContain(
        "The team decided to use explicit memory retrieval.",
      );
      expect(generateInput?.options.agentContextInstructions).toContain(
        "conversationId=relay-conv",
      );
      expect(generateInput?.options.agentContextInstructions).toContain(
        "spaceId=mcp:relay-team",
      );
    });

    it("tells the agent when the context provider returns no relevant memory", async () => {
      const agentContextProvider = mock(async () => []);
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory, agentContextProvider },
      );

      await service.chat("What memory is available?", "empty-context", {
        interfaceType: "mcp",
        channelId: "empty-space",
        userPermissionLevel: "trusted",
      });

      const generateInput = mockGenerate.mock.calls[0]?.[0];
      const messages = generateInput?.messages ?? [];
      expectNoSystemMessages(messages);
      expect(generateInput?.options.agentContextInstructions).toContain(
        "No relevant conversation memory was retrieved for this turn.",
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
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat("Hello", "test-conversation");
      expect(response.text).toContain("Agent error");
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
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat("Hello", "test-conversation");
      expect(response.text).toBe("");
    });
  });

  describe("confirmation flow", () => {
    // Helper: make the agent return a tool result with needsConfirmation
    const setupConfirmationResponse = (
      text = "Are you sure you want to delete this note?",
      summary = "Delete note 'Meeting Notes'?",
      preview?: string,
    ): void => {
      mockAgentGenerateResult = {
        text,
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "call-1",
                toolName: "delete_note",
                input: { noteId: "123" },
              },
            ],
            toolResults: [
              {
                toolCallId: "call-1",
                toolName: "delete_note",
                output: {
                  needsConfirmation: true,
                  toolName: "delete_note",
                  summary,
                  ...(preview !== undefined ? { preview } : {}),
                  args: { noteId: "123" },
                },
              },
            ],
          },
        ],
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      };
    };

    it("does not execute the destructive handler before explicit confirmation", async () => {
      setupConfirmationResponse("Deleted.");

      const deleteHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation");

      expect(deleteHandler).not.toHaveBeenCalled();
    });

    it("rejects confirmation when the explicit approval id does not match", async () => {
      setupConfirmationResponse("Deleted.");

      const deleteHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation");
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:wrong-call",
      );

      expect(response.text).toBe(
        "No pending action matches approval id 'approval:wrong-call'.",
      );
      expect(deleteHandler).not.toHaveBeenCalled();
    });

    it("does not return or persist misleading model completion text before confirmation", async () => {
      setupConfirmationResponse("Deleted.");

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "delete my note",
        "test-conversation",
      );

      expect(response.pendingConfirmations).toEqual([
        {
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          summary: "Delete note 'Meeting Notes'?",
          args: { noteId: "123" },
        },
      ]);
      expect(response.cards).toEqual([
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note 'Meeting Notes'?",
          state: "approval-requested",
        },
      ]);
      expect(response.text).toBe("Confirmation required.");
      expect(response.text).not.toBe("Deleted.");
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: "assistant",
          content: "Confirmation required.",
        }),
      );
      expect(mockConversationService.addMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: "Deleted.",
        }),
      );
    });

    it("saves and returns the confirmed action success result", async () => {
      setupConfirmationResponse("Deleted.");

      const deleteHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation");
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(response.text).toBe("Completed: Delete note 'Meeting Notes'?");
      expect(response.text).not.toContain("Result:");
      expect(response.text).not.toContain('"success": true');
      expect(response.toolResults).toEqual([
        {
          toolName: "delete_note",
          args: { noteId: "123" },
          data: { success: true },
        },
      ]);
      expect(response.cards).toEqual([
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note 'Meeting Notes'?",
          state: "output-available",
          output: { success: true },
        },
      ]);
      expect(mockConversationService.addMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: response.text,
        }),
      );
    });

    it("does not repeat destructive preview text after confirmation", async () => {
      setupConfirmationResponse(
        "Deleted.",
        "Delete note 'Meeting Notes'?",
        "Sensitive content that should only appear before approval.",
      );

      const deleteHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const pending = await service.chat("delete my note", "test-conversation");
      expect(pending.pendingConfirmations?.[0]?.summary).toBe(
        "Delete note 'Meeting Notes'?",
      );
      expect(pending.pendingConfirmations?.[0]?.preview).toBe(
        "Sensitive content that should only appear before approval.",
      );

      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(response.text).toContain(
        "Completed: Delete note 'Meeting Notes'?",
      );
      expect(response.text).not.toContain("Sensitive content");
      const resolvedCard = response.cards?.[0];
      expect(resolvedCard?.kind).toBe("tool-approval");
      if (resolvedCard?.kind !== "tool-approval") {
        throw new Error("Expected tool approval card");
      }
      expect(resolvedCard.summary).toBe("Delete note 'Meeting Notes'?");
      expect(resolvedCard.preview).toBeUndefined();
    });

    it("surfaces and saves the confirmed action failure result", async () => {
      setupConfirmationResponse("Deleted.");

      const deleteHandler = mock(async () => ({
        success: false as const,
        error: "Entity not found: base/woodchuck-note",
      }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation");
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(response.text).toBe(
        "Failed: Delete note 'Meeting Notes'?\n\nEntity not found: base/woodchuck-note",
      );
      expect(response.text).not.toContain("Result:");
      expect(response.text).not.toContain('"success": false');
      expect(response.toolResults).toEqual([
        {
          toolName: "delete_note",
          args: { noteId: "123" },
          data: {
            success: false,
            error: "Entity not found: base/woodchuck-note",
          },
        },
      ]);
      expect(response.cards).toEqual([
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note 'Meeting Notes'?",
          state: "output-error",
          output: {
            success: false,
            error: "Entity not found: base/woodchuck-note",
          },
          error: "Entity not found: base/woodchuck-note",
        },
      ]);
      expect(mockConversationService.addMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: response.text,
        }),
      );
    });

    it("coerces non-compliant confirmed action results from registered tools", async () => {
      setupConfirmationResponse("Deleted.");

      const unsubscribeFn = mock(() => {});
      const realMCPService = MCPService.createFresh(
        {
          send: mock(async () => ({ success: true as const })),
          subscribe: mock(() => unsubscribeFn),
          unsubscribe: mock(() => {}),
        },
        logger,
      );
      const deleteHandler = mock(async () => JSON.parse('{"success":false}'));
      realMCPService.registerTool("test", {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      });

      const service = AgentService.createFresh(
        realMCPService,
        mockConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation", {
        userPermissionLevel: "trusted",
      });
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(response.text).not.toContain('"success": false');
      expect(response.text).toContain(
        "Tool delete_note returned an invalid response shape",
      );
      expect(response.cards?.[0]).toEqual(
        expect.objectContaining({
          state: "output-error",
          error: "Tool delete_note returned an invalid response shape",
        }),
      );
    });

    it("should track pending confirmation for destructive operations", async () => {
      setupConfirmationResponse();

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      // Chat triggers a tool that needs confirmation
      const chatResponse = await service.chat(
        "delete my note",
        "test-conversation",
      );
      expect(chatResponse.pendingConfirmations?.[0]?.toolName).toBe(
        "delete_note",
      );
      expect(chatResponse.cards?.[0]?.id).toBe("approval:call-1");

      // Confirm the action
      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(response.text).toBeDefined();
    });

    it("keeps multiple pending approvals distinct by approval id", async () => {
      mockAgentGenerateResult = {
        text: "Delete and update requested.",
        steps: [
          {
            toolCalls: [
              {
                toolCallId: "call-delete",
                toolName: "delete_note",
                input: { noteId: "123" },
              },
              {
                toolCallId: "call-update",
                toolName: "update_note",
                input: { noteId: "456", title: "New title" },
              },
            ],
            toolResults: [
              {
                toolCallId: "call-delete",
                toolName: "delete_note",
                output: {
                  needsConfirmation: true,
                  toolName: "delete_note",
                  summary: "Delete note 'Meeting Notes'?",
                  args: { noteId: "123" },
                },
              },
              {
                toolCallId: "call-update",
                toolName: "update_note",
                output: {
                  needsConfirmation: true,
                  toolName: "update_note",
                  summary: "Update note 'Roadmap'?",
                  args: { noteId: "456", title: "New title" },
                },
              },
            ],
          },
        ],
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      };

      const deleteHandler = mock(async () => ({ success: true as const }));
      const updateHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      const updateTool: Tool = {
        name: "update_note",
        description: "Update note",
        inputSchema: { noteId: z.string(), title: z.string() },
        visibility: "trusted",
        handler: updateHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock(() => [
        { pluginId: "test", tool: deleteTool },
        { pluginId: "test", tool: updateTool },
      ]);

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const pending = await service.chat(
        "delete and update",
        "test-conversation",
      );

      expect(pending.cards?.map((card) => card.id)).toEqual([
        "approval:call-delete",
        "approval:call-update",
      ]);

      const updateResponse = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-update",
      );
      expect(updateResponse.text).toBe("Completed: Update note 'Roadmap'?");
      expect(updateHandler).toHaveBeenCalledWith(
        { noteId: "456", title: "New title" },
        expect.any(Object),
      );
      expect(deleteHandler).not.toHaveBeenCalled();

      const deleteResponse = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-delete",
      );
      expect(deleteResponse.text).toBe(
        "Completed: Delete note 'Meeting Notes'?",
      );
      expect(deleteHandler).toHaveBeenCalledWith(
        { noteId: "123" },
        expect.any(Object),
      );
    });

    it("should cancel pending confirmation when user declines", async () => {
      setupConfirmationResponse();

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      // Chat triggers a tool that needs confirmation
      await service.chat("delete my note", "test-conversation");

      // Cancel it
      const response = await service.confirmPendingAction(
        "test-conversation",
        false,
        "approval:call-1",
      );

      expect(response.text).toContain("cancelled");
    });

    it("should execute confirmed actions with original permission and routing context", async () => {
      setupConfirmationResponse();

      const deleteHandler = mock(async () => ({ success: true as const }));
      const deleteTool: Tool = {
        name: "delete_note",
        description: "Delete note",
        inputSchema: { noteId: z.string() },
        visibility: "trusted",
        handler: deleteHandler,
      };
      mockMCPService.listToolsForPermissionLevel = mock((level: string) =>
        level === "trusted" ? [{ pluginId: "test", tool: deleteTool }] : [],
      );

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("delete my note", "test-conversation", {
        userPermissionLevel: "trusted",
        interfaceType: "matrix",
        channelId: "!room:example.org",
        channelName: "Ops",
      });
      await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:call-1",
      );

      expect(mockMCPService.listToolsForPermissionLevel).toHaveBeenCalledWith(
        "trusted",
      );
      expect(deleteHandler).toHaveBeenCalledWith(
        { noteId: "123" },
        expect.objectContaining({
          interfaceType: "matrix",
          channelId: "!room:example.org",
          channelName: "Ops",
          userPermissionLevel: "trusted",
        }),
      );
    });

    it("should return error when confirming without pending action", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.confirmPendingAction(
        "test-conversation",
        true,
        "approval:noop",
      );

      expect(response.text).toContain("No pending");
    });
  });

  describe("agent creation", () => {
    it("should create agent with character from BrainCharacterService", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
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

    it("should pass plugin instructions from MCPService to agent factory", async () => {
      const mcpWithInstructions = createMockMCPService();
      mcpWithInstructions.getInstructions = mock(() => [
        "Always log unfulfilled requests.",
      ]);

      const service = AgentService.createFresh(
        mcpWithInstructions,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      await service.chat("Hello", "test-conversation");

      const createCallArgs = mockAgentFactory.mock.calls[0]?.[0];
      expect(createCallArgs?.pluginInstructions).toEqual([
        "Always log unfulfilled requests.",
      ]);
    });

    it("should pass brain-specific agent instructions to agent factory", async () => {
      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        {
          agentFactory: mockAgentFactory,
          agentInstructions: ["Prefer team synthesis over publishing."],
        },
      );

      await service.chat("Hello", "test-conversation");

      const createCallArgs = mockAgentFactory.mock.calls[0]?.[0];
      expect(createCallArgs?.agentInstructions).toEqual([
        "Prefer team synthesis over publishing.",
      ]);
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
        mockCharacterService,
        mockProfileService,
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

    it("should include attachment cards for document generation results", async () => {
      mockAgentGenerateResult = {
        text: "Queued PDF generation.",
        steps: [
          {
            toolCalls: [
              {
                toolName: "document_generate",
                toolCallId: "call1",
                input: {
                  sourceEntityType: "deck",
                  sourceEntityId: "deck-1",
                  attachmentType: "carousel",
                },
              },
            ],
            toolResults: [
              {
                toolName: "document_generate",
                toolCallId: "call1",
                output: {
                  success: true,
                  data: {
                    jobId: "job-1",
                    documentId: "deck-carousel",
                    attachment: {
                      mediaType: "application/pdf",
                      url: "/api/chat/attachments/document?id=deck-carousel",
                      downloadUrl:
                        "/api/chat/attachments/document?id=deck-carousel&download=1",
                      filename: "deck-carousel.pdf",
                      source: {
                        entityType: "document",
                        entityId: "deck-carousel",
                        attachmentType: "carousel",
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Generate a carousel PDF",
        "test-conversation",
      );

      expect(response.cards).toEqual([
        {
          kind: "attachment",
          id: "attachment:deck-carousel",
          jobId: "job-1",
          title: "deck-carousel.pdf",
          description:
            "PDF generation has been queued. This artifact will open once the job completes.",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-carousel",
            downloadUrl:
              "/api/chat/attachments/document?id=deck-carousel&download=1",
            filename: "deck-carousel.pdf",
            source: {
              entityType: "document",
              entityId: "deck-carousel",
              attachmentType: "carousel",
            },
          },
        },
      ]);
    });

    it("should include attachment cards for image generation results", async () => {
      mockAgentGenerateResult = {
        text: "Queued image generation.",
        steps: [
          {
            toolCalls: [
              {
                toolName: "system_create",
                toolCallId: "call1",
                input: {
                  entityType: "image",
                  prompt: "Generate a mossy robot",
                },
              },
            ],
            toolResults: [
              {
                toolName: "system_create",
                toolCallId: "call1",
                output: {
                  success: true,
                  data: {
                    entityId: "mossy-robot",
                    status: "generating",
                    jobId: "job-1",
                    attachment: {
                      mediaType: "image/png",
                      url: "/api/chat/attachments/image?id=mossy-robot",
                      downloadUrl:
                        "/api/chat/attachments/image?id=mossy-robot&download=1",
                      filename: "mossy-robot.png",
                      source: {
                        entityType: "image",
                        entityId: "mossy-robot",
                        attachmentType: "generated",
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      };

      const service = AgentService.createFresh(
        mockMCPService,
        mockConversationService as IConversationService,
        mockCharacterService,
        mockProfileService,
        logger,
        { agentFactory: mockAgentFactory },
      );

      const response = await service.chat(
        "Generate a mossy robot",
        "test-conversation",
      );

      const expectedCards = [
        {
          kind: "attachment" as const,
          id: "attachment:mossy-robot",
          jobId: "job-1",
          title: "mossy-robot.png",
          description:
            "image generation has been queued. This artifact will open once the job completes.",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=mossy-robot",
            downloadUrl:
              "/api/chat/attachments/image?id=mossy-robot&download=1",
            filename: "mossy-robot.png",
            source: {
              entityType: "image",
              entityId: "mossy-robot",
              attachmentType: "generated",
            },
          },
        },
      ];
      expect(response.cards).toEqual(expectedCards);
      const entityMemoryNote =
        '\n\n[Entities affected this turn: image "mossy-robot" (generating). Reference these IDs directly in follow-ups instead of searching for them.]';
      expect(mockConversationService.addMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          role: "assistant",
          content: "Queued image generation.",
          metadata: expect.objectContaining({
            cards: expectedCards,
            entityMemoryNote,
          }),
        }),
      );
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
        mockCharacterService,
        mockProfileService,
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
        mockCharacterService,
        mockProfileService,
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
