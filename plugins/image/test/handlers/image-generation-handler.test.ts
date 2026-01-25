import { describe, it, expect, beforeEach } from "bun:test";
import {
  ImageGenerationJobHandler,
  type ImageGenerationJobData,
} from "../../src/handlers/image-generation-handler";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { ProgressReporter } from "@brains/utils";

// Valid 1x1 PNG image as base64
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BASE64}`;

describe("ImageGenerationJobHandler", () => {
  let handler: ImageGenerationJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;

  const createProgressReporter = (): ProgressReporter => {
    progressCalls = [];
    const reporter = ProgressReporter.from(async (notification) => {
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

  beforeEach(() => {
    logger = createSilentLogger();
    context = createMockServicePluginContext({
      returns: {
        entityService: {
          createEntity: { entityId: "test-image", jobId: "job-123" },
          getEntity: null,
        },
        ai: {
          canGenerateImages: true,
          generateImage: {
            base64: VALID_PNG_BASE64,
            dataUrl: VALID_PNG_DATA_URL,
          },
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

    it("should validate job data with optional size and style", () => {
      const validData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        size: "1024x1024",
        style: "natural",
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.size).toBe("1024x1024");
      expect(result?.style).toBe("natural");
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

    it("should reject missing title", () => {
      const invalidData = {
        prompt: "A beautiful sunset",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject invalid size", () => {
      const invalidData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        size: "invalid-size",
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject invalid style", () => {
      const invalidData = {
        prompt: "A beautiful sunset",
        title: "Sunset",
        style: "invalid-style",
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
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("sunset-image");

      // Verify entity was created
      expect(context.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sunset-image",
          entityType: "image",
          content: VALID_PNG_DATA_URL,
          metadata: expect.objectContaining({
            title: "Sunset Image",
          }),
        }),
      );
    });

    it("should delete existing image before creating when regenerating", async () => {
      // Setup: existing image with same ID
      const existingImage = {
        id: "sunset-image",
        entityType: "image",
        content: "old-data",
        metadata: { title: "Old Image" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "old-hash",
      };

      const regenContext = createMockServicePluginContext({
        returns: {
          entityService: {
            getEntity: existingImage, // Image already exists
            deleteEntity: true,
            createEntity: { entityId: "sunset-image", jobId: "job-123" },
          },
          ai: {
            canGenerateImages: true,
            generateImage: {
              base64: VALID_PNG_BASE64,
              dataUrl: VALID_PNG_DATA_URL,
            },
          },
        },
      });
      const regenHandler = new ImageGenerationJobHandler(regenContext, logger);

      const jobData = createValidJobData();
      const result = await regenHandler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      // Should have deleted the existing image
      expect(regenContext.entityService.deleteEntity).toHaveBeenCalledWith(
        "image",
        "sunset-image",
      );
      // Should have created the new image
      expect(regenContext.entityService.createEntity).toHaveBeenCalled();
    });

    it("should pass size and style options to AI service", async () => {
      const jobData = createValidJobData({
        size: "1024x1024",
        style: "natural",
      });

      await handler.process(jobData, "job-123", progressReporter);

      expect(context.ai.generateImage).toHaveBeenCalledWith(
        "A beautiful sunset over mountains",
        { size: "1024x1024", style: "natural" },
      );
    });

    it("should fail when image generation not available", async () => {
      const noImageGenContext = createMockServicePluginContext({
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
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("should handle AI generation failure gracefully", async () => {
      const errorContext = createMockServicePluginContext({
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
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("API rate limit exceeded");
    });

    it("should report progress during generation", async () => {
      const jobData = createValidJobData();
      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
      // Should have progress at start, during generation, and completion
      expect(progressCalls.some((p) => p.progress === 100)).toBe(true);
    });

    it("should update target entity coverImageId when specified", async () => {
      const mockTargetEntity = {
        id: "my-post",
        entityType: "post",
        content: "---\ntitle: My Post\n---\nContent",
        metadata: { title: "My Post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "abc123",
      };

      const targetContext = createMockServicePluginContext({
        returns: {
          entityService: {
            getEntity: mockTargetEntity,
            createEntity: { entityId: "test-image", jobId: "job-123" },
          },
          ai: {
            canGenerateImages: true,
            generateImage: {
              base64: VALID_PNG_BASE64,
              dataUrl: VALID_PNG_DATA_URL,
            },
          },
        },
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
      );

      expect(result.success).toBe(true);

      // Verify entity was updated with coverImageId
      expect(targetContext.entities.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "my-post",
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
      );

      expect(result.success).toBe(true);
      expect(result.imageId).toBe("my-amazing-blog-post-cover");
    });
  });
});
