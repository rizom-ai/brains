import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentScheduler } from "../src/scheduler";
import type { SchedulerConfig } from "../src/scheduler";
import { QueueManager } from "../src/queue-manager";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import { TestSchedulerBackend } from "../src/scheduler-backend";
import { GENERATE_MESSAGES } from "../src/types/messages";
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

describe("ContentScheduler - Generation Scheduling", () => {
  let scheduler: ContentScheduler;
  let backend: TestSchedulerBackend;
  let queueManager: QueueManager;
  let providerRegistry: ProviderRegistry;
  let retryTracker: RetryTracker;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let messageBus: ReturnType<typeof createMockMessageBus>;
  let onGenerateMock: ReturnType<typeof mock>;

  function baseConfig(overrides?: Partial<SchedulerConfig>): SchedulerConfig {
    return {
      queueManager,
      providerRegistry,
      retryTracker,
      logger: mockLogger,
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
    mockLogger = createMockLogger();
    messageBus = createMockMessageBus();
    onGenerateMock = mock(() => {});
  });

  afterEach(async () => {
    await scheduler.stop();
    ContentScheduler.resetInstance();
  });

  describe("generation schedule configuration", () => {
    it("should accept generationSchedules config", () => {
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "0 9 * * 1" },
        }),
      );

      expect(scheduler).toBeDefined();
    });

    it("should validate generation cron expressions", () => {
      expect(() =>
        ContentScheduler.createFresh(
          baseConfig({
            generationSchedules: { newsletter: "invalid cron" },
          }),
        ),
      ).toThrow();
    });

    it("should start generation cron jobs", async () => {
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      // Trigger the generation cron
      await backend.tick("* * * * * *");

      expect(onGenerateMock).toHaveBeenCalled();
    });
  });

  describe("generation conditions", () => {
    it("should skip generation if draft exists when skipIfDraftExists is true", async () => {
      const checkConditionsMock = mock(() =>
        Promise.resolve({
          shouldGenerate: false,
          reason: "Draft already exists",
        }),
      );

      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          generationConditions: {
            newsletter: { skipIfDraftExists: true },
          },
          onCheckGenerationConditions: checkConditionsMock,
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      // Should have checked conditions but not generated
      expect(checkConditionsMock).toHaveBeenCalled();
      expect(onGenerateMock).not.toHaveBeenCalled();
    });

    it("should generate when conditions are met", async () => {
      const checkConditionsMock = mock(() =>
        Promise.resolve({ shouldGenerate: true }),
      );

      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          generationConditions: {
            newsletter: {
              skipIfDraftExists: true,
              minSourceEntities: 1,
            },
          },
          onCheckGenerationConditions: checkConditionsMock,
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      expect(checkConditionsMock).toHaveBeenCalled();
      expect(onGenerateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "newsletter",
        }),
      );
    });

    it("should skip generation when maxUnpublishedDrafts limit reached", async () => {
      const checkConditionsMock = mock(() =>
        Promise.resolve({
          shouldGenerate: false,
          reason: "Max unpublished drafts reached (5/5)",
        }),
      );

      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          generationConditions: {
            newsletter: { maxUnpublishedDrafts: 5 },
          },
          onCheckGenerationConditions: checkConditionsMock,
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      expect(checkConditionsMock).toHaveBeenCalled();
      expect(onGenerateMock).not.toHaveBeenCalled();
    });

    it("should pass generation conditions to check callback", async () => {
      const checkConditionsMock = mock(() =>
        Promise.resolve({ shouldGenerate: true }),
      );

      const conditions = {
        newsletter: {
          skipIfDraftExists: true,
          minSourceEntities: 3,
          maxUnpublishedDrafts: 10,
          sourceEntityType: "post",
        },
      };

      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          generationConditions: conditions,
          onCheckGenerationConditions: checkConditionsMock,
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      expect(checkConditionsMock).toHaveBeenCalledWith(
        "newsletter",
        conditions.newsletter,
      );
    });
  });

  describe("generate:execute message", () => {
    it("should emit generate:execute message when triggering generation", async () => {
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { newsletter: "* * * * * *" },
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      const executeMessages = messageBus._sentMessages.filter(
        (m) => m.type === GENERATE_MESSAGES.EXECUTE,
      );
      expect(executeMessages.length).toBeGreaterThan(0);
      expect(executeMessages[0]?.payload).toMatchObject({
        entityType: "newsletter",
      });
    });

    it("should call onGenerate callback when triggering generation", async () => {
      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: { "social-post": "* * * * * *" },
          onGenerate: onGenerateMock,
        }),
      );

      await scheduler.start();

      await backend.tick("* * * * * *");

      expect(onGenerateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "social-post",
        }),
      );
    });
  });

  describe("completeGeneration", () => {
    it("should emit generate:completed message", async () => {
      scheduler = ContentScheduler.createFresh(baseConfig());

      messageBus._sentMessages.length = 0;

      scheduler.completeGeneration("newsletter", "newsletter-2024-01");

      expect(messageBus.send).toHaveBeenCalledWith(
        GENERATE_MESSAGES.COMPLETED,
        expect.objectContaining({
          entityType: "newsletter",
          entityId: "newsletter-2024-01",
        }),
        "content-pipeline",
      );
    });
  });

  describe("failGeneration", () => {
    it("should emit generate:failed message", async () => {
      scheduler = ContentScheduler.createFresh(baseConfig());

      messageBus._sentMessages.length = 0;

      scheduler.failGeneration("newsletter", "No source content available");

      expect(messageBus.send).toHaveBeenCalledWith(
        GENERATE_MESSAGES.FAILED,
        expect.objectContaining({
          entityType: "newsletter",
          error: "No source content available",
        }),
        "content-pipeline",
      );
    });
  });

  describe("multiple entity types", () => {
    it("should support different generation schedules for different entity types", async () => {
      const newsletterGenMock = mock(() => {});
      const socialGenMock = mock(() => {});

      scheduler = ContentScheduler.createFresh(
        baseConfig({
          generationSchedules: {
            newsletter: "0 0 1 1 *", // Far future - won't trigger
            "social-post": "* * * * * *", // Every second
          },
          onGenerate: (event) => {
            if (event.entityType === "newsletter") {
              newsletterGenMock();
            } else if (event.entityType === "social-post") {
              socialGenMock();
            }
          },
        }),
      );

      await scheduler.start();

      // Trigger only the social-post cron
      await backend.tick("* * * * * *");

      // Social should have triggered, newsletter should not
      expect(socialGenMock).toHaveBeenCalled();
      expect(newsletterGenMock).not.toHaveBeenCalled();
    });
  });
});
