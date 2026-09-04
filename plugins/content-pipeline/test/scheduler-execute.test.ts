import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentScheduler } from "../src/scheduler";
import type { SchedulerConfig } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import { TestSchedulerBackend } from "@brains/scheduler/test";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import { z } from "@brains/utils/zod";
import {
  createMockLogger,
  createMockMessagePublisher,
} from "@brains/test-utils";

type SchedulerConfigOverrides = Partial<SchedulerConfig>;

describe("ContentScheduler - provider execution", () => {
  let scheduler: ContentScheduler;
  let backend: TestSchedulerBackend;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let messageBus: ReturnType<typeof createMockMessagePublisher>;

  function baseConfig(overrides?: SchedulerConfigOverrides): SchedulerConfig {
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
    retryTracker = RetryTracker.createFresh();
    messageBus = createMockMessagePublisher();
    scheduler = ContentScheduler.createFresh(baseConfig());
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  describe("queued publishing", () => {
    it("should not emit publish:execute messages", async () => {
      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      await backend.tick();

      const executeMessages = messageBus.sentMessages.filter(
        (m) => m.type === "publish:execute",
      );
      expect(executeMessages.length).toBe(0);
    });

    it("should remove entity from queue after processing", async () => {
      await queueManager.add("social-post", "post-1");
      await scheduler.start();

      await backend.tick();

      const queue = await queueManager.list("social-post");
      expect(queue.length).toBe(0);
    });

    it("should use publish executor for registered providers when available", async () => {
      await scheduler.stop();
      const publish = mock(async () => ({
        entity: {
          id: "post-1",
          entityType: "social-post",
          content: "Body",
          visibility: "public" as const,
          metadata: { status: "published" as const },
          created: "2026-06-04T12:00:00.000Z",
          updated: "2026-06-04T12:00:00.000Z",
          contentHash: "hash",
        },
        result: { id: "result-1" },
      }));
      providerRegistry.register("social-post", {
        name: "test",
        publish: mock(async () => ({ id: "unused" })),
      });
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          publishExecutor: { publish },
        }),
      );

      await queueManager.add("social-post", "post-1");
      await scheduler.start();
      await backend.tick();

      expect(publish).toHaveBeenCalledWith({
        entityType: "social-post",
        id: "post-1",
      });
      expect(
        messageBus.sentMessages.some(
          (message) => message.type === "publish:execute",
        ),
      ).toBe(false);
      expect(
        messageBus.sentMessages.some(
          (message) => message.type === PUBLISH_MESSAGES.COMPLETED,
        ),
      ).toBe(true);
    });
  });

  describe("completePublish", () => {
    it("should emit completed event", async () => {
      messageBus.sentMessages.length = 0;

      scheduler.completePublish("social-post", "post-1", {
        id: "platform-123",
        url: "https://example.com/post/123",
      });

      expect(messageBus.send).toHaveBeenCalledWith({
        type: PUBLISH_MESSAGES.COMPLETED,
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "platform-123", url: "https://example.com/post/123" },
        }),
        sender: "publish-service",
        broadcast: true,
      });
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
      messageBus.sentMessages.length = 0;

      scheduler.failPublish("social-post", "post-1", "Network error");

      expect(messageBus.send).toHaveBeenCalledWith({
        type: PUBLISH_MESSAGES.FAILED,
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: "Network error",
        }),
        sender: "publish-service",
        broadcast: true,
      });
    });

    it("should record retry info", async () => {
      scheduler.failPublish("social-post", "post-1", "Network error");

      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });

    it("should always report willRetry=false (publishing is at-most-once)", async () => {
      messageBus.sentMessages.length = 0;

      scheduler.failPublish("social-post", "post-1", "Error 1");

      const failedMessage = messageBus.sentMessages.find(
        (m) => m.type === PUBLISH_MESSAGES.FAILED,
      );
      expect(
        z.looseObject({ willRetry: z.boolean() }).parse(failedMessage?.payload)
          .willRetry,
      ).toBe(false);
    });
  });
});
