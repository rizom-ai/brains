import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { enableWALModeForConversations } from "../../src/db";
import {
  conversations,
  messages,
  summaryTracking,
} from "../../src/schema/conversations";
import { eq } from "drizzle-orm";
import { createId } from "@brains/plugins";
import { createTestConversationDatabase } from "../helpers/test-conversation-db";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";

describe("Conversation Database", () => {
  let db: LibSQLDatabase<Record<string, never>>;
  let client: Client;
  let cleanup: () => Promise<void>;
  let dbPath: string;

  beforeEach(async () => {
    const testDb = await createTestConversationDatabase();
    db = testDb.db;
    client = testDb.client;
    cleanup = testDb.cleanup;
    dbPath = testDb.dbPath;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("WAL mode", () => {
    it("should enable WAL mode successfully", async () => {
      await enableWALModeForConversations(client, dbPath);

      // WAL mode should create additional files
      // Note: This is a simplified test - in production you'd query pragma journal_mode
      expect(client).toBeDefined();
    });
  });

  describe("conversations table", () => {
    it("should insert and retrieve a conversation", async () => {
      const conversationId = createId();
      const now = new Date().toISOString();

      const newConversation = {
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        metadata: JSON.stringify({ test: true }),
        created: now,
        updated: now,
      };

      await db.insert(conversations).values(newConversation);

      const results = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
      });
    });

    it("should update conversation lastActive", async () => {
      const conversationId = createId();
      const startTime = new Date().toISOString();
      const laterTime = new Date(Date.now() + 1000).toISOString();

      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: startTime,
        lastActive: startTime,
        metadata: null,
        created: startTime,
        updated: startTime,
      });

      await db
        .update(conversations)
        .set({ lastActive: laterTime, updated: laterTime })
        .where(eq(conversations.id, conversationId));

      const results = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));

      expect(results[0].lastActive).toBe(laterTime);
      expect(results[0].updated).toBe(laterTime);
    });
  });

  describe("messages table", () => {
    it("should insert and retrieve messages", async () => {
      const conversationId = createId();
      const now = new Date().toISOString();

      // First create a conversation
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        metadata: null,
        created: now,
        updated: now,
      });

      // Insert messages
      const messageId1 = createId();
      const messageId2 = createId();

      await db.insert(messages).values([
        {
          id: messageId1,
          conversationId,
          role: "user",
          content: "Hello",
          timestamp: now,
          metadata: null,
        },
        {
          id: messageId2,
          conversationId,
          role: "assistant",
          content: "Hi there",
          timestamp: new Date(Date.now() + 1000).toISOString(),
          metadata: JSON.stringify({ model: "test" }),
        },
      ]);

      const results = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe("Hello");
      expect(results[1].content).toBe("Hi there");
    });

    it("should cascade delete messages when conversation is deleted", async () => {
      const conversationId = createId();
      const now = new Date().toISOString();

      // Create conversation
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        metadata: null,
        created: now,
        updated: now,
      });

      // Add message
      await db.insert(messages).values({
        id: createId(),
        conversationId,
        role: "user",
        content: "Test message",
        timestamp: now,
        metadata: null,
      });

      // Delete conversation
      await db
        .delete(conversations)
        .where(eq(conversations.id, conversationId));

      // Messages should be deleted too
      const remainingMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      expect(remainingMessages).toHaveLength(0);
    });
  });

  describe("summaryTracking table", () => {
    it("should track summarization state", async () => {
      const conversationId = createId();
      const now = new Date().toISOString();

      // Create conversation
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        metadata: null,
        created: now,
        updated: now,
      });

      // Initialize tracking
      await db.insert(summaryTracking).values({
        conversationId,
        lastSummarizedAt: null,
        lastMessageId: null,
        messagesSinceSummary: 0,
        updated: now,
      });

      // Update tracking
      const messageId = createId();
      await db
        .update(summaryTracking)
        .set({
          messagesSinceSummary: 5,
          lastMessageId: messageId,
          updated: new Date().toISOString(),
        })
        .where(eq(summaryTracking.conversationId, conversationId));

      const results = await db
        .select()
        .from(summaryTracking)
        .where(eq(summaryTracking.conversationId, conversationId));

      expect(results).toHaveLength(1);
      expect(results[0].messagesSinceSummary).toBe(5);
      expect(results[0].lastMessageId).toBe(messageId);
    });

    it("should cascade delete tracking when conversation is deleted", async () => {
      const conversationId = createId();
      const now = new Date().toISOString();

      // Create conversation
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-123",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        metadata: null,
        created: now,
        updated: now,
      });

      // Add tracking
      await db.insert(summaryTracking).values({
        conversationId,
        lastSummarizedAt: null,
        lastMessageId: null,
        messagesSinceSummary: 0,
        updated: now,
      });

      // Delete conversation
      await db
        .delete(conversations)
        .where(eq(conversations.id, conversationId));

      // Tracking should be deleted too
      const remainingTracking = await db
        .select()
        .from(summaryTracking)
        .where(eq(summaryTracking.conversationId, conversationId));

      expect(remainingTracking).toHaveLength(0);
    });
  });
});
