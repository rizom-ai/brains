import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { PublishProvider } from "@brains/contracts";
import {
  PublishExecuteHandler,
  type PublishExecuteHandlerConfig,
} from "../../src/handlers/publishExecuteHandler";
import type { SocialPost } from "../../src/schemas/social-post";
import { createMockLogger, createMockMessageSender } from "@brains/test-utils";

function createMockEntityService(): {
  getEntity: ReturnType<typeof mock>;
  updateEntity: ReturnType<typeof mock>;
} {
  return {
    getEntity: mock(() => Promise.resolve(null)),
    updateEntity: mock(() => Promise.resolve()),
  };
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PDF_BASE64 = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");

const samplePost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  content: `---
title: Test LinkedIn Post
platform: linkedin
status: queued
---
This is a test post for LinkedIn.`,
  metadata: {
    title: "Test LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-test-linkedin-post-20260114",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const samplePostWithImage: SocialPost = {
  id: "post-2",
  entityType: "social-post",
  content: `---
title: Visual LinkedIn Post
platform: linkedin
status: queued
coverImageId: image-123
---
This is a post with an image.`,
  metadata: {
    title: "Visual LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-visual-linkedin-post-20260114",
  },
  contentHash: "def456",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const samplePostWithDocument: SocialPost = {
  id: "post-3",
  entityType: "social-post",
  content: `---
title: Carousel LinkedIn Post
platform: linkedin
status: queued
documents:
  - id: carousel-pdf
---
This is a post with a PDF carousel.`,
  metadata: {
    title: "Carousel LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-carousel-linkedin-post-20260114",
  },
  contentHash: "ghi789",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const sampleImage = {
  id: "image-123",
  entityType: "image",
  content: `data:image/png;base64,${TINY_PNG_BASE64}`,
  metadata: {
    title: "Test Image",
    alt: "Test image",
    format: "png",
    width: 1,
    height: 1,
  },
  contentHash: "img123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const samplePostWithSource: SocialPost = {
  id: "post-4",
  entityType: "social-post",
  content: `---
title: Source-Derived LinkedIn Post
platform: linkedin
status: queued
sourceEntityType: deck
sourceEntityId: deck-1
---
Carousel from source deck.`,
  metadata: {
    title: "Source-Derived LinkedIn Post",
    platform: "linkedin",
    status: "queued",
    slug: "linkedin-source-derived-linkedin-post-20260114",
  },
  contentHash: "src001",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

const sampleDocument = {
  id: "carousel-pdf",
  entityType: "document",
  content: `data:application/pdf;base64,${TINY_PDF_BASE64}`,
  metadata: {
    mimeType: "application/pdf",
    filename: "carousel.pdf",
  },
  contentHash: "doc123",
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
      logger,
      entityService: entityService as never,
      providers,
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

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "social-post",
        id: "post-1",
      });
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should send report:success on successful publish", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith({
        type: "publish:report:success",
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "linkedin-123" },
        }),
      });
    });

    it("should update entity status to published", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(entityService.updateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "post-1",
          metadata: expect.objectContaining({
            status: "published",
          }),
        }),
      });
    });

    it("should send report:failure when entity not found", async () => {
      entityService.getEntity = mock(() => Promise.resolve(null));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(messageSender.sendMessage).toHaveBeenCalledWith({
        type: "publish:report:failure",
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: expect.stringContaining("not found"),
        }),
      });
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

      expect(messageSender.sendMessage).toHaveBeenCalledWith({
        type: "publish:report:failure",
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: expect.stringContaining("No provider"),
        }),
      });
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

      expect(messageSender.sendMessage).toHaveBeenCalledWith({
        type: "publish:report:failure",
        payload: expect.objectContaining({
          entityType: "social-post",
          entityId: "post-1",
          error: "API rate limit exceeded",
        }),
      });
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

      expect(entityService.updateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "post-1",
          metadata: expect.objectContaining({
            status: "failed",
          }),
        }),
      });
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

    it("should fetch and pass image data when coverImageId is present", async () => {
      entityService.getEntity = mock(
        (request: { entityType: string; id: string }) => {
          if (request.entityType === "social-post") {
            return Promise.resolve(samplePostWithImage);
          }
          if (request.entityType === "image" && request.id === "image-123") {
            return Promise.resolve(sampleImage);
          }
          return Promise.resolve(null);
        },
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-2",
      });

      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "This is a post with an image.",
        expect.any(Object),
        expect.objectContaining({
          data: expect.any(Buffer),
          mimeType: "image/png",
        }),
      );
    });

    it("should fetch and pass document data when documents are present", async () => {
      entityService.getEntity = mock(
        (request: { entityType: string; id: string }) => {
          if (request.entityType === "social-post") {
            return Promise.resolve(samplePostWithDocument);
          }
          if (
            request.entityType === "document" &&
            request.id === "carousel-pdf"
          ) {
            return Promise.resolve(sampleDocument);
          }
          return Promise.resolve(null);
        },
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-3",
      });

      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "This is a post with a PDF carousel.",
        expect.any(Object),
        undefined,
        [
          expect.objectContaining({
            type: "document",
            data: expect.any(Buffer),
            mimeType: "application/pdf",
            filename: "carousel.pdf",
          }),
        ],
      );
    });

    it("should publish without image if image entity not found", async () => {
      entityService.getEntity = mock(
        (request: { entityType: string; id: string }) => {
          if (request.entityType === "social-post") {
            return Promise.resolve(samplePostWithImage);
          }
          return Promise.resolve(null);
        },
      );

      await handler.handle({
        entityType: "social-post",
        entityId: "post-2",
      });

      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "This is a post with an image.",
        expect.any(Object),
        undefined,
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should resolve source-derived carousel attachment when no documents are set", async () => {
      entityService.getEntity = mock(() =>
        Promise.resolve(samplePostWithSource),
      );
      const carouselPdf = {
        type: "document" as const,
        data: Buffer.from("%PDF-carousel"),
        mimeType: "application/pdf" as const,
        filename: "deck-carousel.pdf",
      };
      const resolveAttachment = mock(() => Promise.resolve(carouselPdf));

      const handlerWithAttachments = new PublishExecuteHandler({
        sendMessage: messageSender.sendMessage as never,
        logger,
        entityService: entityService as never,
        providers,
        resolveAttachment,
      });

      await handlerWithAttachments.handle({
        entityType: "social-post",
        entityId: "post-4",
      });

      expect(resolveAttachment).toHaveBeenCalledWith({
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "carousel",
      });
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "Carousel from source deck.",
        expect.any(Object),
        undefined,
        [carouselPdf],
      );
    });

    it("should publish text-only when source fields are set but no provider resolves an attachment", async () => {
      entityService.getEntity = mock(() =>
        Promise.resolve(samplePostWithSource),
      );
      const resolveAttachment = mock(() => Promise.resolve(undefined));

      const handlerWithAttachments = new PublishExecuteHandler({
        sendMessage: messageSender.sendMessage as never,
        logger,
        entityService: entityService as never,
        providers,
        resolveAttachment,
      });

      await handlerWithAttachments.handle({
        entityType: "social-post",
        entityId: "post-4",
      });

      expect(resolveAttachment).toHaveBeenCalled();
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "Carousel from source deck.",
        expect.any(Object),
        undefined,
      );
    });

    it("should prefer explicit documents over source-derived attachment", async () => {
      const postWithBoth: SocialPost = {
        ...samplePostWithDocument,
        id: "post-5",
        content: `---
title: Mixed LinkedIn Post
platform: linkedin
status: queued
sourceEntityType: deck
sourceEntityId: deck-1
documents:
  - id: carousel-pdf
---
Post with both explicit doc and source.`,
      };
      entityService.getEntity = mock(
        (request: { entityType: string; id: string }) => {
          if (request.entityType === "social-post") {
            return Promise.resolve(postWithBoth);
          }
          if (
            request.entityType === "document" &&
            request.id === "carousel-pdf"
          ) {
            return Promise.resolve(sampleDocument);
          }
          return Promise.resolve(null);
        },
      );
      const resolveAttachment = mock(() => Promise.resolve(undefined));

      const handlerWithAttachments = new PublishExecuteHandler({
        sendMessage: messageSender.sendMessage as never,
        logger,
        entityService: entityService as never,
        providers,
        resolveAttachment,
      });

      await handlerWithAttachments.handle({
        entityType: "social-post",
        entityId: "post-5",
      });

      expect(resolveAttachment).not.toHaveBeenCalled();
      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        undefined,
        [
          expect.objectContaining({
            type: "document",
            filename: "carousel.pdf",
          }),
        ],
      );
    });

    it("should publish without image if coverImageId not present", async () => {
      entityService.getEntity = mock(() => Promise.resolve(samplePost));

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(linkedinProvider.publish).toHaveBeenCalledWith(
        "This is a test post for LinkedIn.",
        expect.any(Object),
        undefined,
      );
    });
  });
});
