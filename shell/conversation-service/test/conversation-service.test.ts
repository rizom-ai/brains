import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConversationService } from "../src/conversation-service";
import { createSilentLogger } from "@brains/utils";
import type { Logger } from "@brains/utils";
import { createConversationDatabase } from "../src/database";
import type { ConversationDB } from "../src/database";
import type { ConversationServiceConfig } from "../src/types";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Client } from "@libsql/client";

describe("ConversationService", () => {
  let service: ConversationService;
  let db: ConversationDB;
  let client: Client;
  let logger: Logger;
  let config: ConversationServiceConfig;
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), "conversation-test-"));
    const dbPath = join(tempDir, "test.db");

    // Create real database for testing
    const dbSetup = createConversationDatabase({ url: `file:${dbPath}` });
    db = dbSetup.db;
    client = dbSetup.client;

    // Run migrations to create tables
    await client.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        interface_type TEXT NOT NULL,
        started TEXT NOT NULL,
        last_active TEXT NOT NULL,
        metadata TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS summary_tracking (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        last_summarized_at TEXT,
        last_message_id TEXT,
        messages_since_summary INTEGER DEFAULT 0,
        updated TEXT NOT NULL
      )
    `);

    // Create silent logger for tests
    logger = createSilentLogger();

    // Create config
    config = {
      workingMemorySize: 20,
    };

    // Create service with real database
    service = ConversationService.createFresh(db, logger, config);
  });

  afterEach(async () => {
    // Clean up
    client.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("startConversation", () => {
    it("should create a new conversation using sessionId as conversationId", async () => {
      const sessionId = "test-session-123";
      const interfaceType = "cli";

      const conversationId = await service.startConversation(
        sessionId,
        interfaceType,
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

      // Start conversation first time
      await service.startConversation(sessionId, interfaceType);

      // Start conversation second time
      const conversationId = await service.startConversation(
        sessionId,
        interfaceType,
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
      await service.startConversation(conversationId, "cli");

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

  describe("getRecentMessages", () => {
    it("should retrieve messages in chronological order", async () => {
      const conversationId = "conv-123";

      // Create conversation
      await service.startConversation(conversationId, "cli");

      // Add messages
      await service.addMessage(conversationId, "user", "First message");
      await service.addMessage(conversationId, "assistant", "Second message");
      await service.addMessage(conversationId, "user", "Third message");

      const result = await service.getRecentMessages(conversationId);

      expect(result).toHaveLength(3);
      expect(result[0]?.content).toBe("First message");
      expect(result[1]?.content).toBe("Second message");
      expect(result[2]?.content).toBe("Third message");
    });

    it("should limit the number of messages retrieved", async () => {
      const conversationId = "conv-123";
      const limit = 2;

      // Create conversation
      await service.startConversation(conversationId, "cli");

      // Add more messages than limit
      await service.addMessage(conversationId, "user", "Message 1");
      await service.addMessage(conversationId, "assistant", "Message 2");
      await service.addMessage(conversationId, "user", "Message 3");

      const result = await service.getRecentMessages(conversationId, limit);

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

      await service.startConversation(conversationId, interfaceType);

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

  describe("getWorkingMemory", () => {
    it("should format recent messages as conversation transcript", async () => {
      const conversationId = "conv-123";

      // Create conversation and add messages
      await service.startConversation(conversationId, "cli");
      await service.addMessage(conversationId, "user", "Hello");
      await service.addMessage(conversationId, "assistant", "Hi there!");
      await service.addMessage(conversationId, "user", "How are you?");

      const result = await service.getWorkingMemory(conversationId);

      expect(result).toBe(
        "User: Hello\n\nAssistant: Hi there!\n\nUser: How are you?",
      );
    });

    it("should return empty string for conversation with no messages", async () => {
      const conversationId = "conv-empty";
      await service.startConversation(conversationId, "cli");

      const result = await service.getWorkingMemory(conversationId);

      expect(result).toBe("");
    });
  });

  describe("searchConversations", () => {
    it("should search conversations by content", async () => {
      // Create conversation with searchable content
      await service.startConversation("conv-1", "cli");
      await service.addMessage("conv-1", "user", "This is a test message");

      // Create another conversation without the search term
      await service.startConversation("conv-2", "cli");
      await service.addMessage("conv-2", "user", "Different content");

      const result = await service.searchConversations("test");

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("conv-1");
    });
  });
});
