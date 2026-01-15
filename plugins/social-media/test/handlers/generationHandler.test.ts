import { describe, it, expect, beforeEach } from "bun:test";
import {
  GenerationJobHandler,
  generationJobSchema,
  type GenerationJobData,
} from "../../src/handlers/generationHandler";
import { socialMediaConfigSchema } from "../../src/config";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";

describe("GenerationJobHandler", () => {
  let handler: GenerationJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;
  const config = socialMediaConfigSchema.parse({});

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "social-media");
    handler = new GenerationJobHandler(logger, context, config);

    // Track progress calls
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
    progressReporter = reporter;
  });

  describe("generationJobSchema", () => {
    it("should validate job data with prompt", () => {
      const data = {
        prompt: "Create a post about AI",
        platform: "linkedin",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should validate job data with direct content", () => {
      const data = {
        content: "My direct post content",
        platform: "linkedin",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should validate job data with source entity", () => {
      const data = {
        sourceEntityType: "post",
        sourceEntityId: "post-123",
        platform: "linkedin",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should accept undefined platform (defaults applied in handler)", () => {
      const data = { prompt: "Test" };
      const result = generationJobSchema.parse(data);
      expect(result.platform).toBeUndefined();
    });

    it("should accept undefined addToQueue (defaults applied in handler)", () => {
      const data = { prompt: "Test" };
      const result = generationJobSchema.parse(data);
      expect(result.addToQueue).toBeUndefined();
    });

    it("should validate job data with generateImage flag", () => {
      const data = {
        prompt: "Create a post about AI",
        platform: "linkedin",
        generateImage: true,
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.generateImage).toBe(true);
      }
    });

    it("should accept undefined generateImage (optional)", () => {
      const data = { prompt: "Test" };
      const result = generationJobSchema.parse(data);
      expect(result.generateImage).toBeUndefined();
    });
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = {
        prompt: "Create a LinkedIn post",
        platform: "linkedin",
        addToQueue: true,
      };
      const result = handler.validateAndParse(validData);
      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a LinkedIn post");
    });

    it("should reject invalid platform", () => {
      const invalidData = {
        prompt: "Test",
        platform: "twitter", // Not supported yet
      };
      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    it("should fail when no content source provided", async () => {
      const jobData: GenerationJobData = {
        platform: "linkedin",
        addToQueue: true,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No content source");
    });

    it("should create post from direct content with title", async () => {
      const jobData: GenerationJobData = {
        title: "Direct Post Title",
        content: "My direct LinkedIn post content",
        platform: "linkedin",
        addToQueue: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.entityId).toBeDefined();
    });

    it("should fail when content provided without title", async () => {
      const jobData: GenerationJobData = {
        content: "My direct LinkedIn post content",
        platform: "linkedin",
        addToQueue: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Title is required when providing content directly",
      );
    });

    it("should report progress during generation", async () => {
      const jobData: GenerationJobData = {
        title: "Test Title",
        content: "Test content",
        platform: "linkedin",
        addToQueue: true,
      };

      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]?.progress).toBe(0);
    });

    it("should fail when source entity not found", async () => {
      const jobData: GenerationJobData = {
        sourceEntityType: "post",
        sourceEntityId: "non-existent-post",
        platform: "linkedin",
        addToQueue: true,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should queue image generation when generateImage is true", async () => {
      // Track enqueued jobs
      const enqueuedJobs: Array<{ jobType: string; data: unknown }> = [];
      context.jobs.enqueue = async (
        jobType: string,
        data: unknown,
      ): Promise<string> => {
        enqueuedJobs.push({ jobType, data });
        return "image-job-456";
      };

      const jobData: GenerationJobData = {
        title: "Visual Post Title",
        content: "Post content with image",
        platform: "linkedin",
        addToQueue: false,
        generateImage: true,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      // Should have queued an image-generate job (fully-qualified for cross-plugin)
      const imageJob = enqueuedJobs.find(
        (j) => j.jobType === "image:image-generate",
      );
      expect(imageJob).toBeDefined();
      const imageJobData = imageJob?.data as Record<string, unknown>;
      expect(imageJobData["targetEntityType"]).toBe("social-post");
    });

    it("should not queue image generation when generateImage is false", async () => {
      const enqueuedJobs: Array<{ jobType: string; data: unknown }> = [];
      context.jobs.enqueue = async (
        jobType: string,
        data: unknown,
      ): Promise<string> => {
        enqueuedJobs.push({ jobType, data });
        return "job-id";
      };

      const jobData: GenerationJobData = {
        title: "Text Only Post",
        content: "Post content without image",
        platform: "linkedin",
        addToQueue: false,
        generateImage: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      const imageJob = enqueuedJobs.find(
        (j) => j.jobType === "image:image-generate",
      );
      expect(imageJob).toBeUndefined();
    });

    it("should use slug as entity ID (platform-title-date format)", async () => {
      const jobData: GenerationJobData = {
        title: "My Awesome Post",
        content: "Post content here",
        platform: "linkedin",
        addToQueue: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      // Entity ID should match the slug format: linkedin-my-awesome-post-YYYYMMDD
      expect(result.entityId).toMatch(/^linkedin-my-awesome-post-\d{8}$/);
      expect(result.slug).toBe(result.entityId);
    });
  });
});
