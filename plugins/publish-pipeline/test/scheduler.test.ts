import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishScheduler } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import type { PublishProvider } from "@brains/utils";

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

  describe("per-entity-type intervals", () => {
    it("should use type-specific interval when configured", async () => {
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result-1" }),
      );
      const socialPublishMock = mock(() =>
        Promise.resolve({ id: "social-result-1" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });
      providerRegistry.register("social-post", {
        name: "social",
        publish: socialPublishMock,
      });

      // Create scheduler with different intervals per type
      const schedulerWithIntervals = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        tickIntervalMs: 10,
        entityIntervals: {
          "blog-post": 1000, // 1 second for blog posts
          "social-post": 10, // 10ms for social posts
        },
        onPublish: mockOnPublish,
      });

      // Add items to both queues
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("social-post", "social-1");
      await schedulerWithIntervals.start();

      // Wait for first tick - social should be processed (10ms interval)
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(socialPublishMock).toHaveBeenCalled();
      // Blog should also be processed on first tick (never processed before)
      expect(blogPublishMock).toHaveBeenCalled();

      // Add more items
      await queueManager.add("social-post", "social-2");
      await queueManager.add("blog-post", "post-2");

      // Wait another 50ms - social should process again, but blog should not (1s interval)
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(socialPublishMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(blogPublishMock.mock.calls.length).toBe(1); // Still just 1

      await schedulerWithIntervals.stop();
    });

    it("should use default interval for types without specific interval", async () => {
      const deckPublishMock = mock(() =>
        Promise.resolve({ id: "deck-result" }),
      );

      providerRegistry.register("deck", {
        name: "deck",
        publish: deckPublishMock,
      });

      // Create scheduler with entityIntervals but no deck interval
      const schedulerWithIntervals = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        tickIntervalMs: 10, // Default 10ms
        entityIntervals: {
          "blog-post": 1000, // Only configure blog-post
        },
        onPublish: mockOnPublish,
      });

      await queueManager.add("deck", "deck-1");
      await schedulerWithIntervals.start();

      // Wait for tick - deck should use default 10ms interval
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(deckPublishMock).toHaveBeenCalled();

      await schedulerWithIntervals.stop();
    });

    it("should track last processed time per entity type", async () => {
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result" }),
      );
      const socialPublishMock = mock(() =>
        Promise.resolve({ id: "social-result" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });
      providerRegistry.register("social-post", {
        name: "social",
        publish: socialPublishMock,
      });

      // Very long interval for blog, short for social
      const schedulerWithIntervals = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        tickIntervalMs: 10,
        entityIntervals: {
          "blog-post": 10000, // 10 seconds
          "social-post": 10, // 10ms
        },
        onPublish: mockOnPublish,
      });

      // Add initial items - both should be "due" (never processed)
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("social-post", "social-1");
      await schedulerWithIntervals.start();

      await new Promise((resolve) => setTimeout(resolve, 30));

      // Both should have been processed once (first time is always due)
      expect(blogPublishMock.mock.calls.length).toBe(1);
      expect(socialPublishMock.mock.calls.length).toBe(1);

      // Add more items
      await queueManager.add("blog-post", "post-2");
      await queueManager.add("social-post", "social-2");

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Social should have processed again, blog should not (10s interval not elapsed)
      expect(blogPublishMock.mock.calls.length).toBe(1);
      expect(socialPublishMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      await schedulerWithIntervals.stop();
    });
  });
});
