import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  MessageEventHandler,
  type ConversationMessageEvent,
} from "../../src/handlers/message-event-handler";
import type { LinkConfig } from "../../src/schemas/link";
import {
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";
import { MockShell } from "@brains/plugins/test";
import type { MessageWithPayload } from "@brains/messaging-service";

describe("MessageEventHandler", () => {
  let handler: MessageEventHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let config: LinkConfig;

  // Helper to create a properly typed message
  const createMessage = (
    event: ConversationMessageEvent,
  ): MessageWithPayload<ConversationMessageEvent> => ({
    id: "msg-id",
    timestamp: new Date().toISOString(),
    type: "conversation:messageAdded",
    source: "conversation-service",
    payload: event,
  });

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");

    // Default config with auto-capture enabled
    config = {
      enableSummarization: true,
      autoExtractKeywords: true,
      enableAutoCapture: true,
      notifyOnCapture: false,
      maxUrlsPerMessage: 3,
    };

    // Reset singleton and create fresh instance
    MessageEventHandler.resetInstance();
    handler = MessageEventHandler.createFresh(context, config);

    // Mock enqueueJob
    context.enqueueJob = mock(async () => "job-id-123");
  });

  describe("handleMessage", () => {
    it("should extract and enqueue URLs from user messages", async () => {
      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content:
          "Check out https://example.com and http://github.com/user/repo",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should enqueue jobs for both URLs
      expect(context.enqueueJob).toHaveBeenCalledTimes(2);
      expect(context.enqueueJob).toHaveBeenCalledWith(
        "auto-capture",
        {
          url: "https://example.com",
          metadata: {
            conversationId: "conv-123",
            messageId: "msg-789",
            userId: "user-456",
            timestamp: expect.stringContaining("T"),
          },
        },
        {
          priority: 5,
          maxRetries: 2,
          source: "plugin:link",
          metadata: {
            rootJobId: expect.stringContaining("link-auto-capture-"),
            operationType: "data_processing",
            pluginId: "link",
          },
        },
      );
      expect(context.enqueueJob).toHaveBeenCalledWith(
        "auto-capture",
        {
          url: "http://github.com/user/repo",
          metadata: {
            conversationId: "conv-123",
            messageId: "msg-789",
            userId: "user-456",
            timestamp: expect.stringContaining("T"),
          },
        },
        {
          priority: 5,
          maxRetries: 2,
          source: "plugin:link",
          metadata: {
            rootJobId: expect.stringContaining("link-auto-capture-"),
            operationType: "data_processing",
            pluginId: "link",
          },
        },
      );
    });

    it("should skip assistant messages", async () => {
      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "Here's a link: https://example.com",
        role: "assistant",
        metadata: {},
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should not enqueue any jobs
      expect(context.enqueueJob).not.toHaveBeenCalled();
    });

    it("should skip when auto-capture is disabled", async () => {
      // Create handler with auto-capture disabled
      config.enableAutoCapture = false;
      handler = MessageEventHandler.createFresh(context, config);

      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "Check out https://example.com",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should not enqueue any jobs
      expect(context.enqueueJob).not.toHaveBeenCalled();
    });

    it("should respect maxUrlsPerMessage limit", async () => {
      config.maxUrlsPerMessage = 2;
      handler = MessageEventHandler.createFresh(context, config);

      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content:
          "Links: https://example1.com https://example2.com https://example3.com https://example4.com",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should only enqueue first 2 URLs
      expect(context.enqueueJob).toHaveBeenCalledTimes(2);
    });

    it("should handle messages with no URLs", async () => {
      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "This message has no links",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should not enqueue any jobs
      expect(context.enqueueJob).not.toHaveBeenCalled();
    });

    it("should skip invalid URLs", async () => {
      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "Check out ftp://files.com and https://example.com",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should only enqueue valid HTTP/HTTPS URL
      expect(context.enqueueJob).toHaveBeenCalledTimes(1);
      expect(context.enqueueJob).toHaveBeenCalledWith(
        "auto-capture",
        expect.objectContaining({
          url: "https://example.com",
        }),
        expect.any(Object),
      );
    });

    it("should handle enqueue errors gracefully", async () => {
      // Mock enqueueJob to throw error for second URL
      let callCount = 0;
      context.enqueueJob = mock(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Enqueue failed");
        }
        return `job-id-${callCount}`;
      });

      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "Links: https://example1.com https://example2.com",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();

      // Should not throw, just log error
      await expect(messageHandler(createMessage(event))).resolves.toEqual({
        success: true,
      });

      // Both URLs should be attempted
      expect(context.enqueueJob).toHaveBeenCalledTimes(2);
    });

    it("should handle message processing errors gracefully", async () => {
      // Create event with invalid structure to trigger error
      const event = {
        // Missing required fields
        content: "https://example.com",
      } as ConversationMessageEvent;

      const messageHandler = handler.getHandler();

      // Should not throw, just log error
      await expect(messageHandler(createMessage(event))).resolves.toEqual({
        success: true,
      });
    });

    it("should deduplicate URLs within same message", async () => {
      const event: ConversationMessageEvent = {
        conversationId: "conv-123",
        messageId: "msg-789",
        content: "Check https://example.com and again https://example.com",
        role: "user",
        metadata: { userId: "user-456" },
        timestamp: Date.now(),
      };

      const messageHandler = handler.getHandler();
      await messageHandler(createMessage(event));

      // Should only enqueue once for duplicate URL
      expect(context.enqueueJob).toHaveBeenCalledTimes(1);
    });
  });
});
