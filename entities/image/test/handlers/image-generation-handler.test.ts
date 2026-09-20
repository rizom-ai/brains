import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockImageFileAssets } from "../helpers/file-assets";
import { prepareAsset } from "@brains/assets";
import { createMockEntityPluginContext as createBaseMockContext } from "@brains/plugins/test";
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import assert from "node:assert/strict";
import {
  ImageGenerationJobHandler,
  type ImageGenerationJobData,
} from "../../src/handlers/image-generation-handler";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";

// Valid 1x1 PNG image as base64
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BASE64}`;
const VALID_PNG_ASSET = prepareAsset(Buffer.from(VALID_PNG_BASE64, "base64"));

let generatedImageFile: {
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
};
function createMockEntityPluginContext(
  options: Parameters<typeof createBaseMockContext>[0],
): ReturnType<typeof createBaseMockContext> {
  const context = createBaseMockContext(options);
  context.entityService.fileAssets = mockImageFileAssets(context.entityService);
  return context;
}

describe("ImageGenerationJobHandler", () => {
  afterEach(async () => {
    await rm(directory, { recursive: true });
  });
  let handler: ImageGenerationJobHandler;
  let context: EntityPluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = CallbackProgressReporter.from(async (notification) => {
      const entry: { progress: number; message?: string } = {
        progress: notification.progress,
      };
      if (notification.message !== undefined) {
        entry.message = notification.message;
      }
      progressCalls.push(entry);
    });
    if (!reporter) {
      throw new Error("Failed to create progress reporter");
    }
    return reporter;
  };

  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "image-handler-input-"));
    generatedImageFile = {
      sourceFile: join(directory, "image.png"),
      sizeBytes: VALID_PNG_ASSET.sizeBytes,
      sha256: VALID_PNG_ASSET.digest,
    };
    await writeFile(
      generatedImageFile.sourceFile,
      Buffer.from(VALID_PNG_BASE64, "base64"),
    );
    logger = createSilentLogger();
    context = createMockEntityPluginContext({
      returns: {
        entityService: {
          createEntity: {
            entityId: "test-image",
            jobId: "job-123",
            skipped: false,
          },
          getEntity: null,
        },
        ai: {
          canGenerateImages: true,
          generatedImageFile,
        },
      },
    });

    handler = new ImageGenerationJobHandler(context, logger);
    progressReporter = createProgressReporter();
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = {
        prompt: "A beautiful sunset over mountains",
        title: "Sunset Image",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("A beautiful sunset over mountains");
      expect(result?.title).toBe("Sunset Image");
    });

    it("should validate job data with optional aspectRatio", () => {
      const validData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        aspectRatio: "1:1",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.aspectRatio).toBe("1:1");
    });

    it("should validate job data with target entity info", () => {
      const validData = {
        prompt: "Cover image for blog post",
        title: "Blog Post Cover",
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.targetEntityType).toBe("post");
      expect(result?.targetEntityId).toBe("my-blog-post");
    });

    it("should reject missing prompt", () => {
      const invalidData = {
        title: "Sunset Image",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should generate image with derived title when title is omitted", async () => {
      const jobData: ImageGenerationJobData = {
        prompt: "A beautiful sunset over mountains",
      };

      const result = await handler.process(
        jobData,
        "job-no-title",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBeDefined();
      expect(context.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          entityType: "image",
          content: VALID_PNG_ASSET.ref,
          metadata: expect.objectContaining({
            title: expect.any(String),
          }),
        }),
        preparedAsset: VALID_PNG_ASSET,
      });
    });

    it("should reject invalid aspectRatio", () => {
      const invalidData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        aspectRatio: "invalid-ratio",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    const createValidJobData = (
      overrides: Partial<ImageGenerationJobData> = {},
    ): ImageGenerationJobData => ({
      prompt: "A beautiful sunset over mountains",
      title: "Sunset Image",
      ...overrides,
    });

    it("should generate image and create entity", async () => {
      const jobData = createValidJobData();
      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("sunset-image");

      // Verify entity was created
      expect(context.entityService.createEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "sunset-image",
          entityType: "image",
          content: VALID_PNG_ASSET.ref,
          metadata: expect.objectContaining({
            title: "Sunset Image",
          }),
        }),
        preparedAsset: VALID_PNG_ASSET,
      });
    });

    it("should update an existing pending image when generation completes", async () => {
      const existingImage: BaseEntity = {
        id: "sunset-image",
        entityType: "image",
        content: VALID_PNG_DATA_URL,
        visibility: "public",
        metadata: {
          title: "Sunset Image",
          alt: "Sunset Image",
          format: "png",
          width: 1,
          height: 1,
          status: "pending",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "pending-hash",
      };

      const pendingContext = createMockEntityPluginContext({
        returns: {
          entityService: {
            getEntity: existingImage,
            updateEntity: {
              entityId: "sunset-image",
              jobId: "job-123",
              skipped: false,
            },
          },
          ai: {
            canGenerateImages: true,
            generatedImageFile,
          },
        },
      });
      const pendingHandler = new ImageGenerationJobHandler(
        pendingContext,
        logger,
      );

      const result = await pendingHandler.process(
        createValidJobData(),
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(pendingContext.entityService.updateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "sunset-image",
          content: VALID_PNG_ASSET.ref,
          metadata: expect.objectContaining({
            title: "Sunset Image",
            status: "draft",
          }),
        }),
        preparedAsset: VALID_PNG_ASSET,
      });
      expect(pendingContext.entityService.createEntity).not.toHaveBeenCalled();
      expect(pendingContext.entityService.deleteEntity).not.toHaveBeenCalled();
    });

    it("should update existing image in place when regenerating", async () => {
      // Setup: existing image with same ID
      const existingImage: BaseEntity = {
        id: "sunset-image",
        entityType: "image",
        content: "old-data",
        visibility: "public",
        metadata: { title: "Old Image" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "old-hash",
      };

      const regenContext = createMockEntityPluginContext({
        returns: {
          entityService: {
            getEntity: existingImage, // Image already exists
            deleteEntity: true,
            createEntity: {
              entityId: "sunset-image",
              jobId: "job-123",
              skipped: false,
            },
          },
          ai: {
            canGenerateImages: true,
            generatedImageFile,
          },
        },
      });
      const regenHandler = new ImageGenerationJobHandler(regenContext, logger);

      const jobData = createValidJobData();
      const result = await regenHandler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(regenContext.entityService.updateEntity).toHaveBeenCalledWith({
        entity: expect.objectContaining({
          id: "sunset-image",
          content: VALID_PNG_ASSET.ref,
          metadata: expect.objectContaining({ status: "draft" }),
        }),
        preparedAsset: VALID_PNG_ASSET,
      });
      expect(regenContext.entityService.deleteEntity).not.toHaveBeenCalled();
      expect(regenContext.entityService.createEntity).not.toHaveBeenCalled();
    });

    it("should pass aspectRatio option to AI service", async () => {
      const jobData = createValidJobData({
        aspectRatio: "1:1",
      });

      await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(context.ai.withGeneratedImageFile).toHaveBeenCalledWith(
        expect.stringContaining("A beautiful sunset over mountains"),
        expect.any(Function),
        expect.objectContaining({ aspectRatio: "1:1" }),
      );
    });

    it("should fail when image generation not available", async () => {
      const noImageGenContext = createMockEntityPluginContext({
        returns: {
          ai: { canGenerateImages: false },
        },
      });
      const noImageGenHandler = new ImageGenerationJobHandler(
        noImageGenContext,
        logger,
      );

      const jobData = createValidJobData();
      const result = await noImageGenHandler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("should handle AI generation failure gracefully", async () => {
      const errorContext = createMockEntityPluginContext({
        returns: {
          ai: {
            canGenerateImages: true,
            generateImageError: new Error("API rate limit exceeded"),
          },
        },
      });
      const errorHandler = new ImageGenerationJobHandler(errorContext, logger);

      const jobData = createValidJobData();
      const result = await errorHandler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("API rate limit exceeded");
    });

    it("should report progress during generation", async () => {
      const jobData = createValidJobData();
      await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      // Should have progress at start, during generation, and completion
      expect(progressCalls.some((p) => p.progress === 100)).toBe(true);
    });

    it("should update target entity coverImageId when specified", async () => {
      const mockTargetEntity: BaseEntity = {
        id: "my-post",
        entityType: "post",
        content: "---\ntitle: My Post\n---\nContent",
        visibility: "public",
        metadata: { title: "My Post", slug: "my-post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "abc123",
      };

      const targetContext = createMockEntityPluginContext({
        returns: {
          entityService: {
            createEntity: {
              entityId: "test-image",
              jobId: "job-123",
              skipped: false,
            },
          },
          ai: {
            canGenerateImages: true,
            generatedImageFile,
          },
        },
        listEntitiesImpl: async () => [mockTargetEntity],
      });
      const targetHandler = new ImageGenerationJobHandler(
        targetContext,
        logger,
      );

      const jobData = createValidJobData({
        targetEntityType: "post",
        targetEntityId: "my-post",
      });

      const result = await targetHandler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);

      // Verify entity was updated with coverImageId
      expect(targetContext.entities.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my-post",
        }),
      );
    });

    it("should resolve target entities by title before updating coverImageId", async () => {
      const mockTargetEntity: BaseEntity = {
        id: "resilience-in-distributed-systems",
        entityType: "post",
        content:
          "---\ntitle: Resilience Is Not Redundancy\nslug: resilience-in-distributed-systems\n---\nContent",
        visibility: "public",
        metadata: {
          title: "Resilience Is Not Redundancy",
          slug: "resilience-in-distributed-systems",
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "abc123",
      };

      const targetContext = createMockEntityPluginContext({
        returns: {
          entityService: {
            createEntity: {
              entityId: "test-image",
              jobId: "job-123",
              skipped: false,
            },
          },
          ai: {
            canGenerateImages: true,
            generatedImageFile,
          },
        },
        listEntitiesImpl: async () => [mockTargetEntity],
      });
      const targetHandler = new ImageGenerationJobHandler(
        targetContext,
        logger,
      );

      const jobData = createValidJobData({
        targetEntityType: "post",
        targetEntityId: "Resilience Is Not Redundancy",
      });

      const result = await targetHandler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(targetContext.entities.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "resilience-in-distributed-systems",
        }),
      );
    });

    it("should fail when target entity not found", async () => {
      const jobData = createValidJobData({
        targetEntityType: "post",
        targetEntityId: "non-existent",
      });

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should generate correct image ID from title", async () => {
      const jobData = createValidJobData({
        title: "My Amazing Blog Post Cover",
      });

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("my-amazing-blog-post-cover");
    });

    it("should call AI to distill prompt when entityContent is provided", async () => {
      const distillContext = createMockEntityPluginContext({
        returns: {
          entityService: {
            createEntity: {
              entityId: "test-image",
              jobId: "job-123",
              skipped: false,
            },
            getEntity: null,
          },
          ai: {
            canGenerateImages: true,
            generatedImageFile,
            generateObject: {
              imagePrompt: "A glowing coral reef floating in amber light",
            },
          },
        },
      });
      const distillHandler = new ImageGenerationJobHandler(
        distillContext,
        logger,
      );

      const jobData = createValidJobData({
        entityTitle: "The Future of Coral Reefs",
        entityContent:
          "Coral reefs are among the most biodiverse ecosystems...",
      });

      const result = await distillHandler.process(
        jobData,
        "job-123",
        createProgressReporter(),
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      // Should have called generateObject to distill the prompt
      expect(distillContext.ai.generateObject).toHaveBeenCalled();
      // The distilled prompt should be used for image generation, not the raw content
      expect(distillContext.ai.withGeneratedImageFile).toHaveBeenCalledWith(
        expect.stringContaining("A glowing coral reef floating in amber light"),
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("should skip prompt distillation for image data URL entity content", async () => {
      const jobData = createValidJobData({
        prompt: "A pretty robot, elegant and friendly",
        entityTitle: "Pretty Robot",
        entityContent: VALID_PNG_DATA_URL,
      });

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(result.success).toBe(true);
      expect(context.ai.generateObject).not.toHaveBeenCalled();
      expect(context.ai.withGeneratedImageFile).toHaveBeenCalledWith(
        expect.stringContaining("A pretty robot, elegant and friendly"),
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("does not replay a reclaimed or imported retry, or overwrite its prior image", async () => {
      spyOn(context.jobs, "getStatus").mockResolvedValue({
        id: "retry",
        type: "image:image-generate",
        data: "{}",
        status: "processing",
        source: "image",
        priority: 0,
        retryCount: 1,
        maxRetries: 3,
        lastError: "previous outcome unknown",
        createdAt: 0,
        scheduledFor: 0,
        startedAt: 0,
        completedAt: null,
        attemptId: "retry-attempt",
        workerSlotId: "worker",
        workerSessionId: "session",
        leaseExpiresAt: 1000,
        attemptHeartbeatAt: 0,
        runtimeUpdatedAt: 0,
        metadata: { operationType: "data_processing", rootJobId: "retry" },
        progress: null,
      });
      const result = await handler.process(
        createValidJobData(),
        "retry",
        progressReporter,
        new AbortController().signal,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot be automatically replayed");
      expect(context.ai.withGeneratedImageFile).not.toHaveBeenCalled();
      expect(context.entityService.createEntity).not.toHaveBeenCalled();
      expect(context.entityService.updateEntity).not.toHaveBeenCalled();
    });

    it("fails closed without file publication and never enters generation", async () => {
      delete context.entityService.fileAssets;
      const result = await handler.process(
        createValidJobData(),
        "unprovisioned",
        progressReporter,
        new AbortController().signal,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("not provisioned");
      expect(context.ai.withGeneratedImageFile).not.toHaveBeenCalled();
    });

    it("rejects an inspected file that differs from its producer receipt", async () => {
      generatedImageFile.sha256 = "a".repeat(64);
      const result = await handler.process(
        createValidJobData(),
        "mismatch",
        progressReporter,
        new AbortController().signal,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("producer receipt");
      expect(context.entityService.createEntity).not.toHaveBeenCalled();
      expect(context.entityService.updateEntity).not.toHaveBeenCalled();
    });

    it.each(["publication", "cleanup"] as const)(
      "does not overwrite a submitted image after %s uncertainty",
      async (fault) => {
        const pending: BaseEntity = {
          id: "sunset-image",
          entityType: "image",
          content: VALID_PNG_ASSET.ref,
          visibility: "public",
          metadata: { status: "pending", title: "Sunset Image" },
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
          contentHash: "pending",
        };
        const ctx = createMockEntityPluginContext({
          returns: {
            entityService: { getEntity: pending },
            ai: { canGenerateImages: true, generatedImageFile },
          },
        });
        const failure = new Error(`${fault} failed after submission`);
        assert.ok(ctx.entityService.fileAssets);
        if (fault === "publication")
          spyOn(ctx.entityService.fileAssets, "publish").mockRejectedValue(
            failure,
          );
        else
          spyOn(ctx.ai, "withGeneratedImageFile").mockImplementation(
            async (_prompt, use, options): Promise<never> => {
              await use(
                generatedImageFile,
                options?.signal ?? new AbortController().signal,
              );
              throw failure;
            },
          );
        const result = await new ImageGenerationJobHandler(ctx, logger).process(
          createValidJobData(),
          "uncertain",
          progressReporter,
          new AbortController().signal,
        );
        expect(result.success).toBe(false);
        expect(result.error).toBe(failure.message);
        expect(ctx.entityService.updateEntity).toHaveBeenCalledTimes(
          fault === "publication" ? 0 : 1,
        );
        if (fault === "cleanup")
          expect(ctx.entityService.updateEntity).toHaveBeenCalledWith(
            expect.objectContaining({
              entity: expect.objectContaining({
                metadata: expect.objectContaining({ status: "draft" }),
              }),
            }),
          );
      },
    );

    it("prevents publication after inspection cancellation", async () => {
      const caller = new AbortController();
      const files = context.entityService.fileAssets;
      assert.ok(files);
      const inspect = files.inspect;
      spyOn(files, "inspect").mockImplementation(async (input, options) => {
        const facts = await inspect(input, options);
        caller.abort(new Error("cancel before publish"));
        return facts;
      });
      const result = await handler.process(
        createValidJobData(),
        "cancelled",
        progressReporter,
        caller.signal,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("cancel before publish");
      expect(context.entityService.createEntity).not.toHaveBeenCalled();
    });

    it("retains a published image but prevents a cancelled target update", async () => {
      const caller = new AbortController();
      const files = context.entityService.fileAssets;
      assert.ok(files);
      const publish = files.publish;
      spyOn(files, "publish").mockImplementation(async (input, options) => {
        const result = await publish(input, options);
        caller.abort(new Error("cancel after publish"));
        return result;
      });
      const result = await handler.process(
        createValidJobData({
          targetEntityType: "post",
          targetEntityId: "target",
        }),
        "cancelled-target",
        progressReporter,
        caller.signal,
      );
      expect(result.success).toBe(true);
      expect(result.warning).toBe("Image saved; target update cancelled");
      expect(context.entityService.createEntity).toHaveBeenCalledTimes(1);
      expect(context.entities.update).not.toHaveBeenCalled();
      expect(context.entityService.updateEntity).not.toHaveBeenCalled();
    });

    it("uses a neutral subject prompt when the style guide is empty", async () => {
      const jobData = createValidJobData();

      await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      expect(context.ai.withGeneratedImageFile).toHaveBeenCalledWith(
        "Subject: A beautiful sunset over mountains",
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("should use prompt directly when entityContent is not provided", async () => {
      const jobData = createValidJobData({
        prompt: "A beautiful sunset over mountains",
      });

      await handler.process(
        jobData,
        "job-123",
        progressReporter,
        new AbortController().signal,
      );

      // Should NOT call generateObject
      expect(context.ai.generateObject).not.toHaveBeenCalled();
      // Should use the prompt with base style prepended
      expect(context.ai.withGeneratedImageFile).toHaveBeenCalledWith(
        expect.stringContaining("A beautiful sunset over mountains"),
        expect.any(Function),
        expect.any(Object),
      );
    });
  });
});
