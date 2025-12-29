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

    it("should create post from direct content", async () => {
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

      expect(result.success).toBe(true);
      expect(result.entityId).toBeDefined();
    });

    it("should report progress during generation", async () => {
      const jobData: GenerationJobData = {
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
  });
});
