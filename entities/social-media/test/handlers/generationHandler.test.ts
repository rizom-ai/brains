import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  generateReportFailureContract,
  generateReportSuccessContract,
  imageGenerateJobContract,
  type ImageGenerateJobInput,
} from "@brains/contracts";
import {
  GenerationJobHandler,
  generatedPostSchema,
  generationJobSchema,
  type GenerationJobData,
} from "../../src/handlers/generationHandler";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { RetryScope } from "@brains/utils/retry-backoff";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type {
  EntityPluginContext,
  EntityMutationResult,
} from "@brains/plugins";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import {
  socialPostMetadataSchema,
  type SocialPostMetadata,
} from "../../src/schemas/social-post";

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
    progressReporter = reporter;
  });

  /** The image jobs the handler queued, read back through their contract. */
  async function queuedImageJobs(): Promise<ImageGenerateJobInput[]> {
    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs([imageGenerateJobContract.type]);
    return jobs.map((job) =>
      imageGenerateJobContract.input.parse(JSON.parse(job.data)),
    );
  }

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

    it("should validate generic coverImage option", () => {
      const data = {
        prompt: "Create a post about AI",
        platform: "linkedin",
        coverImage: {
          generate: true,
          prompt: "Conceptual cover for responsible AI",
        },
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.coverImage).toEqual({
          generate: true,
          prompt: "Conceptual cover for responsible AI",
        });
      }
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
      harness.subscribe(generateReportSuccessContract.name, async (msg) => {
        sentMessages.push({
          type: generateReportSuccessContract.name,
          payload: msg.payload,
        });
        return { success: true };
      });
      harness.subscribe(generateReportFailureContract.name, async (msg) => {
        sentMessages.push({
          type: generateReportFailureContract.name,
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
        (m) => m.type === generateReportFailureContract.name,
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
        (m) => m.type === generateReportFailureContract.name,
      );
      expect(failureMsg).toBeDefined();
    });

    it("should not create any entity when AI fails to generate title or content", async () => {
      const jobData: GenerationJobData = {
        content: "Content without title",
        platform: "linkedin",
      };

      await handler.process(jobData, "job-123", progressReporter);

      const entities = await context.entityService.listEntities({
        entityType: "social-post",
        options: {},
      });
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
        (m) => m.type === generateReportSuccessContract.name,
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
      let createdStatus: SocialPostMetadata["status"] | undefined;
      const originalCreate = context.entityService.createEntity.bind(
        context.entityService,
      );
      context.entityService.createEntity = async (
        input,
      ): Promise<EntityMutationResult> => {
        createdStatus = socialPostMetadataSchema.parse(
          input.entity.metadata,
        ).status;
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

    it("should pass content through styled anchor generation when title is not provided", async () => {
      const generate = spyOn(context.ai, "generate").mockResolvedValue({
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
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          representedIdentity: "anchor",
        }),
        generatedPostSchema,
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
      const imageJobs = await queuedImageJobs();
      expect(imageJobs).toHaveLength(1);
      expect(imageJobs[0]?.targetEntityType).toBe("social-post");
    });

    it("should not queue image generation when generateImage is false", async () => {
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
      expect(await queuedImageJobs()).toEqual([]);
    });

    it("should queue generic coverImage generation with generated content context", async () => {
      const jobData: GenerationJobData = {
        title: "Contextual Visual Post",
        content: "Post body that should inform the generated image.",
        platform: "linkedin",
        addToQueue: false,
        coverImage: {
          generate: true,
          prompt: "Editorial social post cover:",
        },
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      const imageJobs = await queuedImageJobs();
      expect(imageJobs).toHaveLength(1);
      expect(imageJobs[0]).toMatchObject({
        prompt: "Editorial social post cover:",
        title: "Contextual Visual Post Cover",
        aspectRatio: "16:9",
        targetEntityType: "social-post",
        targetEntityId: "linkedin-contextual-visual-post",
        entityTitle: "Contextual Visual Post",
      });
      expect(imageJobs[0]?.entityContent).toContain(
        "Post body that should inform the generated image.",
      );
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

/**
 * The image job is enqueued after the post is created. A refusal there (the
 * job queue's write lock held by another process) failed the generation job
 * although the post existed; the image is now retried and the job succeeds.
 */
describe("GenerationJobHandler image enqueues the queue refuses", () => {
  function setup(): {
    handler: GenerationJobHandler;
    context: EntityPluginContext;
    retries: RetryScope;
    admitted: string[];
    refusals: { count: number };
    reporter: ProgressReporter;
  } {
    const logger = createSilentLogger();
    const harness = createPluginHarness();
    const context = harness.getEntityContext("social-media");
    const retries = new RetryScope({ firstDelayMs: 10, logger });
    const admitted: string[] = [];
    const refusals = { count: 0 };
    const queue = harness.getMockShell().getJobQueueService();
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = async (request): Promise<string> => {
      if (
        request.type === imageGenerateJobContract.type &&
        refusals.count === 0
      ) {
        refusals.count += 1;
        throw new Error("Failed to acquire atomic enqueue transaction");
      }
      admitted.push(request.type);
      return enqueue(request);
    };
    const reporter = CallbackProgressReporter.from(async () => {});
    if (!reporter) throw new Error("Failed to create progress reporter");
    return {
      handler: new GenerationJobHandler(logger, context, retries),
      context,
      retries,
      admitted,
      refusals,
      reporter,
    };
  }

  it.each([
    ["the social image", { generateImage: true }],
    ["the cover image", { coverImage: { generate: true } }],
  ])(
    "creates the post and queues %s once the queue admits it",
    async (_label, request) => {
      const { handler, context, retries, admitted, refusals, reporter } =
        setup();

      const result = await handler.process(
        {
          title: "Visual Post",
          content: "Post content with an image",
          platform: "linkedin",
          addToQueue: false,
          ...request,
        },
        "job-1",
        reporter,
      );

      expect(result.success).toBe(true);
      expect(refusals.count).toBe(1);
      expect(
        await context.entityService.getEntity({
          entityType: "social-post",
          id: "linkedin-visual-post",
        }),
      ).not.toBeNull();
      await waitUntil(
        () => admitted.includes(imageGenerateJobContract.type),
        "the refused image to be queued",
      );
      await retries.dispose();
    },
  );
});
