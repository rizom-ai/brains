import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createConversationTools } from "../../src/tools";
import type { IConversationMemoryService } from "../../src/types";

describe("createConversationTools", () => {
  let mockService: IConversationMemoryService;
  let tools: ReturnType<typeof createConversationTools>;
  const pluginId = "test-plugin";

  beforeEach(() => {
    mockService = {
      startConversation: mock(() => Promise.resolve("conv-123")),
      addMessage: mock(() => Promise.resolve()),
      getRecentMessages: mock(() => Promise.resolve([])),
      getConversation: mock(() => Promise.resolve(null)),
      checkSummarizationNeeded: mock(() => Promise.resolve(false)),
      createSummary: mock(() => Promise.resolve()),
      searchConversations: mock(() => Promise.resolve([])),
      getConversationContext: mock(() =>
        Promise.resolve({
          conversationId: "conv-123",
          sessionId: "session-123",
          messageCount: 0,
          started: "2024-01-01",
          lastActive: "2024-01-01",
        }),
      ),
    };

    tools = createConversationTools(mockService, pluginId);
  });

  describe("tool creation", () => {
    it("should create three tools with namespaced names", () => {
      expect(tools).toHaveLength(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain(`${pluginId}:get_conversation_history`);
      expect(toolNames).toContain(`${pluginId}:search_conversations`);
      expect(toolNames).toContain(`${pluginId}:get_conversation_context`);
    });

    it("should have proper descriptions", () => {
      const historyTool = tools.find((t) =>
        t.name.includes("get_conversation_history"),
      );
      expect(historyTool?.description).toBe(
        "Get recent messages from the current conversation",
      );

      const searchTool = tools.find((t) =>
        t.name.includes("search_conversations"),
      );
      expect(searchTool?.description).toBe(
        "Search across conversation summaries for a session",
      );

      const contextTool = tools.find((t) =>
        t.name.includes("get_conversation_context"),
      );
      expect(contextTool?.description).toBe(
        "Get context information about a conversation",
      );
    });
  });

  describe("get_conversation_history tool", () => {
    it("should retrieve messages with default limit", async () => {
      const historyTool = tools.find((t) =>
        t.name.includes("get_conversation_history"),
      );
      const mockMessages = [
        {
          id: "msg-1",
          conversationId: "conv-123",
          role: "user" as const,
          content: "Hello",
          timestamp: "2024-01-01T10:00:00Z",
          metadata: null,
        },
        {
          id: "msg-2",
          conversationId: "conv-123",
          role: "assistant" as const,
          content: "Hi there",
          timestamp: "2024-01-01T10:01:00Z",
          metadata: null,
        },
      ];

      mockService.getRecentMessages = mock(() => Promise.resolve(mockMessages));

      const result = await historyTool!.handler({
        conversationId: "conv-123",
      });

      expect(mockService.getRecentMessages).toHaveBeenCalledWith(
        "conv-123",
        20,
      );
      expect(result).toEqual({
        messages: [
          { role: "user", content: "Hello", timestamp: "2024-01-01T10:00:00Z" },
          {
            role: "assistant",
            content: "Hi there",
            timestamp: "2024-01-01T10:01:00Z",
          },
        ],
      });
    });

    it("should accept custom limit", async () => {
      const historyTool = tools.find((t) =>
        t.name.includes("get_conversation_history"),
      );

      mockService.getRecentMessages = mock(() => Promise.resolve([]));

      await historyTool!.handler({
        conversationId: "conv-123",
        limit: 50,
      });

      expect(mockService.getRecentMessages).toHaveBeenCalledWith(
        "conv-123",
        50,
      );
    });

    it("should validate input schema", async () => {
      const historyTool = tools.find((t) =>
        t.name.includes("get_conversation_history"),
      );

      await expect(
        historyTool!.handler({ invalidField: "test" }),
      ).rejects.toThrow();
    });
  });

  describe("search_conversations tool", () => {
    it("should search conversations and return results", async () => {
      const searchTool = tools.find((t) =>
        t.name.includes("search_conversations"),
      );
      const mockResults = [
        {
          conversationId: "conv-1",
          excerpt: "Discussing project planning",
          timestamp: "2024-01-01",
          relevance: 0.95,
        },
        {
          conversationId: "conv-2",
          excerpt: "Reviewing code changes",
          timestamp: "2024-01-02",
          relevance: 0.85,
        },
      ];

      mockService.searchConversations = mock(() =>
        Promise.resolve(mockResults),
      );

      const result = await searchTool!.handler({
        sessionId: "session-123",
        query: "project",
      });

      expect(mockService.searchConversations).toHaveBeenCalledWith(
        "session-123",
        "project",
      );
      expect(result).toEqual({ results: mockResults });
    });

    it("should return empty results when no matches", async () => {
      const searchTool = tools.find((t) =>
        t.name.includes("search_conversations"),
      );

      mockService.searchConversations = mock(() => Promise.resolve([]));

      const result = await searchTool!.handler({
        sessionId: "session-123",
        query: "nonexistent",
      });

      expect(result).toEqual({ results: [] });
    });

    it("should validate required parameters", async () => {
      const searchTool = tools.find((t) =>
        t.name.includes("search_conversations"),
      );

      await expect(
        searchTool!.handler({ sessionId: "session-123" }),
      ).rejects.toThrow();

      await expect(searchTool!.handler({ query: "test" })).rejects.toThrow();
    });
  });

  describe("get_conversation_context tool", () => {
    it("should retrieve conversation context", async () => {
      const contextTool = tools.find((t) =>
        t.name.includes("get_conversation_context"),
      );
      const mockContext = {
        conversationId: "conv-123",
        sessionId: "session-123",
        messageCount: 42,
        started: "2024-01-01T10:00:00Z",
        lastActive: "2024-01-01T15:30:00Z",
      };

      mockService.getConversationContext = mock(() =>
        Promise.resolve(mockContext),
      );

      const result = await contextTool!.handler({
        conversationId: "conv-123",
      });

      expect(mockService.getConversationContext).toHaveBeenCalledWith(
        "conv-123",
      );
      expect(result).toEqual(mockContext);
    });

    it("should handle optional fields in context", async () => {
      const contextTool = tools.find((t) =>
        t.name.includes("get_conversation_context"),
      );
      const mockContext = {
        conversationId: "conv-123",
        sessionId: "session-123",
        messageCount: 10,
        started: "2024-01-01T10:00:00Z",
        lastActive: "2024-01-01T10:30:00Z",
        recentTopics: ["testing", "development"],
        entities: ["user-1", "project-x"],
      };

      mockService.getConversationContext = mock(() =>
        Promise.resolve(mockContext),
      );

      const result = await contextTool!.handler({
        conversationId: "conv-123",
      });

      expect(result).toEqual(mockContext);
    });

    it("should validate conversationId is required", async () => {
      const contextTool = tools.find((t) =>
        t.name.includes("get_conversation_context"),
      );

      await expect(contextTool!.handler({})).rejects.toThrow();
    });
  });
});
