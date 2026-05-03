import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  GenerationJobHandler,
  generationJobSchema,
  type GenerationJobData,
} from "../../src/handlers/generationHandler";
import { createSilentLogger } from "@brains/test-utils";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type {
  EntityPluginContext,
  EntityMutationResult,
} from "@brains/plugins";
import { ProgressReporter } from "@brains/utils";

describe("GenerationJobHandler", () => {
  let handler: GenerationJobHandler;
  let harness: PluginTestHarness;
  let context: EntityPluginContext;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;

  beforeEach(() => {
    const logger = createSilentLogger();
    harness = createPluginHarness();
    context = harness.getEntityContext("social-media");
    handler = new GenerationJobHandler(logger, context);

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
        platform: "twitter",
      };
      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });

  describe("process - failure notifications", () => {
    let sentMessages: Array<{ type: string; payload: unknown }>;

    beforeEach(() => {
      sentMessages = [];
      harness.subscribe("generate:report:success", async (msg) => {
        sentMessages.push({
          type: "generate:report:success",
          payload: msg.payload,
        });
        return { success: true };
      });
      harness.subscribe("generate:report:failure", async (msg) => {
        sentMessages.push({
          type: "generate:report:failure",
          payload: msg.payload,
        });
        return { success: true };
      });
    });

    it("should send generate:report:failure when AI fails to generate title or content", async () => {
      const jobData: GenerationJobData = {
        content: "My direct LinkedIn post content",
        platform: "linkedin",
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      const failureMsg = sentMessages.find(
        (m) => m.type === "generate:report:failure",
      );
      expect(failureMsg).toBeDefined();
    });

    it("should send generate:report:failure when no content source is provided", async () => {
      const jobData: GenerationJobData = { platform: "linkedin" };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      const failureMsg = sentMessages.find(
        (m) => m.type === "generate:report:failure",
      );
      expect(failureMsg).toBeDefined();
    });

    it("should not create any entity when AI fails to generate title or content", async () => {
      const jobData: GenerationJobData = {
        content: "Content without title",
        platform: "linkedin",
      };

      await handler.process(jobData, "job-123", progressReporter);

      const entities = await context.entityService.listEntities(
        "social-post",
        {},
      );
      expect(entities).toHaveLength(0);
    });

    it("should send generate:report:success when post is created successfully", async () => {
      const jobData: GenerationJobData = {
        title: "My Post Title",
        content: "My direct LinkedIn post content",
        platform: "linkedin",
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      const successMsg = sentMessages.find(
        (m) => m.type === "generate:report:success",
      );
      expect(successMsg).toBeDefined();
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

    it("should default to draft status when addToQueue not specified", async () => {
      let createdStatus: string | undefined;
      const originalCreate = context.entityService.createEntity.bind(
        context.entityService,
      );
      context.entityService.createEntity = async (
        input,
      ): Promise<EntityMutationResult> => {
        const entityInput = input as { metadata?: { status?: string } };
        createdStatus = entityInput.metadata?.status;
        return originalCreate(input);
      };

      const jobData: GenerationJobData = {
        title: "Default Status Post",
        content: "Content without addToQueue specified",
        platform: "linkedin",
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(createdStatus).toBe("draft");
    });

    it("should pass content through AI generation when title is not provided", async () => {
      spyOn(context.ai, "generate").mockResolvedValue({
        title: "AI Generated Title",
        content: "AI-shaped LinkedIn post content",
      });

      handler = new GenerationJobHandler(createSilentLogger(), context);

      const jobData: GenerationJobData = {
        content: "Raw user content that needs shaping",
        platform: "linkedin",
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.entityId).toBeDefined();
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
      interface ImageGenerateJobData {
        prompt: string;
        title: string;
        aspectRatio: string;
        targetEntityType: string;
        targetEntityId: string;
      }
      const enqueuedJobs: Array<{
        jobType: string;
        data: ImageGenerateJobData;
      }> = [];
      context.jobs.enqueue = async (request): Promise<string> => {
        enqueuedJobs.push({
          jobType: request.type,
          data: request.data as ImageGenerateJobData,
        });
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
      const imageJob = enqueuedJobs.find(
        (j) => j.jobType === "image:image-generate",
      );
      expect(imageJob).toBeDefined();
      expect(imageJob?.data.targetEntityType).toBe("social-post");
    });

    it("should not queue image generation when generateImage is false", async () => {
      const enqueuedJobs: Array<{ jobType: string; data: unknown }> = [];
      context.jobs.enqueue = async (request): Promise<string> => {
        enqueuedJobs.push({ jobType: request.type, data: request.data });
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

    it("should use slug as entity ID (platform-title format)", async () => {
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
      expect(result.entityId).toBe("linkedin-my-awesome-post");
      expect(result.slug).toBe(result.entityId);
    });
  });
});
