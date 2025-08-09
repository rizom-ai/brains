import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ConversationMemoryService } from "../../src/lib/conversation-memory-service";
import type { ServicePluginContext } from "@brains/plugins";
import type { ConversationDB } from "../../src/db";
import type { ConversationMemoryConfig } from "../../src/types";

describe("ConversationMemoryService", () => {
  let service: ConversationMemoryService;
  let mockDb: ConversationDB;
  let mockContext: ServicePluginContext;
  let config: ConversationMemoryConfig;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      insert: mock(() => ({
        values: mock(() => Promise.resolve(undefined)),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve(undefined)),
        })),
      })),
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(() => Promise.resolve([])),
            })),
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      })),
    } as unknown as ConversationDB;

    // Create mock context
    mockContext = {
      logger: {
        debug: mock(() => {}),
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
      entityService: {
        search: mock(() => Promise.resolve([])),
      },
      enqueueJob: mock(() => Promise.resolve(undefined)),
    } as unknown as ServicePluginContext;

    // Create config
    config = {
      summarization: {
        minMessages: 20,
        minTimeMinutes: 60,
        enableAutomatic: true,
      },
    };

    service = new ConversationMemoryService(mockDb, mockContext, config);
  });

  describe("startConversation", () => {
    it("should create a new conversation and initialize tracking", async () => {
      const sessionId = "test-session";
      const interfaceType = "cli";

      const conversationId = await service.startConversation(
        sessionId,
        interfaceType,
      );

      expect(typeof conversationId).toBe("string");
      expect(conversationId.length).toBeGreaterThan(0);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(mockContext.logger.debug).toHaveBeenCalledWith(
        "Started new conversation",
        expect.objectContaining({
          conversationId,
          sessionId,
          interfaceType,
        }),
      );
    });
  });

  describe("addMessage", () => {
    it("should add a message and update conversation", async () => {
      const conversationId = "conv-123";
      const role = "user";
      const content = "Hello, world!";
      const metadata = { test: true };

      await service.addMessage(conversationId, role, content, metadata);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalledTimes(2); // conversations and summaryTracking
      expect(mockContext.logger.debug).toHaveBeenCalledWith(
        "Added message to conversation",
        expect.objectContaining({
          conversationId,
          role,
        }),
      );
    });

    it("should handle messages without metadata", async () => {
      const conversationId = "conv-123";
      const role = "assistant";
      const content = "Hello!";

      await service.addMessage(conversationId, role, content);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("getRecentMessages", () => {
    it("should retrieve messages in chronological order", async () => {
      const conversationId = "conv-123";
      const mockMessages = [
        {
          id: "msg-3",
          content: "Third",
          timestamp: "2024-01-03",
          role: "user",
          conversationId,
          metadata: null,
        },
        {
          id: "msg-2",
          content: "Second",
          timestamp: "2024-01-02",
          role: "assistant",
          conversationId,
          metadata: null,
        },
        {
          id: "msg-1",
          content: "First",
          timestamp: "2024-01-01",
          role: "user",
          conversationId,
          metadata: null,
        },
      ];

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(() => Promise.resolve(mockMessages)),
            })),
          })),
        })),
      }));

      const messages = await service.getRecentMessages(conversationId, 3);

      // Should reverse to chronological order
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
      expect(messages[2].content).toBe("Third");
    });

    it("should use default limit of 20", async () => {
      const conversationId = "conv-123";
      let capturedLimit: number | undefined;

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock((limit: number) => {
                capturedLimit = limit;
                return Promise.resolve([]);
              }),
            })),
          })),
        })),
      }));

      await service.getRecentMessages(conversationId);

      expect(capturedLimit).toBe(20);
    });
  });

  describe("getConversation", () => {
    it("should return conversation if found", async () => {
      const conversationId = "conv-123";
      const mockConversation = {
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: "2024-01-01",
        lastActive: "2024-01-01",
        metadata: null,
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockConversation])),
          })),
        })),
      }));

      const conversation = await service.getConversation(conversationId);

      expect(conversation).toEqual(mockConversation);
    });

    it("should return null if conversation not found", async () => {
      const conversationId = "non-existent";

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      const conversation = await service.getConversation(conversationId);

      expect(conversation).toBeNull();
    });
  });

  describe("checkSummarizationNeeded", () => {
    it("should return false if automatic summarization is disabled", async () => {
      const configWithoutAuto = {
        summarization: {
          minMessages: 20,
          minTimeMinutes: 60,
          enableAutomatic: false,
        },
      };
      const serviceWithoutAuto = new ConversationMemoryService(
        mockDb,
        mockContext,
        configWithoutAuto,
      );

      const needed =
        await serviceWithoutAuto.checkSummarizationNeeded("conv-123");

      expect(needed).toBe(false);
    });

    it("should return true if message count exceeds threshold", async () => {
      const conversationId = "conv-123";
      const mockTracking = {
        conversationId,
        messagesSinceSummary: 25,
        lastSummarizedAt: null,
        lastMessageId: null,
        updated: "2024-01-01",
      };

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockTracking])),
          })),
        })),
      }));

      const needed = await service.checkSummarizationNeeded(conversationId);

      expect(needed).toBe(true);
    });

    it("should return true if time since last summary exceeds threshold", async () => {
      const conversationId = "conv-123";
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000,
      ).toISOString();
      const mockTracking = {
        conversationId,
        messagesSinceSummary: 5,
        lastSummarizedAt: twoHoursAgo,
        lastMessageId: null,
        updated: "2024-01-01",
      };

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockTracking])),
          })),
        })),
      }));

      const needed = await service.checkSummarizationNeeded(conversationId);

      expect(needed).toBe(true);
    });

    it("should return false if neither threshold is met", async () => {
      const conversationId = "conv-123";
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const mockTracking = {
        conversationId,
        messagesSinceSummary: 5,
        lastSummarizedAt: tenMinutesAgo,
        lastMessageId: null,
        updated: "2024-01-01",
      };

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockTracking])),
          })),
        })),
      }));

      const needed = await service.checkSummarizationNeeded(conversationId);

      expect(needed).toBe(false);
    });

    it("should return false if tracking not found", async () => {
      const conversationId = "conv-123";

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      const needed = await service.checkSummarizationNeeded(conversationId);

      expect(needed).toBe(false);
    });
  });

  describe("createSummary", () => {
    it("should queue a summarization job", async () => {
      const conversationId = "conv-123";
      const mockConversation = {
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: "2024-01-01",
        lastActive: "2024-01-01",
        metadata: null,
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([mockConversation])),
          })),
        })),
      }));

      await service.createSummary(conversationId);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        "Queueing conversation summary job",
        expect.objectContaining({
          conversationId,
          sessionId: "session-123",
        }),
      );
      expect(mockContext.enqueueJob).toHaveBeenCalledWith(
        "conversation-topic",
        { conversationId },
      );
    });

    it("should throw if conversation not found", async () => {
      const conversationId = "non-existent";

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      await expect(service.createSummary(conversationId)).rejects.toThrow(
        "Conversation non-existent not found",
      );
    });
  });

  describe("searchConversations", () => {
    it("should filter results by session", async () => {
      const sessionId = "session-123";
      const query = "test query";
      const mockResults = [
        {
          entity: {
            id: "entity-1",
            type: "conversation-topic",
            content: "summary 1",
            metadata: {
              sessionId: "session-123",
              conversationId: "conv-1",
              interfaceType: "cli",
              messageCount: 10,
            },
            created: "2024-01-01",
            updated: "2024-01-01",
          },
          excerpt: "Test excerpt 1",
          score: 0.9,
        },
        {
          entity: {
            id: "entity-2",
            type: "conversation-topic",
            content: "summary 2",
            metadata: {
              sessionId: "other-session",
              conversationId: "conv-2",
              interfaceType: "cli",
              messageCount: 5,
            },
            created: "2024-01-02",
            updated: "2024-01-02",
          },
          excerpt: "Test excerpt 2",
          score: 0.8,
        },
      ];

      mockContext.entityService.search = mock(() =>
        Promise.resolve(mockResults),
      );

      const results = await service.searchConversations(sessionId, query);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        conversationId: "conv-1",
        excerpt: "Test excerpt 1",
        timestamp: "2024-01-01",
        relevance: 0.9,
      });
    });

    it("should handle invalid metadata gracefully", async () => {
      const sessionId = "session-123";
      const query = "test query";
      const mockResults = [
        {
          entity: {
            id: "entity-1",
            type: "conversation-topic",
            content: "summary",
            metadata: { invalid: "data" },
            created: "2024-01-01",
            updated: "2024-01-01",
          },
          excerpt: "Test excerpt",
          score: 0.9,
        },
      ];

      mockContext.entityService.search = mock(() =>
        Promise.resolve(mockResults),
      );

      const results = await service.searchConversations(sessionId, query);

      expect(results).toHaveLength(0);
    });
  });

  describe("getConversationContext", () => {
    it("should return conversation context with message count", async () => {
      const conversationId = "conv-123";
      const mockConversation = {
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: "2024-01-01T10:00:00Z",
        lastActive: "2024-01-01T11:00:00Z",
        metadata: null,
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      let callCount = 0;
      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => {
            callCount++;
            if (callCount === 1) {
              // First call for conversation
              return {
                limit: mock(() => Promise.resolve([mockConversation])),
              };
            } else {
              // Second call for message count
              return Promise.resolve([{ count: 42 }]);
            }
          }),
        })),
      }));

      const context = await service.getConversationContext(conversationId);

      expect(context).toEqual({
        conversationId,
        sessionId: "session-123",
        messageCount: 42,
        started: "2024-01-01T10:00:00Z",
        lastActive: "2024-01-01T11:00:00Z",
      });
    });

    it("should throw if conversation not found", async () => {
      const conversationId = "non-existent";

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      await expect(
        service.getConversationContext(conversationId),
      ).rejects.toThrow("Conversation non-existent not found");
    });

    it("should handle missing count gracefully", async () => {
      const conversationId = "conv-123";
      const mockConversation = {
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: "2024-01-01T10:00:00Z",
        lastActive: "2024-01-01T11:00:00Z",
        metadata: null,
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      let callCount = 0;
      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => {
            callCount++;
            if (callCount === 1) {
              // First call for conversation
              return {
                limit: mock(() => Promise.resolve([mockConversation])),
              };
            } else {
              // Second call for message count - null result
              return Promise.resolve([{ count: null }]);
            }
          }),
        })),
      }));

      const context = await service.getConversationContext(conversationId);

      expect(context.messageCount).toBe(0);
    });
  });
});
