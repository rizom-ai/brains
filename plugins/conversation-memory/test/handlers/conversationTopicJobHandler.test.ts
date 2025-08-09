import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ConversationTopicJobHandler } from "../../src/handlers/conversationTopicJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import { createTestConversationDatabase } from "../helpers/test-conversation-db";
import {
  messages,
  conversations,
  summaryTracking,
} from "../../src/schema/conversations";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";

describe("ConversationTopicJobHandler", () => {
  let handler: ConversationTopicJobHandler;
  let mockContext: ServicePluginContext;
  let db: LibSQLDatabase<Record<string, never>>;
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDb = await createTestConversationDatabase();
    db = testDb.db;
    client = testDb.client;
    cleanup = testDb.cleanup;

    // Create a mock context with the necessary services
    mockContext = {
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      entityService: {
        search: mock(() => Promise.resolve([])), // No similar topics by default
        createEntity: mock(() => Promise.resolve()),
        updateEntity: mock(() => Promise.resolve()),
      },
      generateContent: mock(() =>
        Promise.resolve({
          title: "Test Topic",
          keyTakeaways: ["Point 1", "Point 2"],
          context: "Test context",
          summary: "Test summary",
        }),
      ),
      formatContent: mock((templateName, data) => {
        return `# ${data.title}\n\n## Key Takeaways\n${data.keyTakeaways.join("\n")}\n\n## Context\n${data.context}\n\n## Summary\n${data.summary}`;
      }),
    } as any;

    handler = new ConversationTopicJobHandler(db as any, mockContext, {
      summarization: {
        batchSize: 5,
        overlapPercentage: 0.2,
        similarityThreshold: 0.7,
        targetLength: 200,
        maxLength: 500,
      },
    } as any);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("job validation", () => {
    it("should accept valid job data", () => {
      const validData = { conversationId: "conv-123" };
      const result = handler.validateAndParse(validData);

      expect(result).toEqual(validData);
    });

    it("should reject invalid job data", () => {
      const invalidData = { notConversationId: "wrong" };
      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("topic generation", () => {
    it("should generate a topic from conversation messages", async () => {
      // Setup: Create a conversation with messages
      const conversationId = "test-conv-1";
      const now = new Date().toISOString();
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-1",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        created: now,
        updated: now,
      });

      await db.insert(summaryTracking).values({
        conversationId,
        lastSummarizedAt: null,
        lastMessageId: null,
        messagesSinceSummary: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      // Add test messages
      const testMessages = [
        {
          id: "msg-1",
          conversationId,
          role: "user" as const,
          content: "How do I implement async processing?",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-2",
          conversationId,
          role: "assistant" as const,
          content: "You can use promises and async/await",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-3",
          conversationId,
          role: "user" as const,
          content: "Can you show an example?",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-4",
          conversationId,
          role: "assistant" as const,
          content: "Here's an example: async function process() {...}",
          timestamp: new Date().toISOString(),
        },
        {
          id: "msg-5",
          conversationId,
          role: "user" as const,
          content: "Thanks, that helps!",
          timestamp: new Date().toISOString(),
        },
      ];
      await db.insert(messages).values(testMessages);

      // Execute the job
      const mockProgressReporter: ProgressReporter = {
        report: mock(() => {}),
      } as any;

      await handler.process(
        { conversationId },
        "job-123",
        mockProgressReporter,
      );

      // Verify that content was generated and entity was created
      expect(mockContext.generateContent).toHaveBeenCalled();
      expect(mockContext.formatContent).toHaveBeenCalled();
      expect(mockContext.entityService.createEntity).toHaveBeenCalled();
    });

    it("should merge with existing similar topics", async () => {
      // Setup similar to above but with existing topic in search results
      const conversationId = "test-conv-2";
      const now = new Date().toISOString();
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-2",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        created: now,
        updated: now,
      });

      await db.insert(summaryTracking).values({
        conversationId,
        lastSummarizedAt: null,
        lastMessageId: null,
        messagesSinceSummary: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      // Add more messages to ensure there's content to process
      const timestamp = new Date().toISOString();
      await db.insert(messages).values([
        {
          id: "msg-10",
          conversationId,
          role: "user" as const,
          content: "Test message 1",
          timestamp,
        },
        {
          id: "msg-11",
          conversationId,
          role: "assistant" as const,
          content: "Test response 1",
          timestamp,
        },
        {
          id: "msg-12",
          conversationId,
          role: "user" as const,
          content: "Test message 2",
          timestamp,
        },
        {
          id: "msg-13",
          conversationId,
          role: "assistant" as const,
          content: "Test response 2",
          timestamp,
        },
        {
          id: "msg-14",
          conversationId,
          role: "user" as const,
          content: "Test message 3",
          timestamp,
        },
      ]);

      // Mock finding a similar existing topic
      mockContext.entityService.search = mock(() =>
        Promise.resolve([
          {
            entity: {
              id: "existing-topic",
              content: "Existing content",
              metadata: { title: "Existing Topic", messageCount: 10 },
            },
            score: 0.8, // Above threshold
          },
        ]),
      );

      const mockProgressReporter: ProgressReporter = {
        report: mock(() => {}),
      } as any;

      await handler.process(
        { conversationId },
        "job-124",
        mockProgressReporter,
      );

      // Verify that update was called instead of create
      expect(mockContext.entityService.updateEntity).toHaveBeenCalled();
      expect(mockContext.entityService.createEntity).not.toHaveBeenCalled();
    });

    it("should skip processing when no messages are available", async () => {
      const conversationId = "empty-conv";
      const now = new Date().toISOString();
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-3",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        created: now,
        updated: now,
      });

      await db.insert(summaryTracking).values({
        conversationId,
        lastSummarizedAt: new Date().toISOString(),
        lastMessageId: "msg-999", // Non-existent message
        messagesSinceSummary: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      const mockProgressReporter: ProgressReporter = {
        report: mock(() => {}),
      } as any;

      await handler.process(
        { conversationId },
        "job-125",
        mockProgressReporter,
      );

      // Verify that no content generation or entity creation happened
      expect(mockContext.generateContent).not.toHaveBeenCalled();
      expect(mockContext.entityService.createEntity).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle missing conversation gracefully", async () => {
      const mockProgressReporter: ProgressReporter = {
        report: mock(() => {}),
      } as any;

      await expect(
        handler.process(
          { conversationId: "non-existent" },
          "job-126",
          mockProgressReporter,
        ),
      ).rejects.toThrow("Conversation non-existent not found");
    });

    it("should handle missing tracking data", async () => {
      const conversationId = "conv-no-tracking";
      const now = new Date().toISOString();
      await db.insert(conversations).values({
        id: conversationId,
        sessionId: "session-4",
        interfaceType: "cli",
        started: now,
        lastActive: now,
        created: now,
        updated: now,
      });

      const mockProgressReporter: ProgressReporter = {
        report: mock(() => {}),
      } as any;

      await expect(
        handler.process({ conversationId }, "job-127", mockProgressReporter),
      ).rejects.toThrow(`No tracking found for conversation ${conversationId}`);
    });
  });
});
