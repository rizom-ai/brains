import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { PublishMediaData, PublishProvider } from "@brains/contracts";
import {
  PublishExecuteHandler,
  type PublishExecuteEntityService,
  type PublishExecuteHandlerConfig,
} from "../../src/handlers/publishExecuteHandler";
import type { BaseEntity } from "@brains/plugins";
import type { SocialPost } from "../../src/schemas/social-post";
import { createMockLogger, createMockMessageSender } from "@brains/test-utils";

class TestEntityService implements PublishExecuteEntityService {
  public readonly getEntityCalls: Array<{ entityType: string; id: string }> =
    [];
  private getEntityHandler: (request: {
    entityType: string;
    id: string;
  }) => Promise<BaseEntity | null> = async () => null;

  public readonly updateEntity = mock(
    async (_request: { entity: BaseEntity }): Promise<void> => {},
  );

  public setGetEntityResult(entity: BaseEntity | null): void {
    this.getEntityHandler = async (): Promise<BaseEntity | null> => entity;
  }

  public setGetEntityHandler(
    handler: (request: {
      entityType: string;
      id: string;
    }) => Promise<BaseEntity | null>,
  ): void {
    this.getEntityHandler = handler;
  }

  public async getEntity(request: {
    entityType: "social-post";
    id: string;
  }): Promise<SocialPost | null>;
  public async getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null>;
  public async getEntity(request: {
    entityType: string;
    id: string;
  }): Promise<BaseEntity | null> {
    this.getEntityCalls.push(request);
    return this.getEntityHandler(request);
  }
}

function createMockEntityService(): TestEntityService {
  return new TestEntityService();
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PDF_BASE64 = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");

const samplePost: SocialPost = {
  id: "post-1",
  entityType: "social-post",
  visibility: "public",
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
  visibility: "public",
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
  visibility: "public",
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

const sampleImage: BaseEntity = {
  id: "image-123",
  entityType: "image",
  visibility: "public",
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
  visibility: "public",
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

const sampleDocument: BaseEntity = {
  id: "carousel-pdf",
  entityType: "document",
  visibility: "public",
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
  let permissions: PublishExecuteHandlerConfig["permissions"];

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
    permissions = {
      assertEntityActionAllowed: mock(() => undefined),
    };

    const config: PublishExecuteHandlerConfig = {
      sendMessage: (request) => messageSender.sendMessage(request),
      logger,
      entityService,
      providers,
      permissions,
    };

    handler = new PublishExecuteHandler(config);
  });

  function createHandlerWithAttachments(
    resolveAttachment: NonNullable<
      PublishExecuteHandlerConfig["resolveAttachment"]
    >,
  ): PublishExecuteHandler {
    const config: PublishExecuteHandlerConfig = {
      sendMessage: (request) => messageSender.sendMessage(request),
      logger,
      entityService,
      providers,
      permissions,
      resolveAttachment,
    };
    return new PublishExecuteHandler(config);
  }

  describe("handle", () => {
    it("requires publish permission before executing", async () => {
      permissions.assertEntityActionAllowed = mock(() => {
        throw new Error("publish denied");
      });
      entityService.setGetEntityResult(samplePost);

      let caughtError: unknown;
      try {
        await handler.handle({
          entityType: "social-post",
          entityId: "post-1",
          authContext: { userPermissionLevel: "trusted" },
        });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError instanceof Error ? caughtError.message : "").toBe(
        "publish denied",
      );
      expect(linkedinProvider.publish).not.toHaveBeenCalled();
    });

    it("should fetch entity and call provider", async () => {
      entityService.setGetEntityResult(samplePost);

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(entityService.getEntityCalls).toEqual([
        {
          entityType: "social-post",
          id: "post-1",
        },
      ]);
      expect(linkedinProvider.publish).toHaveBeenCalled();
    });

    it("should send report:success on successful publish", async () => {
      entityService.setGetEntityResult(samplePost);

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
      entityService.setGetEntityResult(samplePost);

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
      entityService.setGetEntityResult(null);

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
        metadata: { ...samplePost.metadata, platform: "unknown" },
      };
      entityService.setGetEntityResult(postWithUnknownPlatform);

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
      entityService.setGetEntityResult(samplePost);
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
      entityService.setGetEntityResult(samplePost);
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
        metadata: { ...samplePost.metadata, status: "published" },
      };
      entityService.setGetEntityResult(publishedPost);

      await handler.handle({
        entityType: "social-post",
        entityId: "post-1",
      });

      expect(linkedinProvider.publish).not.toHaveBeenCalled();
      expect(messageSender.sendMessage).not.toHaveBeenCalled();
    });

    it("should fetch and pass image data when coverImageId is present", async () => {
      entityService.setGetEntityHandler(async (request) => {
        if (request.entityType === "social-post") {
          return samplePostWithImage;
        }
        if (request.entityType === "image" && request.id === "image-123") {
          return sampleImage;
        }
        return null;
      });

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
      entityService.setGetEntityHandler(async (request) => {
        if (request.entityType === "social-post") {
          return samplePostWithDocument;
        }
        if (
          request.entityType === "document" &&
          request.id === "carousel-pdf"
        ) {
          return sampleDocument;
        }
        return null;
      });

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
      entityService.setGetEntityHandler(async (request) => {
        if (request.entityType === "social-post") {
          return samplePostWithImage;
        }
        return null;
      });

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
      entityService.setGetEntityResult(samplePostWithSource);
      const carouselPdf: PublishMediaData = {
        type: "document",
        data: Buffer.from("%PDF-carousel"),
        mimeType: "application/pdf",
        filename: "deck-carousel.pdf",
      };
      const resolveAttachment = mock(() => Promise.resolve(carouselPdf));

      const handlerWithAttachments =
        createHandlerWithAttachments(resolveAttachment);

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
      entityService.setGetEntityResult(samplePostWithSource);
      const resolveAttachment = mock(() => Promise.resolve(undefined));

      const handlerWithAttachments =
        createHandlerWithAttachments(resolveAttachment);

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
      entityService.setGetEntityHandler(async (request) => {
        if (request.entityType === "social-post") {
          return postWithBoth;
        }
        if (
          request.entityType === "document" &&
          request.id === "carousel-pdf"
        ) {
          return sampleDocument;
        }
        return null;
      });
      const resolveAttachment = mock(() => Promise.resolve(undefined));

      const handlerWithAttachments =
        createHandlerWithAttachments(resolveAttachment);

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
      entityService.setGetEntityResult(samplePost);

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
