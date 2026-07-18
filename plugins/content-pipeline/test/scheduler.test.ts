import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentScheduler } from "../src/scheduler";
import type { SchedulerConfig } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import {
  TestSchedulerBackend,
  type ScheduledJob,
  type SchedulerBackend,
  type SchedulerCallback,
} from "../src/scheduler-backend";
import { createMockLogger } from "@brains/test-utils";

type SchedulerConfigOverrides = Partial<SchedulerConfig>;

class DrainingSchedulerBackend implements SchedulerBackend {
  public stopCalls = 0;
  private stopResolvers: Array<() => void> = [];

  scheduleCron(
    _expression: string,
    _callback: SchedulerCallback,
  ): ScheduledJob {
    return this.createJob();
  }

  scheduleInterval(
    _intervalMs: number,
    _callback: SchedulerCallback,
  ): ScheduledJob {
    return this.createJob();
  }

  validateCron(): void {}

  resolveStops(): void {
    for (const resolve of this.stopResolvers.splice(0)) resolve();
  }

  private createJob(): ScheduledJob {
    let stopping: Promise<void> | undefined;
    return {
      stop: (): Promise<void> => {
        this.stopCalls++;
        stopping ??= new Promise<void>((resolve) => {
          this.stopResolvers.push(resolve);
        });
        return stopping;
      },
    };
  }
}

function executorResult(
  entityType: string,
  entityId: string,
  result: { id: string; url?: string } = {
    id: "result-1",
    url: "http://example.com",
  },
): {
  entity: {
    id: string;
    entityType: string;
    content: string;
    visibility: "public";
    metadata: { status: "published" };
    created: string;
    updated: string;
    contentHash: string;
  };
  result: { id: string; url?: string };
} {
  return {
    entity: {
      id: entityId,
      entityType,
      content: "Body",
      visibility: "public",
      metadata: { status: "published" },
      created: "2026-06-04T12:00:00.000Z",
      updated: "2026-06-04T12:00:00.000Z",
      contentHash: "hash",
    },
    result,
  };
}

describe("ContentScheduler", () => {
  let scheduler: ContentScheduler;
  let backend: TestSchedulerBackend;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockOnPublish: ReturnType<typeof mock>;
  let mockOnFailed: ReturnType<typeof mock>;
  let mockExecutorPublish: ReturnType<typeof mock>;

  function baseConfig(overrides?: SchedulerConfigOverrides): SchedulerConfig {
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
    retryTracker = RetryTracker.createFresh();

    mockLogger = createMockLogger();
    mockOnPublish = mock(() => {});
    mockOnFailed = mock(() => {});
    mockExecutorPublish = mock(
      async (input: { entityType: string; id?: string }) =>
        executorResult(input.entityType, input.id ?? "unknown"),
    );

    scheduler = ContentScheduler.createFresh(
      baseConfig({
        publishExecutor: { publish: mockExecutorPublish },
        onPublish: mockOnPublish,
        onFailed: mockOnFailed,
      }),
    );
  });

  afterEach(async () => {
    await scheduler.stop();
    await ContentScheduler.resetInstance();
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

    it("waits for publish and generation jobs to drain during stop", async () => {
      const drainingBackend = new DrainingSchedulerBackend();
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          backend: drainingBackend,
          entitySchedules: { "blog-post": "* * * * * *" },
          generationSchedules: { newsletter: "* * * * * *" },
        }),
      );
      await scheduler.start();

      let stopSettled = false;
      const stopping = scheduler.stop().then(() => {
        stopSettled = true;
      });
      await Promise.resolve();

      expect(drainingBackend.stopCalls).toBe(3);
      expect(stopSettled).toBe(false);

      drainingBackend.resolveStops();
      await stopping;
      expect(stopSettled).toBe(true);
    });
  });

  describe("publishing", () => {
    it("should call publish executor for queued entity", async () => {
      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      // Trigger the immediate interval (processes unscheduled types)
      await backend.tick();

      expect(mockExecutorPublish).toHaveBeenCalledWith({
        entityType: "blog-post",
        id: "post-1",
      });
    });

    it("should call onPublish callback on success", async () => {
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
      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      await backend.tick();

      const queue = await queueManager.list("blog-post");
      expect(queue.length).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should call onFailed callback on error", async () => {
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          publishExecutor: {
            publish: mock(async () => {
              throw new Error("Network error");
            }),
          },
          onFailed: mockOnFailed,
        }),
      );

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
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          publishExecutor: {
            publish: mock(async () => {
              throw new Error("Network error");
            }),
          },
          onFailed: mockOnFailed,
        }),
      );

      await queueManager.add("blog-post", "post-1");
      await scheduler.start();

      await backend.tick();

      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = ContentScheduler.getInstance(baseConfig());
      const instance2 = ContentScheduler.getInstance(baseConfig());

      expect(instance1).toBe(instance2);
    });

    it("returns an awaitable reset that drains the singleton", async () => {
      const drainingBackend = new DrainingSchedulerBackend();
      const singleton = ContentScheduler.getInstance(
        baseConfig({ backend: drainingBackend }),
      );
      await singleton.start();

      const resetting = ContentScheduler.resetInstance();
      drainingBackend.resolveStops();

      expect(resetting).toBeInstanceOf(Promise);
      await resetting;
    });
  });

  describe("cron-based scheduling", () => {
    it("should process entity when cron schedule triggers", async () => {
      const cronBackend = new TestSchedulerBackend();

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          publishExecutor: { publish: mockExecutorPublish },
          entitySchedules: { "blog-post": "* * * * * *" },
          onPublish: mockOnPublish,
        }),
      );

      await queueManager.add("blog-post", "post-1");
      await schedulerWithCron.start();

      // Trigger the cron
      await cronBackend.tick("* * * * * *");

      expect(mockExecutorPublish).toHaveBeenCalledWith({
        entityType: "blog-post",
        id: "post-1",
      });

      await schedulerWithCron.stop();
    });

    it("should use different schedules for different entity types", async () => {
      const cronBackend = new TestSchedulerBackend();

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          publishExecutor: { publish: mockExecutorPublish },
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
      expect(mockExecutorPublish).toHaveBeenCalledWith({
        entityType: "social-post",
        id: "social-1",
      });
      expect(mockExecutorPublish).not.toHaveBeenCalledWith({
        entityType: "blog-post",
        id: "post-1",
      });

      await schedulerWithCron.stop();
    });

    it("should process immediately for entity types without cron schedule", async () => {
      const cronBackend = new TestSchedulerBackend();

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          publishExecutor: { publish: mockExecutorPublish },
          entitySchedules: { "blog-post": "0 0 1 1 *" },
          onPublish: mockOnPublish,
        }),
      );

      await queueManager.add("deck", "deck-1");
      await schedulerWithCron.start();

      // Trigger intervals (processes unscheduled types)
      await cronBackend.tickIntervals();

      expect(mockExecutorPublish).toHaveBeenCalledWith({
        entityType: "deck",
        id: "deck-1",
      });

      await schedulerWithCron.stop();
    });

    it("should process one item per cron trigger", async () => {
      const cronBackend = new TestSchedulerBackend();

      const schedulerWithCron = ContentScheduler.createFresh(
        baseConfig({
          backend: cronBackend,
          publishExecutor: { publish: mockExecutorPublish },
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

      expect(mockExecutorPublish.mock.calls.length).toBe(1);

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
