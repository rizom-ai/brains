import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { PublishProvider } from "@brains/utils";
import {
  PublishExecuteHandler,
  type PublishExecuteHandlerConfig,
} from "../../src/handlers/publishExecuteHandler";
import type { SocialPost } from "../../src/schemas/social-post";

// Mock message sender - tracks sent messages and allows assertions
function createMockMessageSender(): {
  sendMessage: ReturnType<typeof mock>;
  _sentMessages: Array<{ type: string; payload: unknown }>;
} {
  const sentMessages: Array<{ type: string; payload: unknown }> = [];

  const sendFn = mock(async (type: string, payload: unknown) => {
    sentMessages.push({ type, payload });
    return { success: true };
  });

  return {
    sendMessage: sendFn,
    _sentMessages: sentMessages,
  };
}

// Mock logger
function createMockLogger(): {
  child: () => ReturnType<typeof createMockLogger>;
  info: ReturnType<typeof mock>;
  debug: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
} {
  return {
    child: () => createMockLogger(),
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  };
}

// Mock entity service
function createMockEntityService(): {
  getEntity: ReturnType<typeof mock>;
  updateEntity: ReturnType<typeof mock>;
} {
  return {
    getEntity: mock(() => Promise.resolve(null)),
    updateEntity: mock(() => Promise.resolve()),
  };
}

// Sample post for testing
const samplePost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  content: `---
platform: linkedin
status: queued
---
This is a test post for LinkedIn.`,
  metadata: {
    platform: "linkedin",
    status: "queued",
    slug: "test-post",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("PublishExecuteHandler", () => {
  let handler: PublishExecuteHandler;
  let messageSender: ReturnType<typeof createMockMessageSender>;
  let logger: ReturnType<typeof createMockLogger>;
  let entityService: ReturnType<typeof createMockEntityService>;
  let providers: Map<string, PublishProvider>;
  let linkedinProvider: PublishProvider;

  beforeEach(() => {
    messageSender = createMockMessageSender();
    logger = createMockLogger();
    entityService = createMockEntityService();

    linkedinProvider = {
      name: "linkedin",
      publish: mock(() => Promise.resolve({ id: "linkedin-123" })),
      validateCredentials: mock(() => Promise.resolve(true)),
    };
    providers = new Map([["linkedin", linkedinProvider]]);

    const config: PublishExecuteHandlerConfig = {
      sendMessage: messageSender.sendMessage as never,
      logger: logger as never,
      entityService: entityService as never,
      providers,
      maxRetries: 3,
    };

    handler = new PublishExecuteHandler(config);
  });

  describe("handle", () => {
    it("should fetch entity and call provider", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(entityService.getEntity).toHaveBeenCalledWith(
        "social-post",
        "post-1",
      );
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should send report:success on successful publish", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith(
        "publish:report:success",
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "linkedin-123" },
        }),
      );
    });

    it("should update entity status to published", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(entityService.updateEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "post-1",
          metadata: expect.objectContaining({
            status: "published",
          }),
        }),
      );
    });

    it("should send report:failure when entity not found", async () => {
      entityService.getEntity = mock(() => Promise.resolve(null));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith(
        "publish:report:failure",
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: expect.stringContaining("not found"),
        }),
      );
    });

    it("should send report:failure when provider not found", async () => {
      const postWithUnknownPlatform = {
        ...samplePost,
        metadata: { ...samplePost.metadata, platform: "unknown" as const },
      };
      entityService.getEntity = mock(() =>
        Promise.resolve(postWithUnknownPlatform),
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith(
        "publish:report:failure",
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: expect.stringContaining("No provider"),
        }),
      );
    });

    it("should send report:failure when provider throws", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));
      linkedinProvider.publish = mock(() =>
        Promise.reject(new Error("API rate limit exceeded")),
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith(
        "publish:report:failure",
        expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: "API rate limit exceeded",
        }),
      );
    });

    it("should update entity status to failed after provider error", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));
      linkedinProvider.publish = mock(() =>
        Promise.reject(new Error("API error")),
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(entityService.updateEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "post-1",
          metadata: expect.objectContaining({
            lastError: "API error",
          }),
        }),
      );
    });

    it("should skip already published posts", async () => {
      const publishedPost = {
        ...samplePost,
        metadata: { ...samplePost.metadata, status: "published" as const },
      };
      entityService.getEntity = mock(() => Promise.resolve(publishedPost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(linkedinProvider.publish).not.toHaveBeenCalled();
      expect(messageSender.sendMessage).not.toHaveBeenCalled();
    });
  });
});
