import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentScheduler } from "../src/scheduler";
import type { SchedulerConfig } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import { TestSchedulerBackend } from "../src/scheduler-backend";
import type { PublishProvider } from "@brains/utils";
import { createMockEntityService, createMockLogger } from "@brains/test-utils";

describe("ContentScheduler", () => {
  let scheduler: ContentScheduler;
  let backend: TestSchedulerBackend;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockOnPublish: ReturnType<typeof mock>;
  let mockOnFailed: ReturnType<typeof mock>;

  function baseConfig(overrides?: Partial<SchedulerConfig>): SchedulerConfig {
    return {
      queueManager,
      providerRegistry,
      retryTracker,
      logger: mockLogger,
      backend,
      ...overrides,
    };
  }

  beforeEach(() => {
    backend = new TestSchedulerBackend();
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

    mockLogger = createMockLogger();
    mockOnPublish = mock(() => {});
    mockOnFailed = mock(() => {});

    scheduler = ContentScheduler.createFresh(
      baseConfig({
        entityService: mockEntityService,
        onPublish: mockOnPublish,
        onFailed: mockOnFailed,
      }),
    );
  });

  afterEach(async () => {
    await scheduler.stop();
    ContentScheduler.resetInstance();
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

      // Trigger the immediate interval (processes unscheduled types)
      await backend.tick();

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

      await backend.tick();

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

      await backend.tick();

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

      await backend.tick();

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

      await backend.tick();

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
      const instance1 = ContentScheduler.getInstance(baseConfig());
      const instance2 = ContentScheduler.getInstance(baseConfig());

      expect(instance1).toBe(instance2);
    });
  });

  describe("cron-based scheduling", () => {
    it("should process entity when cron schedule triggers", async () => {
      const cronBackend = new TestSchedulerBackend();
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result-1" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          entityService: mockEntityService,
          entitySchedules: { "blog-post": "* * * * * *" },
          onPublish: mockOnPublish,
        }),
      );

      await queueManager.add("blog-post", "post-1");
      await schedulerWithCron.start();

      // Trigger the cron
      await cronBackend.tick("* * * * * *");

      expect(blogPublishMock).toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should use different schedules for different entity types", async () => {
      const cronBackend = new TestSchedulerBackend();
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

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          entityService: mockEntityService,
          entitySchedules: {
            "blog-post": "0 0 1 1 *", // Jan 1st at midnight only
            "social-post": "* * * * * *", // Every second
          },
          onPublish: mockOnPublish,
        }),
      );

      await queueManager.add("blog-post", "post-1");
      await queueManager.add("social-post", "social-1");
      await schedulerWithCron.start();

      // Trigger only the social cron
      await cronBackend.tick("* * * * * *");

      // Social should have been called, blog should not
      expect(socialPublishMock).toHaveBeenCalled();
      expect(blogPublishMock).not.toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should process immediately for entity types without cron schedule", async () => {
      const cronBackend = new TestSchedulerBackend();
      const deckPublishMock = mock(() =>
        Promise.resolve({ id: "deck-result" }),
      );

      providerRegistry.register("deck", {
        name: "deck",
        publish: deckPublishMock,
      });

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          entityService: mockEntityService,
          entitySchedules: { "blog-post": "0 0 1 1 *" },
          onPublish: mockOnPublish,
        }),
      );

      await queueManager.add("deck", "deck-1");
      await schedulerWithCron.start();

      // Trigger intervals (processes unscheduled types)
      await cronBackend.tickIntervals();

      expect(deckPublishMock).toHaveBeenCalled();

      await schedulerWithCron.stop();
    });

    it("should process one item per cron trigger", async () => {
      const cronBackend = new TestSchedulerBackend();
      const blogPublishMock = mock(() =>
        Promise.resolve({ id: "blog-result" }),
      );

      providerRegistry.register("blog-post", {
        name: "blog",
        publish: blogPublishMock,
      });

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          entityService: mockEntityService,
          entitySchedules: { "blog-post": "* * * * * *" },
          onPublish: mockOnPublish,
        }),
      );

      // Add 3 items
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");
      await queueManager.add("blog-post", "post-3");
      await schedulerWithCron.start();

      // Trigger once - should process exactly one item
      await cronBackend.tick("* * * * * *");

      expect(blogPublishMock.mock.calls.length).toBe(1);

      await schedulerWithCron.stop();
    });

    it("should validate cron expression format", () => {
      expect(() =>
        ContentScheduler.createFresh(
          baseConfig({
            entitySchedules: { "blog-post": "invalid cron" },
          }),
        ),
      ).toThrow();
    });
  });
});
