import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishScheduler } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import type { PublishProvider } from "../src/types/provider";

describe("PublishScheduler", () => {
  let scheduler: PublishScheduler;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let mockOnPublish: ReturnType<typeof mock>;
  let mockOnFailed: ReturnType<typeof mock>;

  beforeEach(() => {
    queueManager = QueueManager.createFresh();
    providerRegistry = ProviderRegistry.createFresh();
    retryTracker = RetryTracker.createFresh({ maxRetries: 3, baseDelayMs: 10 });

    mockOnPublish = mock(() => {});
    mockOnFailed = mock(() => {});

    scheduler = PublishScheduler.createFresh({
      queueManager,
      providerRegistry,
      retryTracker,
      tickIntervalMs: 10,
      onPublish: mockOnPublish,
      onFailed: mockOnFailed,
    });
  });

  afterEach(async () => {
    await scheduler.stop();
    PublishScheduler.resetInstance();
  });

  describe("start/stop", () => {
    it("should start and stop without error", async () => {
      await scheduler.start();

      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
    });

    it("should not start twice", async () => {
      await scheduler.start();
      await scheduler.start(); // Should be no-op

      expect(scheduler.isRunning()).toBe(true);
    });
  });

  describe("publishing", () => {
    it("should call provider.publish for queued entity", async () => {
      const publishMock = mock(() =>
        Promise.resolve({ id: "result-1", url: "http://example.com" }),
      );
      const provider: PublishProvider = {
        name: "test",
        publish: publishMock,
      };
      providerRegistry.register("blog-post", provider);

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(publishMock).toHaveBeenCalled();
    });

    it("should call onPublish callback on success", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => ({ id: "result-1" }),
      };
      providerRegistry.register("blog-post", provider);

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockOnPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "blog-post",
          entityId: "post-1",
        }),
      );
    });

    it("should remove entity from queue after publish", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => ({ id: "result-1" }),
      };
      providerRegistry.register("blog-post", provider);

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      const queue = await queueManager.list("blog-post");
      expect(queue.length).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should call onFailed callback on error", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => {
          throw new Error("Network error");
        },
      };
      providerRegistry.register("blog-post", provider);

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockOnFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "blog-post",
          entityId: "post-1",
          error: "Network error",
        }),
      );
    });

    it("should record retry on failure", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => {
          throw new Error("Network error");
        },
      };
      providerRegistry.register("blog-post", provider);

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
    });
  });

  describe("publishDirect", () => {
    it("should publish immediately without queue", async () => {
      const publishMock = mock(() =>
        Promise.resolve({ id: "result-1", url: "http://example.com" }),
      );
      const provider: PublishProvider = {
        name: "test",
        publish: publishMock,
      };
      providerRegistry.register("blog-post", provider);

      const result = await scheduler.publishDirect(
        "blog-post",
        "post-1",
        "content",
        {},
      );

      expect(publishMock).toHaveBeenCalled();
      expect(result.id).toBe("result-1");
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = PublishScheduler.getInstance({
        queueManager,
        providerRegistry,
        retryTracker,
        tickIntervalMs: 10,
      });
      const instance2 = PublishScheduler.getInstance({
        queueManager,
        providerRegistry,
        retryTracker,
        tickIntervalMs: 10,
      });

      expect(instance1).toBe(instance2);
    });
  });
});
