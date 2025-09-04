import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { DigestHandler } from "../../src/handlers/digest-handler";
import { SummaryExtractor } from "../../src/lib/summary-extractor";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type ConversationDigestPayload,
} from "@brains/plugins";
import type { SummaryEntity } from "../../src/schemas/summary";

describe("DigestHandler", () => {
  let handler: DigestHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "summary");

    // Reset singletons and create fresh instances
    DigestHandler.resetInstance();
    SummaryExtractor.resetInstance();
    handler = DigestHandler.createFresh(context, logger);
  });

  afterEach(() => {
    mock.restore();
  });

  describe("singleton pattern", () => {
    it("should return same instance with getInstance", () => {
      DigestHandler.resetInstance();
      const instance1 = DigestHandler.getInstance(context, logger);
      const instance2 = DigestHandler.getInstance(context, logger);
      expect(instance1).toBe(instance2);
    });

    it("should create new instance with createFresh", () => {
      const instance1 = DigestHandler.createFresh(context, logger);
      const instance2 = DigestHandler.createFresh(context, logger);
      expect(instance1).not.toBe(instance2);
    });

    it("should reset instance properly", () => {
      const instance1 = DigestHandler.getInstance(context, logger);
      DigestHandler.resetInstance();
      const instance2 = DigestHandler.getInstance(context, logger);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("handleDigest", () => {
    const createMockDigest = (
      overrides?: Partial<ConversationDigestPayload>,
    ): ConversationDigestPayload => ({
      conversationId: "conv-123",
      messageCount: 10,
      windowSize: 50,
      windowStart: 1,
      windowEnd: 50,
      messages: [
        { 
          id: "msg-1",
          conversationId: "conv-123",
          role: "assistant", 
          content: "Hello, how can I help you?",
          timestamp: "2025-01-01T00:00:00Z",
          metadata: null,
        },
        { 
          id: "msg-2",
          conversationId: "conv-123",
          role: "user", 
          content: "I need help with my project",
          timestamp: "2025-01-01T00:00:01Z",
          metadata: null,
        },
        { 
          id: "msg-3",
          conversationId: "conv-123",
          role: "assistant", 
          content: "Sure, let me assist you",
          timestamp: "2025-01-01T00:00:02Z",
          metadata: null,
        },
      ],
      timestamp: "2025-01-01T00:00:00Z",
      ...overrides,
    });

    it("should process digest for new conversation", async () => {
      const digest = createMockDigest();

      // Mock entity service to return no existing summary
      spyOn(context.entityService, "getEntity").mockResolvedValue(null);

      // Mock upsert to succeed
      const upsertSpy = spyOn(
        context.entityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "summary-conv-123",
        jobId: "job-123",
        created: true,
      });

      // Mock content generation for AI decision and summary
      const generateContentSpy = spyOn(context, "generateContent");
      
      // First call returns the decision
      generateContentSpy.mockResolvedValueOnce({
        decision: "new",
        title: "Project assistance discussion",
        reasoning: "First conversation about project help",
      });
      
      // Second call returns the summary content
      generateContentSpy.mockResolvedValueOnce({
        content: "User requested help with their project. Assistant offered to provide assistance.",
        keyPoints: ["User needs project help", "Assistant ready to assist"],
        decisions: [],
        actionItems: [],
        participants: ["user-1", "assistant"],
      });

      await handler.handleDigest(digest);

      // Verify upsert was called with a new summary
      expect(upsertSpy).toHaveBeenCalled();
      const upsertCall = upsertSpy.mock.calls[0];
      expect(upsertCall).toBeDefined();
      
      if (upsertCall) {
        const entity = upsertCall[0] as SummaryEntity;
        expect(entity.id).toBe("summary-conv-123");
        expect(entity.entityType).toBe("summary");
        expect(entity.content).toContain("Conversation Summary: conv-123");
        expect(entity.metadata?.conversationId).toBe("conv-123");
        expect(entity.metadata?.totalMessages).toBe(50);
      }
    });

    it("should update existing summary entry", async () => {
      const digest = createMockDigest({
        windowStart: 51,
        windowEnd: 100,
      });

      // Mock existing summary
      const existingSummary: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Initial discussion

Content: User asked about project setup
Window Start: 1
Window End: 50

---

`,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      spyOn(context.entityService, "getEntity").mockResolvedValue(
        existingSummary,
      );

      // Mock content generation for AI decision and summary
      const generateContentSpy = spyOn(context, "generateContent");
      
      // First call returns the decision to update
      generateContentSpy.mockResolvedValueOnce({
        decision: "update",
        entryIndex: 0,
        title: "Initial discussion",
        reasoning: "Continuation of the same topic",
      });
      
      // Second call returns the summary content
      generateContentSpy.mockResolvedValueOnce({
        content: "Continued discussion about project implementation details.",
        keyPoints: ["Project implementation"],
        decisions: [],
        actionItems: [],
        participants: ["user-1", "assistant"],
      });

      const upsertSpy = spyOn(
        context.entityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: existingSummary.id,
        jobId: "job-123",
        created: false,
      });

      await handler.handleDigest(digest);

      expect(upsertSpy).toHaveBeenCalled();
      const upsertCall = upsertSpy.mock.calls[0];
      
      if (upsertCall) {
        const entity = upsertCall[0] as SummaryEntity;
        expect(entity.content).toContain("UPDATE:");
        expect(entity.metadata?.totalMessages).toBe(100);
        expect(entity.metadata?.entryCount).toBe(1); // Still 1 entry, just updated
      }
    });

    it("should append new entry to existing summary", async () => {
      const digest = createMockDigest({
        windowStart: 51,
        windowEnd: 100,
        messages: [
          { 
            id: "msg-4",
            conversationId: "conv-123",
            role: "user", 
            content: "Let's move on to a different topic",
            timestamp: "2025-01-01T00:01:00Z",
            metadata: null,
          },
          { 
            id: "msg-5",
            conversationId: "conv-123",
            role: "assistant", 
            content: "Sure, what would you like to discuss?",
            timestamp: "2025-01-01T00:01:01Z",
            metadata: null,
          },
          { 
            id: "msg-6",
            conversationId: "conv-123",
            role: "user", 
            content: "I want to learn about testing",
            timestamp: "2025-01-01T00:01:02Z",
            metadata: null,
          },
        ],
      });

      const existingSummary: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Project setup

Content: Initial project discussion
Window Start: 1
Window End: 50

---

`,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      spyOn(context.entityService, "getEntity").mockResolvedValue(
        existingSummary,
      );

      // Mock content generation for AI decision and summary
      const generateContentSpy = spyOn(context, "generateContent");
      
      // First call returns the decision for new entry
      generateContentSpy.mockResolvedValueOnce({
        decision: "new",
        title: "Testing discussion",
        reasoning: "New topic introduced",
      });
      
      // Second call returns the summary content
      generateContentSpy.mockResolvedValueOnce({
        content: "User wants to learn about testing. Assistant is ready to help.",
        keyPoints: ["Testing discussion"],
        decisions: [],
        actionItems: ["Learn about testing"],
        participants: ["user", "assistant"],
      });

      const upsertSpy = spyOn(
        context.entityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: existingSummary.id,
        jobId: "job-123",
        created: false,
      });

      await handler.handleDigest(digest);

      expect(upsertSpy).toHaveBeenCalled();
      const upsertCall = upsertSpy.mock.calls[0];
      
      if (upsertCall) {
        const entity = upsertCall[0] as SummaryEntity;
        expect(entity.content).toContain("Testing discussion");
        expect(entity.content).toContain("Project setup"); // Old entry still there
        expect(entity.metadata?.totalMessages).toBe(100);
        expect(entity.metadata?.entryCount).toBe(2); // Now 2 entries
      }
    });

    it("should handle errors gracefully", async () => {
      const digest = createMockDigest();

      // Mock entity service to throw error
      spyOn(context.entityService, "getEntity").mockRejectedValue(
        new Error("Database error"),
      );

      // Should not throw, but log error
      await handler.handleDigest(digest);
      // If we get here, it didn't throw
      expect(true).toBe(true);
    });

    it("should handle empty digest messages", async () => {
      const digest = createMockDigest({
        messages: [],
        messageCount: 0,
      });

      spyOn(context.entityService, "getEntity").mockResolvedValue(null);

      // Mock content generation for empty messages
      const generateContentSpy = spyOn(context, "generateContent");
      
      generateContentSpy.mockResolvedValueOnce({
        decision: "new",
        title: "Empty conversation",
        reasoning: "No messages to summarize",
      });
      
      generateContentSpy.mockResolvedValueOnce({
        content: "No conversation content available.",
        keyPoints: [],
        decisions: [],
        actionItems: [],
        participants: [],
      });

      const upsertSpy = spyOn(
        context.entityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: "summary-conv-123",
        jobId: "job-123",
        created: true,
      });

      await handler.handleDigest(digest);

      expect(upsertSpy).toHaveBeenCalled();
    });

    it("should preserve metadata when updating", async () => {
      const digest = createMockDigest({
        windowEnd: 75,
      });

      const existingSummary: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: "# Conversation Summary: conv-123\n\nExisting content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 2,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      spyOn(context.entityService, "getEntity").mockResolvedValue(
        existingSummary,
      );

      const generateContentSpy = spyOn(context, "generateContent");
      
      generateContentSpy.mockResolvedValueOnce({
        decision: "new",
        title: "Continuation",
        reasoning: "New content",
      });
      
      generateContentSpy.mockResolvedValueOnce({
        content: "More discussion content.",
        keyPoints: [],
        decisions: [],
        actionItems: [],
        participants: ["user-1", "assistant"],
      });

      const upsertSpy = spyOn(
        context.entityService,
        "upsertEntity",
      ).mockResolvedValue({
        entityId: existingSummary.id,
        jobId: "job-123",
        created: false,
      });

      await handler.handleDigest(digest);

      const upsertCall = upsertSpy.mock.calls[0];
      if (upsertCall) {
        const entity = upsertCall[0] as SummaryEntity;
        expect(entity.metadata?.conversationId).toBe("conv-123");
        expect(entity.metadata?.totalMessages).toBe(75);
        expect(entity.created).toBe("2025-01-01T00:00:00Z"); // Preserved
      }
    });
  });
});