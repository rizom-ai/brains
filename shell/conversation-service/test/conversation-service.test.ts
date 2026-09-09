import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { ConversationService } from "../src/conversation-service";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import type { ConversationDB } from "../src/database";
import type {
  ConversationServiceConfig,
  ConversationMetadata,
  StartConversationRequest,
} from "../src/types";
import { createTestConversationDatabase } from "./helpers/test-conversation-db";
import type { Client } from "@libsql/client";
import { MessageBus } from "@brains/messaging-service";
import { coerceConversationMetadata } from "../src/metadata";

describe("ConversationService", () => {
  let service: ConversationService;
  let db: ConversationDB;
  let client: Client;
  let logger: Logger;
  let config: ConversationServiceConfig;
  let messageBus: MessageBus;
  let cleanup: () => Promise<void>;
  let dbPath: string;

  // Default test metadata
  const testMetadata: ConversationMetadata = {
    channelName: "Test Channel",
    interfaceType: "test",
    channelId: "test-channel",
  };

  beforeEach(async () => {
    // Create test database with migrations
    const testDb = await createTestConversationDatabase();
    db = testDb.db;
    client = testDb.client;
    cleanup = testDb.cleanup;
    dbPath = testDb.dbPath;

    // Create silent logger for tests
    logger = createSilentLogger();

    // Create MessageBus for tests
    messageBus = MessageBus.createFresh(logger);

    // Create config
    config = {};

    // Create service with real database
    service = ConversationService.createFresh(db, logger, messageBus, config);
  });

  afterEach(async () => {
    // Clean up
    await cleanup();
  });

  describe("guest transcript isolation", () => {
    const guestRequest: StartConversationRequest = {
      sessionId: "visitor-secret-id",
      interfaceType: guestInterfaceType,
      channelId: "visitor-secret-id",
      metadata: {
        ...testMetadata,
        interfaceType: guestInterfaceType,
        guest: { visitorId: "10c15c16-919e-4481-8fd4-07f11555a994" },
      },
    };

    it("keeps guest transcripts out of broadcasts, summaries and routine logs", async () => {
      const send = spyOn(messageBus, "send");
      const debug = spyOn(logger, "debug");
      await service.startConversation(guestRequest);
      for (let index = 0; index < 6; index++) {
        await service.addMessage({
          conversationId: guestRequest.sessionId,
          role: "user",
          content: "visitor private text",
        });
      }
      expect(await service.countMessages(guestRequest.sessionId)).toBe(6);
      expect(send).not.toHaveBeenCalled();
      const tracking = await client.execute("SELECT * FROM summary_tracking");
      expect(tracking.rows).toHaveLength(0);
      await service.updateConversationMetadata({
        conversationId: guestRequest.sessionId,
        metadata: { title: "visitor private title" },
      });
      await service.deleteConversation(guestRequest.sessionId);
      expect(JSON.stringify(debug.mock.calls)).not.toContain("visitor");
    });

    it("excludes guests from general search and enumeration even when explicitly filtered", async () => {
      await service.startConversation(guestRequest);
      await service.addMessage({
        conversationId: guestRequest.sessionId,
        role: "user",
        content: "shared search term",
      });
      await service.startConversation({
        ...guestRequest,
        sessionId: "operator",
        interfaceType: "web-chat",
      });
      await service.addMessage({
        conversationId: "operator",
        role: "user",
        content: "shared search term",
      });
      expect(
        (await service.listConversations()).map((entry) => entry.id),
      ).toEqual(["operator"]);
      expect(
        await service.listConversations({ interfaceType: guestInterfaceType }),
      ).toEqual([]);
      expect(
        (await service.searchConversations("shared search term")).map(
          (entry) => entry.id,
        ),
      ).toEqual(["operator"]);
      expect(
        await service.searchConversations(
          "shared search term",
          guestRequest.sessionId,
        ),
      ).toEqual([]);
      expect(await service.getMessages(guestRequest.sessionId)).toHaveLength(1);
    });

    it("rejects scope changes and authenticated ownership on guest creation", async () => {
      await service.startConversation(guestRequest);
      expect(
        service.startConversation({
          ...guestRequest,
          interfaceType: "web-chat",
          personId: "owner",
        }),
      ).rejects.toThrow("Conversation scope mismatch");
      expect(
        service.startConversation({
          ...guestRequest,
          sessionId: "other",
          personId: "owner",
        }),
      ).rejects.toThrow(
        "Guest conversation cannot have an authenticated owner",
      );
      await service.startConversation({
        ...guestRequest,
        sessionId: "operator",
        interfaceType: "web-chat",
      });
      expect(
        service.startConversation({ ...guestRequest, sessionId: "operator" }),
      ).rejects.toThrow("Conversation scope mismatch");
    });

    it("rejects missing ownership and prevents metadata updates from changing owners", async () => {
      expect(
        service.startConversation({ ...guestRequest, metadata: testMetadata }),
      ).rejects.toThrow("Guest ownership required");
      await service.startConversation(guestRequest);
      expect(
        service.updateConversationMetadata({
          conversationId: guestRequest.sessionId,
          metadata: {
            guest: { visitorId: "c92c7734-1d75-408f-8b4a-fc40e7d58679" },
          },
        }),
      ).rejects.toThrow("Guest ownership cannot be changed");
    });

    it("prevents a late insert when deletion wins after the existence check", async () => {
      await service.startConversation(guestRequest);
      const other = ConversationService.createFreshFromConfig(
        logger,
        messageBus,
        { url: `file:${dbPath}` },
      );
      await other.initialize();
      const getConversation = service.getConversation.bind(service);
      const lookup = spyOn(service, "getConversation").mockImplementation(
        async (id) => {
          const stale = await getConversation(id);
          await other.deleteConversation(id);
          return stale;
        },
      );
      try {
        expect(
          service.addMessage({
            conversationId: guestRequest.sessionId,
            role: "assistant",
            content: "late private result",
          }),
        ).rejects.toThrow("Guest conversation write unavailable");
        expect(await service.getMessages(guestRequest.sessionId)).toEqual([]);
        expect(await getConversation(guestRequest.sessionId)).toBeNull();
      } finally {
        lookup.mockRestore();
        other.close();
      }
    });

    it("does not recreate messages after deletion, including from another connection", async () => {
      await service.startConversation(guestRequest);
      await service.addMessage({
        conversationId: guestRequest.sessionId,
        role: "user",
        content: "private text",
      });
      const other = ConversationService.createFreshFromConfig(
        logger,
        messageBus,
        { url: `file:${dbPath}` },
      );
      try {
        await other.initialize();
        await other.deleteConversation(guestRequest.sessionId);
        expect(
          service.addMessage({
            conversationId: guestRequest.sessionId,
            role: "assistant",
            content: "late result",
          }),
        ).rejects.toThrow("Conversation unavailable");
        expect(
          await service.getConversation(guestRequest.sessionId),
        ).toBeNull();
        expect(await service.getMessages(guestRequest.sessionId)).toEqual([]);
      } finally {
        other.close();
      }
    });
  });

  describe("person ownership migration", () => {
    it("adds a nullable indexed owner without changing channel routing", async () => {
      const columns = await client.execute("PRAGMA table_info(conversations)");
      const indexes = await client.execute("PRAGMA index_list(conversations)");

      expect(
        columns.rows.find((row) => row["name"] === "person_id"),
      ).toMatchObject({ notnull: 0 });
      expect(indexes.rows.map((row) => row["name"])).toContain(
        "idx_conversations_person",
      );
    });
  });

  describe("database readiness", () => {
    it("applies the busy timeout so concurrent writers wait instead of failing", async () => {
      const owned = ConversationService.createFreshFromConfig(
        logger,
        messageBus,
        { url: `file:${dbPath}` },
      );

      try {
        await owned.initialize();

        const ownedClient = owned.getDatabaseClient();
        const busyTimeout = await ownedClient.execute("PRAGMA busy_timeout");
        expect(busyTimeout.rows[0]?.["timeout"]).toBe(5000);
      } finally {
        owned.close();
      }
    });
  });

  describe("fresh owned instances", () => {
    it("opens and closes its database from config independently", async () => {
      const owned = ConversationService.createFreshFromConfig(
        logger,
        messageBus,
        { url: `file:${dbPath}` },
      );

      await owned.startConversation({
        sessionId: "owned-instance",
        interfaceType: "test",
        channelId: "owned-instance",
        metadata: testMetadata,
      });
      owned.close();

      let closeError: unknown;
      try {
        await owned.getConversation("owned-instance");
      } catch (error) {
        closeError = error;
      }
      const errorText =
        String(closeError) +
        (closeError instanceof Error && closeError.cause
          ? String(closeError.cause)
          : "");
      expect(errorText).toContain("CLIENT_CLOSED");
    });
  });

  describe("startConversation", () => {
    it("should create a new conversation using sessionId as conversationId", async () => {
      const sessionId = "test-session-123";
      const interfaceType = "cli";
      const channelId = "test-channel";

      const conversationId = await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: testMetadata,
      });

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
      await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: testMetadata,
      });

      // Start conversation second time
      const conversationId = await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: testMetadata,
      });

      expect(conversationId).toBe(sessionId);

      // Verify only one conversation exists
      const result = await client.execute({
        sql: "SELECT COUNT(*) as count FROM conversations WHERE id = ?",
        args: [sessionId],
      });
      expect(result.rows[0]?.["count"]).toBe(1);
    });

    it("should store conversation metadata with channel name", async () => {
      const sessionId = "test-with-metadata";
      const interfaceType = "matrix";
      const channelId = "!room123:matrix.org";
      const metadata: ConversationMetadata = {
        channelName: "Test Room",
        interfaceType,
        channelId,
      };

      await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: metadata,
      });

      // Verify metadata was stored correctly
      const result = await client.execute({
        sql: "SELECT metadata FROM conversations WHERE id = ?",
        args: [sessionId],
      });

      const storedMetadata = coerceConversationMetadata(
        result.rows[0]?.["metadata"],
      );
      expect(storedMetadata["channelName"]).toBe("Test Room");
    });

    it("stores an optional person owner without claiming legacy conversations", async () => {
      await service.startConversation({
        sessionId: "owned-web-session",
        interfaceType: "web-chat",
        channelId: "owned-web-session",
        personId: "prsn_owner",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "legacy-cli-session",
        interfaceType: "cli",
        channelId: "legacy-cli-session",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "owned-web-session",
        interfaceType: "web-chat",
        channelId: "owned-web-session",
        personId: "prsn_other",
        metadata: testMetadata,
      });

      expect(await service.getConversation("owned-web-session")).toMatchObject({
        personId: "prsn_owner",
        channelId: "owned-web-session",
      });
      expect(await service.getConversation("legacy-cli-session")).toMatchObject(
        {
          personId: null,
        },
      );
    });

    it("should preserve existing metadata when resuming conversation", async () => {
      const sessionId = "existing-with-metadata";
      const interfaceType = "cli";
      const channelId = "cli-channel";
      const metadata: ConversationMetadata = {
        channelName: "CLI Terminal",
        interfaceType,
        channelId,
      };

      // Start conversation first time with metadata
      await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: metadata,
      });

      // Resume conversation with different metadata (should not update)
      const differentMetadata: ConversationMetadata = {
        channelName: "Different Name",
        interfaceType,
        channelId,
      };
      await service.startConversation({
        sessionId: sessionId,
        interfaceType: interfaceType,
        channelId: channelId,
        metadata: differentMetadata,
      });

      // Verify original metadata is preserved
      const result = await client.execute({
        sql: "SELECT metadata FROM conversations WHERE id = ?",
        args: [sessionId],
      });

      const storedMetadata = coerceConversationMetadata(
        result.rows[0]?.["metadata"],
      );
      expect(storedMetadata["channelName"]).toBe("CLI Terminal");
    });
  });

  describe("addMessage", () => {
    it("should add a message to the conversation", async () => {
      const conversationId = "conv-123";
      const role = "user";
      const content = "Test message";
      const metadata = { key: "value" };

      // First create a conversation
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });

      // Add message
      await service.addMessage({
        conversationId: conversationId,
        role: role,
        content: content,
        metadata: metadata,
      });

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
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });

      // Add messages
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "First message",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Second message",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Third message",
      });

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
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });

      // Add more messages than limit
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

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

      await service.startConversation({
        sessionId: conversationId,
        interfaceType: interfaceType,
        channelId: "test-channel",
        metadata: testMetadata,
      });

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

  describe("listConversations", () => {
    it("should list conversations newest active first with limit", async () => {
      await service.startConversation({
        sessionId: "conv-list-1",
        interfaceType: "cli",
        channelId: "channel-1",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "conv-list-2",
        interfaceType: "cli",
        channelId: "channel-2",
        metadata: testMetadata,
      });

      const result = await service.listConversations({ limit: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("conv-list-2");
    });

    it("should filter conversations by updatedAfter", async () => {
      await service.startConversation({
        sessionId: "conv-list-filter",
        interfaceType: "cli",
        channelId: "channel",
        metadata: testMetadata,
      });

      const future = new Date(Date.now() + 60_000).toISOString();
      const result = await service.listConversations({ updatedAfter: future });

      expect(result).toHaveLength(0);
    });

    it("should filter conversations by their person owner", async () => {
      await service.startConversation({
        sessionId: "person-one-session",
        interfaceType: "web-chat",
        channelId: "person-one-channel",
        personId: "prsn_one",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "person-two-session",
        interfaceType: "web-chat",
        channelId: "person-two-channel",
        personId: "prsn_two",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "unowned-session",
        interfaceType: "cli",
        channelId: "unowned-channel",
        metadata: testMetadata,
      });

      const result = await service.listConversations({
        interfaceType: "web-chat",
        personId: "prsn_one",
      });

      expect(result.map((conversation) => conversation.id)).toEqual([
        "person-one-session",
      ]);
    });

    it("should filter conversations by interface, session, and channel", async () => {
      await service.startConversation({
        sessionId: "web-session",
        interfaceType: "web-chat",
        channelId: "web-channel",
        metadata: testMetadata,
      });
      await service.startConversation({
        sessionId: "discord-session",
        interfaceType: "discord",
        channelId: "discord-channel",
        metadata: testMetadata,
      });

      const result = await service.listConversations({
        interfaceType: "web-chat",
        sessionId: "web-session",
        channelId: "web-channel",
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("web-session");
    });
  });

  describe("updateConversationMetadata", () => {
    it("should merge conversation metadata without removing existing fields", async () => {
      const conversationId = "conv-rename";
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "web-chat",
        channelId: "web-channel",
        metadata: {
          channelName: "Web Chat",
          interfaceType: "web-chat",
          channelId: "web-channel",
        },
      });

      const updated = await service.updateConversationMetadata({
        conversationId,
        metadata: { title: "Renamed thread" },
      });

      const conversation = await service.getConversation(conversationId);
      const metadata = JSON.parse(conversation?.metadata ?? "{}");

      expect(updated).toBe(true);
      expect(metadata).toEqual({
        channelName: "Web Chat",
        interfaceType: "web-chat",
        channelId: "web-channel",
        title: "Renamed thread",
      });
    });

    it("should report false when updating metadata for a missing conversation", async () => {
      const updated = await service.updateConversationMetadata({
        conversationId: "missing-conversation",
        metadata: { title: "Missing" },
      });

      expect(updated).toBe(false);
    });
  });

  describe("deleteConversation", () => {
    it("should delete a conversation and cascade related rows", async () => {
      const conversationId = "conv-delete";
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "web-chat",
        channelId: "web-channel",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId,
        role: "user",
        content: "Delete this thread",
      });

      const deleted = await service.deleteConversation(conversationId);

      expect(deleted).toBe(true);
      expect(await service.getConversation(conversationId)).toBeNull();
      expect(await service.getMessages(conversationId)).toEqual([]);
      expect(await service.countMessages(conversationId)).toBe(0);

      const tracking = await client.execute({
        sql: "SELECT * FROM summary_tracking WHERE conversation_id = ?",
        args: [conversationId],
      });
      expect(tracking.rows).toHaveLength(0);
    });

    it("should report false when deleting a missing conversation", async () => {
      const deleted = await service.deleteConversation("missing-conversation");

      expect(deleted).toBe(false);
    });
  });

  describe("getMessages with range", () => {
    it("should retrieve messages in specified range", async () => {
      const conversationId = "conv-range";

      // Create conversation and add messages
      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 4",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 5",
      });

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

      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

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

      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

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

      await service.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test-channel",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await service.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

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
      await service.startConversation({
        sessionId: "conv-1",
        interfaceType: "cli",
        channelId: "channel-1",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: "conv-1",
        role: "user",
        content: "This is a test message",
      });

      // Create another conversation without the search term
      await service.startConversation({
        sessionId: "conv-2",
        interfaceType: "cli",
        channelId: "channel-2",
        metadata: testMetadata,
      });
      await service.addMessage({
        conversationId: "conv-2",
        role: "user",
        content: "Different content",
      });

      const result = await service.searchConversations("test");

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("conv-1");
    });
  });

  describe("digest window calculations", () => {
    it("should calculate correct window ranges for small conversations", async () => {
      // Create a service that can access private methods for testing
      const testService = ConversationService.createFresh(
        db,
        logger,
        messageBus,
        {
          digestTriggerInterval: 2,
          digestWindowSize: 5,
        },
      );

      const conversationId = "test-window";
      await testService.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test",
        metadata: testMetadata,
      });

      // Add some messages
      await testService.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await testService.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await testService.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

      // Test getMessages with range (this is the same logic digest uses)
      const window1to2 = await testService.getMessages(conversationId, {
        range: { start: 1, end: 2 },
      });
      expect(window1to2).toHaveLength(2);
      expect(window1to2[0]?.content).toBe("Message 1");
      expect(window1to2[1]?.content).toBe("Message 2");

      const window1to3 = await testService.getMessages(conversationId, {
        range: { start: 1, end: 3 },
      });
      expect(window1to3).toHaveLength(3);
      expect(window1to3[2]?.content).toBe("Message 3");
    });

    it("should handle window ranges larger than available messages", async () => {
      const testService = ConversationService.createFresh(
        db,
        logger,
        messageBus,
        {
          digestTriggerInterval: 10,
          digestWindowSize: 20,
        },
      );

      const conversationId = "test-large-window";
      await testService.startConversation({
        sessionId: conversationId,
        interfaceType: "cli",
        channelId: "test",
        metadata: testMetadata,
      });

      // Add only 3 messages
      await testService.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 1",
      });
      await testService.addMessage({
        conversationId: conversationId,
        role: "assistant",
        content: "Message 2",
      });
      await testService.addMessage({
        conversationId: conversationId,
        role: "user",
        content: "Message 3",
      });

      // Request window larger than available messages
      const largeWindow = await testService.getMessages(conversationId, {
        range: { start: 1, end: 20 },
      });

      // Should return only available messages
      expect(largeWindow).toHaveLength(3);
      expect(largeWindow[0]?.content).toBe("Message 1");
      expect(largeWindow[2]?.content).toBe("Message 3");
    });
  });
});
