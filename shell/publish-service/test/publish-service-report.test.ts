import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishService } from "../src/publish-service";
import { PUBLISH_MESSAGES } from "../src/types/messages";

// Mock message bus
function createMockMessageBus() {
  const handlers = new Map<string, Array<(msg: unknown) => Promise<unknown>>>();
  const sentMessages: Array<{ type: string; payload: unknown }> = [];

  return {
    subscribe: mock(
      <T>(type: string, handler: (msg: T) => Promise<unknown>) => {
        if (!handlers.has(type)) {
          handlers.set(type, []);
        }
        handlers.get(type)?.push(handler as (msg: unknown) => Promise<unknown>);
        return () => {
          const list = handlers.get(type);
          if (list) {
            const idx = list.indexOf(
              handler as (msg: unknown) => Promise<unknown>,
            );
            if (idx >= 0) list.splice(idx, 1);
          }
        };
      },
    ),
    send: mock(async (type: string, payload: unknown) => {
      sentMessages.push({ type, payload });
      return { success: true };
    }),
    // Test helpers
    _handlers: handlers,
    _sentMessages: sentMessages,
    _trigger: async (type: string, payload: unknown) => {
      const list = handlers.get(type) ?? [];
      const results = [];
      for (const handler of list) {
        results.push(
          await handler({
            id: "test-msg",
            type,
            timestamp: new Date().toISOString(),
            source: "test",
            payload,
          }),
        );
      }
      return results;
    },
  };
}

// Mock logger
function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  };
}

describe("PublishService - Report Handlers", () => {
  let service: PublishService;
  let messageBus: ReturnType<typeof createMockMessageBus>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    logger = createMockLogger();
    service = PublishService.createFresh({
      messageBus: messageBus as never,
      logger: logger as never,
      tickIntervalMs: 100,
    });
  });

  afterEach(async () => {
    await service.stop();
    PublishService.resetInstance();
  });

  describe("publish:report:success handler", () => {
    it("should subscribe to report:success message", async () => {
      await service.start();

      // Should now have 8 handlers (6 existing + 2 new)
      expect(messageBus.subscribe).toHaveBeenCalledTimes(8);
    });

    it("should clear retry info on success report", async () => {
      await service.start();

      // First record a failure
      const retryTracker = service.getRetryTracker();
      retryTracker.recordFailure("post-1", "Previous error");
      expect(retryTracker.getRetryInfo("post-1")).not.toBeNull();

      // Report success
      await messageBus._trigger("publish:report:success", {
        entityType: "social-post",
        entityId: "post-1",
        result: { id: "platform-123" },
      });

      // Retry info should be cleared
      expect(retryTracker.getRetryInfo("post-1")).toBeNull();
    });

    it("should send completed notification after success report", async () => {
      await service.start();
      messageBus._sentMessages.length = 0;

      await messageBus._trigger("publish:report:success", {
        entityType: "social-post",
        entityId: "post-1",
        result: { id: "platform-123", url: "https://example.com/post" },
      });

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.COMPLETED,
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "platform-123", url: "https://example.com/post" },
        }),
        "publish-service",
      );
    });
  });

  describe("publish:report:failure handler", () => {
    it("should record failure and track retries", async () => {
      await service.start();

      await messageBus._trigger("publish:report:failure", {
        entityType: "social-post",
        entityId: "post-1",
        error: "Network error",
      });

      const retryTracker = service.getRetryTracker();
      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });

    it("should send failed notification with retry info", async () => {
      await service.start();
      messageBus._sentMessages.length = 0;

      await messageBus._trigger("publish:report:failure", {
        entityType: "social-post",
        entityId: "post-1",
        error: "API rate limit",
      });

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.FAILED,
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: "API rate limit",
          retryCount: 1,
          willRetry: true,
        }),
        "publish-service",
      );
    });

    it("should indicate willRetry=false after max retries", async () => {
      // Create service with maxRetries=2
      const limitedService = PublishService.createFresh({
        messageBus: messageBus as never,
        logger: logger as never,
        tickIntervalMs: 100,
        maxRetries: 2,
      });

      await limitedService.start();
      messageBus._sentMessages.length = 0;

      // First failure
      await messageBus._trigger("publish:report:failure", {
        entityType: "social-post",
        entityId: "post-1",
        error: "Error 1",
      });

      // Second failure (max retries reached)
      await messageBus._trigger("publish:report:failure", {
        entityType: "social-post",
        entityId: "post-1",
        error: "Error 2",
      });

      const failedMessages = messageBus._sentMessages.filter(
        (m) => m.type === PUBLISH_MESSAGES.FAILED,
      );
      const lastMessage = failedMessages[failedMessages.length - 1];
      expect((lastMessage?.payload as { willRetry: boolean }).willRetry).toBe(
        false,
      );

      await limitedService.stop();
    });
  });
});
