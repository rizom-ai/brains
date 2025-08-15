import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConversationService } from "../src/conversation-service";
import { createSilentLogger } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { ConversationDB } from "../src/database";
import type { ConversationServiceConfig } from "../src/types";
import { createTestConversationDatabase } from "./helpers/test-conversation-db";
import type { Client } from "@libsql/client";

describe("ConversationService", () => {
  let service: ConversationService;
  let db: ConversationDB;
  let client: Client;
  let logger: Logger;
  let config: ConversationServiceConfig;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Create test database with migrations
    const testDb = await createTestConversationDatabase();
    db = testDb.db;
    client = testDb.client;
    cleanup = testDb.cleanup;

    // Create silent logger for tests
    logger = createSilentLogger();

    // Create config
    config = {};

    // Create service with real database
    service = ConversationService.createFresh(db, logger, config);
  });

  afterEach(async () => {
    // Clean up
    await cleanup();
  });

  describe("startConversation", () => {
    it("should create a new conversation using sessionId as conversationId", async () => {
      const sessionId = "test-session-123";
      const interfaceType = "cli";
      const channelId = "test-channel";

      const conversationId = await service.startConversation(
        sessionId,
        interfaceType,
        channelId,
      );

      expect(conversationId).toBe(sessionId);

      // Verify conversation was created in database
      const result = await client.execute({
        sql: "SELECT * FROM conversations WHERE id = ?",
        args: [sessionId],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.["session_id"]).toBe(sessionId);
      expect(result.rows[0]?.["interface_type"]).toBe(interfaceType);
    });

    it("should return existing conversation if already exists (idempotent)", async () => {
      const sessionId = "existing-session-456";
      const interfaceType = "matrix";
      const channelId = "test-channel";

      // Start conversation first time
      await service.startConversation(sessionId, interfaceType, channelId);

      // Start conversation second time
      const conversationId = await service.startConversation(
        sessionId,
        interfaceType,
        channelId,
      );

      expect(conversationId).toBe(sessionId);

      // Verify only one conversation exists
      const result = await client.execute({
        sql: "SELECT COUNT(*) as count FROM conversations WHERE id = ?",
        args: [sessionId],
      });
      expect(result.rows[0]?.["count"]).toBe(1);
    });
  });

  describe("addMessage", () => {
    it("should add a message to the conversation", async () => {
      const conversationId = "conv-123";
      const role = "user";
      const content = "Test message";
      const metadata = { key: "value" };

      // First create a conversation
      await service.startConversation(conversationId, "cli", "test-channel");

      // Add message
      await service.addMessage(conversationId, role, content, metadata);

      // Verify message was added
      const result = await client.execute({
        sql: "SELECT * FROM messages WHERE conversation_id = ?",
        args: [conversationId],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.["role"]).toBe(role);
      expect(result.rows[0]?.["content"]).toBe(content);
    });
  });

  describe("getMessages", () => {
    it("should retrieve messages in chronological order", async () => {
      const conversationId = "conv-123";

      // Create conversation
      await service.startConversation(conversationId, "cli", "test-channel");

      // Add messages
      await service.addMessage(conversationId, "user", "First message");
      await service.addMessage(conversationId, "assistant", "Second message");
      await service.addMessage(conversationId, "user", "Third message");

      const result = await service.getMessages(conversationId);

      expect(result).toHaveLength(3);
      expect(result[0]?.content).toBe("First message");
      expect(result[1]?.content).toBe("Second message");
      expect(result[2]?.content).toBe("Third message");
    });

    it("should limit the number of messages retrieved", async () => {
      const conversationId = "conv-123";
      const limit = 2;

      // Create conversation
      await service.startConversation(conversationId, "cli", "test-channel");

      // Add more messages than limit
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");

      const result = await service.getMessages(conversationId, { limit });

      expect(result).toHaveLength(limit);
      // Should get the most recent messages
      expect(result[0]?.content).toBe("Message 2");
      expect(result[1]?.content).toBe("Message 3");
    });
  });

  describe("getConversation", () => {
    it("should retrieve conversation details", async () => {
      const conversationId = "conv-123";
      const interfaceType = "cli";

      await service.startConversation(
        conversationId,
        interfaceType,
        "test-channel",
      );

      const result = await service.getConversation(conversationId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(conversationId);
      expect(result?.sessionId).toBe(conversationId);
      expect(result?.interfaceType).toBe(interfaceType);
    });

    it("should return null if conversation not found", async () => {
      const result = await service.getConversation("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getMessages with range", () => {
    it("should retrieve messages in specified range", async () => {
      const conversationId = "conv-range";

      // Create conversation and add messages
      await service.startConversation(conversationId, "cli", "test-channel");
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");
      await service.addMessage(conversationId, "assistant", "Message 4");
      await service.addMessage(conversationId, "user", "Message 5");

      // Get messages 2-4 (1-based indexing)
      const result = await service.getMessages(conversationId, {
        range: { start: 2, end: 4 },
      });

      expect(result).toHaveLength(3);
      expect(result[0]?.content).toBe("Message 2");
      expect(result[1]?.content).toBe("Message 3");
      expect(result[2]?.content).toBe("Message 4");
    });

    it("should handle range at beginning of conversation", async () => {
      const conversationId = "conv-range-start";

      await service.startConversation(conversationId, "cli", "test-channel");
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");

      // Get messages 1-2
      const result = await service.getMessages(conversationId, {
        range: { start: 1, end: 2 },
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.content).toBe("Message 1");
      expect(result[1]?.content).toBe("Message 2");
    });

    it("should handle range at end of conversation", async () => {
      const conversationId = "conv-range-end";

      await service.startConversation(conversationId, "cli", "test-channel");
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");

      // Get messages 2-3
      const result = await service.getMessages(conversationId, {
        range: { start: 2, end: 3 },
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.content).toBe("Message 2");
      expect(result[1]?.content).toBe("Message 3");
    });

    it("should handle single message range", async () => {
      const conversationId = "conv-single";

      await service.startConversation(conversationId, "cli", "test-channel");
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");

      // Get only message 2
      const result = await service.getMessages(conversationId, {
        range: { start: 2, end: 2 },
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe("Message 2");
    });
  });

  describe("searchConversations", () => {
    it("should search conversations by content", async () => {
      // Create conversation with searchable content
      await service.startConversation("conv-1", "cli", "channel-1");
      await service.addMessage("conv-1", "user", "This is a test message");

      // Create another conversation without the search term
      await service.startConversation("conv-2", "cli", "channel-2");
      await service.addMessage("conv-2", "user", "Different content");

      const result = await service.searchConversations("test");

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("conv-1");
    });
  });
});
