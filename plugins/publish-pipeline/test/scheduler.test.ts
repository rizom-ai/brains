import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishScheduler } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import type { PublishProvider } from "@brains/utils";
import { createMockEntityService } from "@brains/test-utils";

describe("PublishScheduler", () => {
  let scheduler: PublishScheduler;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let mockOnPublish: ReturnType<typeof mock>;
  let mockOnFailed: ReturnType<typeof mock>;

  beforeEach(() => {
    queueManager = QueueManager.createFresh();
    providerRegistry = ProviderRegistry.createFresh();
    retryTracker = RetryTracker.createFresh({ maxRetries: 3, baseDelayMs: 10 });
    mockEntityService = createMockEntityService({
      returns: {
        getEntity: {
          id: "mock-id",
          entityType: "mock-type",
          content: "Mock content",
          metadata: { title: "Mock entity" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          contentHash: "mock-hash",
        },
      },
    });

    mockOnPublish = mock(() => {});
    mockOnFailed = mock(() => {});

    scheduler = PublishScheduler.createFresh({
      queueManager,
      providerRegistry,
      retryTracker,
      entityService: mockEntityService,
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

      // Wait for cron to trigger (immediate mode runs every second)
      await new Promise((resolve) => setTimeout(resolve, 1200));

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

      // Wait for cron to trigger
      await new Promise((resolve) => setTimeout(resolve, 1200));

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

      // Wait for cron to trigger
      await new Promise((resolve) => setTimeout(resolve, 1200));

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

      // Wait for cron to trigger
      await new Promise((resolve) => setTimeout(resolve, 1200));

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

      // Wait for cron to trigger
      await new Promise((resolve) => setTimeout(resolve, 1200));

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
      });
      const instance2 = PublishScheduler.getInstance({
        queueManager,
        providerRegistry,
        retryTracker,
      });

      expect(instance1).toBe(instance2);
    });
  });

  describe("cron-based scheduling", () => {
    it("should process entity when cron schedule triggers", async () => {
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result-1" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });

      // Create scheduler with cron that runs every second
      const schedulerWithCron = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        entityService: mockEntityService,
        entitySchedules: {
          "blog-post": "* * * * * *", // Every second
        },
        onPublish: mockOnPublish,
      });

      await queueManager.add("blog-post", "post-1");
      await schedulerWithCron.start();

      // Wait for cron to trigger
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(blogPublishMock).toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should use different schedules for different entity types", async () => {
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

      // Blog: far future (won't trigger), Social: every second
      const schedulerWithCron = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        entityService: mockEntityService,
        entitySchedules: {
          "blog-post": "0 0 1 1 *", // Jan 1st at midnight only
          "social-post": "* * * * * *", // Every second
        },
        onPublish: mockOnPublish,
      });

      await queueManager.add("blog-post", "post-1");
      await queueManager.add("social-post", "social-1");
      await schedulerWithCron.start();

      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Social should have been called, blog should not
      expect(socialPublishMock).toHaveBeenCalled();
      expect(blogPublishMock).not.toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should process immediately for entity types without cron schedule", async () => {
      const deckPublishMock = mock(() =>
        Promise.resolve({ id: "deck-result" }),
      );

      providerRegistry.register("deck", {
        name: "deck",
        publish: deckPublishMock,
      });

      // No cron for deck - should process on next tick (immediate mode)
      const schedulerWithCron = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        entityService: mockEntityService,
        entitySchedules: {
          "blog-post": "0 0 1 1 *", // Only blog has cron
        },
        onPublish: mockOnPublish,
      });

      await queueManager.add("deck", "deck-1");
      await schedulerWithCron.start();

      // Should process quickly (immediate mode polls every 1s by default)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(deckPublishMock).toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should process one item per cron trigger", async () => {
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });

      const schedulerWithCron = PublishScheduler.createFresh({
        queueManager,
        providerRegistry,
        retryTracker,
        entityService: mockEntityService,
        entitySchedules: {
          "blog-post": "* * * * * *", // Every second
        },
        onPublish: mockOnPublish,
      });

      // Add 3 items
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");
      await queueManager.add("blog-post", "post-3");
      await schedulerWithCron.start();

      // Wait ~1.5 seconds - should process 1-2 items (one per second)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(blogPublishMock.mock.calls.length).toBeLessThanOrEqual(2);

      await schedulerWithCron.stop();
    });

    it("should validate cron expression format", () => {
      expect(() =>
        PublishScheduler.createFresh({
          queueManager,
          providerRegistry,
          retryTracker,
          entitySchedules: {
            "blog-post": "invalid cron",
          },
        }),
      ).toThrow();
    });
  });
});
