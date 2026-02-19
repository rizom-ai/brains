import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentScheduler } from "../src/scheduler";
import type { SchedulerConfig } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import { TestSchedulerBackend } from "../src/scheduler-backend";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { IMessageBus } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";

// Mock message bus
function createMockMessageBus(): IMessageBus & {
  _sentMessages: Array<{ type: string; payload: unknown }>;
} {
  const sentMessages: Array<{ type: string; payload: unknown }> = [];

  return {
    subscribe: mock(() => () => {}),
    send: mock(async (type: string, payload: unknown) => {
      sentMessages.push({ type, payload });
      return { success: true };
    }),
    _sentMessages: sentMessages,
  } as unknown as IMessageBus & {
    _sentMessages: Array<{ type: string; payload: unknown }>;
  };
}

describe("ContentScheduler - Execute Message Mode", () => {
  let scheduler: ContentScheduler;
  let backend: TestSchedulerBackend;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let messageBus: ReturnType<typeof createMockMessageBus>;
  let onExecuteMock: ReturnType<typeof mock>;

  function baseConfig(overrides?: Partial<SchedulerConfig>): SchedulerConfig {
    return {
      queueManager,
      providerRegistry,
      retryTracker,
      logger: createMockLogger(),
      backend,
      messageBus,
      ...overrides,
    };
  }

  beforeEach(() => {
    backend = new TestSchedulerBackend();
    queueManager = QueueManager.createFresh();
    providerRegistry = ProviderRegistry.createFresh();
    retryTracker = RetryTracker.createFresh({ maxRetries: 3, baseDelayMs: 10 });
    messageBus = createMockMessageBus();
    onExecuteMock = mock(() => {});

    scheduler = ContentScheduler.createFresh(
      baseConfig({ onExecute: onExecuteMock }),
    );
  });

  afterEach(async () => {
    await scheduler.stop();
    ContentScheduler.resetInstance();
  });

  describe("message-driven publishing", () => {
    it("should send publish:execute message when processing queue", async () => {
      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      // Trigger the interval (processes unscheduled types)
      await backend.tick();

      // Should have sent execute message
      const executeMessages = messageBus._sentMessages.filter(
        (m) => m.type === PUBLISH_MESSAGES.EXECUTE,
      );
      expect(executeMessages.length).toBeGreaterThan(0);
      expect(executeMessages[0]?.payload).toMatchObject({
        entityType: "social-post",
        entityId: "post-1",
      });
    });

    it("should call onExecute callback when processing queue", async () => {
      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      await backend.tick();

      expect(onExecuteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
        }),
      );
    });

    it("should remove entity from queue after sending execute", async () => {
      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      await backend.tick();

      const queue = await queueManager.list("social-post");
      expect(queue.length).toBe(0);
    });

    it("should not call provider.publish when messageBus is configured", async () => {
      const publishMock = mock(() => Promise.resolve({ id: "result-1" }));
      providerRegistry.register("social-post", {
        name: "test",
        publish: publishMock,
      });

      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      await backend.tick();

      // Provider should NOT be called when using message-driven mode
      expect(publishMock).not.toHaveBeenCalled();
    });
  });

  describe("completePublish", () => {
    it("should emit completed event", async () => {
      messageBus._sentMessages.length = 0;

      scheduler.completePublish("social-post", "post-1", {
        id: "platform-123",
        url: "https://example.com/post/123",
      });

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.COMPLETED,
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "platform-123", url: "https://example.com/post/123" },
        }),
        "publish-service",
      );
    });

    it("should clear retry info on success", async () => {
      // Record a failure first
      retryTracker.recordFailure("post-1", "Previous error");
      expect(retryTracker.getRetryInfo("post-1")).not.toBeNull();

      scheduler.completePublish("social-post", "post-1", { id: "success" });

      expect(retryTracker.getRetryInfo("post-1")).toBeNull();
    });
  });

  describe("failPublish", () => {
    it("should emit failed event", async () => {
      messageBus._sentMessages.length = 0;

      scheduler.failPublish("social-post", "post-1", "Network error");

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.FAILED,
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: "Network error",
        }),
        "publish-service",
      );
    });

    it("should record retry info", async () => {
      scheduler.failPublish("social-post", "post-1", "Network error");

      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });

    it("should indicate willRetry when under max retries", async () => {
      messageBus._sentMessages.length = 0;

      scheduler.failPublish("social-post", "post-1", "Error 1");

      const failedMessage = messageBus._sentMessages.find(
        (m) => m.type === PUBLISH_MESSAGES.FAILED,
      );
      expect((failedMessage?.payload as { willRetry: boolean }).willRetry).toBe(
        true,
      );
    });

    it("should indicate willRetry=false when max retries exceeded", async () => {
      messageBus._sentMessages.length = 0;

      // Exhaust retries
      scheduler.failPublish("social-post", "post-1", "Error 1");
      scheduler.failPublish("social-post", "post-1", "Error 2");
      scheduler.failPublish("social-post", "post-1", "Error 3");

      const failedMessages = messageBus._sentMessages.filter(
        (m) => m.type === PUBLISH_MESSAGES.FAILED,
      );
      const lastMessage = failedMessages[failedMessages.length - 1];
      expect((lastMessage?.payload as { willRetry: boolean }).willRetry).toBe(
        false,
      );
    });
  });
});
