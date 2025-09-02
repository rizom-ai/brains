import { describe, it, expect, beforeEach } from "bun:test";
import { DigestHandler } from "../../src/handlers/digest-handler";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type ConversationDigestPayload,
} from "@brains/plugins";

describe("DigestHandler", () => {
  let handler: DigestHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  const createMockDigest = (
    overrides: Partial<ConversationDigestPayload> = {},
  ): ConversationDigestPayload => ({
    conversationId: "conv-123",
    messageCount: 20,
    messages: [
      {
        id: "msg-1",
        conversationId: "conv-123",
        role: "user",
        content: "Hello",
        timestamp: "2025-01-30T10:00:00Z",
        metadata: null,
      },
      {
        id: "msg-2",
        conversationId: "conv-123",
        role: "assistant",
        content: "Hi there",
        timestamp: "2025-01-30T10:01:00Z",
        metadata: null,
      },
    ],
    windowStart: 1,
    windowEnd: 20,
    windowSize: 20,
    timestamp: "2025-01-30T10:15:00Z",
    ...overrides,
  });

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });

    // Create service plugin context with mock shell
    context = createServicePluginContext(mockShell, "summary", logger);

    handler = new DigestHandler(context, logger);
  });

  describe("handleDigest", () => {
    it("should process digest without throwing errors", async () => {
      const digest = createMockDigest();

      // Should not throw - the actual AI processing will fail gracefully
      // since we don't have real AI service configured, but the handler
      // should handle errors properly
      expect(() => handler.handleDigest(digest)).not.toThrow();
    });

    it("should handle invalid digest data gracefully", async () => {
      const invalidDigest = createMockDigest({
        messages: [], // Empty messages should be handled gracefully
      });

      expect(() => handler.handleDigest(invalidDigest)).not.toThrow();
    });

    it("should handle very large message windows", async () => {
      const largeDigest = createMockDigest({
        messages: Array.from({ length: 100 }, (_, i) => ({
          id: `msg-${i}`,
          conversationId: "conv-123",
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i}`,
          timestamp: `2025-01-30T10:${String(i).padStart(2, "0")}:00Z`,
          metadata: null,
        })),
        messageCount: 100,
        windowEnd: 100,
      });

      expect(() => handler.handleDigest(largeDigest)).not.toThrow();
    });
  });

  describe("handleDigestBatch", () => {
    it("should process multiple digests", async () => {
      const digests = [
        createMockDigest({ conversationId: "conv-1" }),
        createMockDigest({ conversationId: "conv-2" }),
        createMockDigest({ conversationId: "conv-3" }),
      ];

      expect(() => handler.handleDigestBatch(digests)).not.toThrow();
    });

    it("should handle empty batch", async () => {
      expect(() => handler.handleDigestBatch([])).not.toThrow();
    });
  });
});
