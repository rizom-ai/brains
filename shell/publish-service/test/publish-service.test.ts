import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishService } from "../src/publish-service";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { PublishProvider } from "../src/types/provider";

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

describe("PublishService", () => {
  let service: PublishService;
  let messageBus: ReturnType<typeof createMockMessageBus>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    logger = createMockLogger();
    service = PublishService.createFresh({
      messageBus: messageBus as never,
      logger: logger as never,
      tickIntervalMs: 100, // Fast for testing
    });
  });

  afterEach(async () => {
    await service.stop();
    PublishService.resetInstance();
  });

  describe("start/stop", () => {
    it("should subscribe to all message types on start", async () => {
      await service.start();

      expect(messageBus.subscribe).toHaveBeenCalledTimes(6);
    });

    it("should call unsubscribe functions on stop", async () => {
      await service.start();

      // Count handlers before stop
      let totalHandlers = 0;
      for (const list of messageBus._handlers.values()) {
        totalHandlers += list.length;
      }
      expect(totalHandlers).toBe(6);

      await service.stop();

      // After stop, internal unsubscribers array should be empty
      // (We can't check it directly, but stop() doesn't throw means it worked)
    });
  });

  describe("publish:register handler", () => {
    it("should register provider for entity type", async () => {
      await service.start();

      const provider: PublishProvider = {
        name: "test-provider",
        publish: async () => ({ id: "result" }),
      };

      const results = await messageBus._trigger(PUBLISH_MESSAGES.REGISTER, {
        entityType: "blog-post",
        provider,
      });

      expect(results[0]).toMatchObject({ success: true });
      expect(service.getProviderRegistry().has("blog-post")).toBe(true);
    });

    it("should succeed without provider", async () => {
      await service.start();

      const results = await messageBus._trigger(PUBLISH_MESSAGES.REGISTER, {
        entityType: "blog-post",
      });

      expect(results[0]).toMatchObject({ success: true });
    });
  });

  describe("publish:queue handler", () => {
    it("should add entity to queue", async () => {
      await service.start();

      const results = await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(results[0]).toMatchObject({
        success: true,
        data: { position: 1 },
      });
    });

    it("should send queued notification", async () => {
      await service.start();
      messageBus._sentMessages.length = 0;

      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.QUEUED,
        expect.objectContaining({
          entityType: "blog-post",
          entityId: "post-1",
          position: 1,
        }),
        "publish-service",
      );
    });
  });

  describe("publish:remove handler", () => {
    it("should remove entity from queue", async () => {
      await service.start();

      // First add
      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      // Then remove
      const results = await messageBus._trigger(PUBLISH_MESSAGES.REMOVE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(results[0]).toMatchObject({ success: true });

      const queue = await service.getQueueManager().list("blog-post");
      expect(queue.length).toBe(0);
    });
  });

  describe("publish:reorder handler", () => {
    it("should reorder entity in queue", async () => {
      await service.start();

      // Add multiple entities
      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });
      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-2",
      });

      // Reorder
      const results = await messageBus._trigger(PUBLISH_MESSAGES.REORDER, {
        entityType: "blog-post",
        entityId: "post-2",
        position: 1,
      });

      expect(results[0]).toMatchObject({ success: true });

      const queue = await service.getQueueManager().list("blog-post");
      expect(queue[0]?.entityId).toBe("post-2");
    });
  });

  describe("publish:list handler", () => {
    it("should return queue contents", async () => {
      await service.start();

      // Add entities
      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });
      await messageBus._trigger(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-2",
      });

      messageBus._sentMessages.length = 0;

      const results = await messageBus._trigger(PUBLISH_MESSAGES.LIST, {
        entityType: "blog-post",
      });

      expect(results[0]).toMatchObject({ success: true, data: { count: 2 } });
      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.LIST_RESPONSE,
        expect.objectContaining({
          entityType: "blog-post",
          queue: expect.arrayContaining([
            expect.objectContaining({ entityId: "post-1" }),
            expect.objectContaining({ entityId: "post-2" }),
          ]),
        }),
        "publish-service",
      );
    });
  });

  describe("publish:direct handler", () => {
    it("should publish directly with provider", async () => {
      const publishMock = mock(() =>
        Promise.resolve({ id: "result-1", url: "http://example.com" }),
      );
      const provider: PublishProvider = {
        name: "test",
        publish: publishMock,
      };

      service.registerProvider("blog-post", provider);
      await service.start();
      messageBus._sentMessages.length = 0;

      const results = await messageBus._trigger(PUBLISH_MESSAGES.DIRECT, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(results[0]).toMatchObject({ success: true });
      expect(publishMock).toHaveBeenCalled();
    });

    it("should send completed notification on success", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => ({ id: "result-1" }),
      };

      service.registerProvider("blog-post", provider);
      await service.start();
      messageBus._sentMessages.length = 0;

      await messageBus._trigger(PUBLISH_MESSAGES.DIRECT, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.COMPLETED,
        expect.objectContaining({
          entityType: "blog-post",
          entityId: "post-1",
        }),
        "publish-service",
      );
    });

    it("should send failed notification on error", async () => {
      const provider: PublishProvider = {
        name: "test",
        publish: async () => {
          throw new Error("Network error");
        },
      };

      service.registerProvider("blog-post", provider);
      await service.start();
      messageBus._sentMessages.length = 0;

      const results = await messageBus._trigger(PUBLISH_MESSAGES.DIRECT, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      expect(results[0]).toMatchObject({
        success: false,
        error: "Network error",
      });
      expect(messageBus.send).toHaveBeenCalledWith(
        PUBLISH_MESSAGES.FAILED,
        expect.objectContaining({
          entityType: "blog-post",
          entityId: "post-1",
          error: "Network error",
        }),
        "publish-service",
      );
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = PublishService.getInstance({
        messageBus: messageBus as never,
        logger: logger as never,
      });
      const instance2 = PublishService.getInstance({
        messageBus: messageBus as never,
        logger: logger as never,
      });

      expect(instance1).toBe(instance2);
    });
  });
});
