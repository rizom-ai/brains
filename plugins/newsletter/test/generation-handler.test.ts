import { describe, it, expect, beforeEach } from "bun:test";
import {
  GenerationJobHandler,
  generationJobSchema,
  type GenerationJobData,
} from "../src/handlers/generation-handler";
import { newsletterConfigSchema } from "../src/config";
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
  const config = newsletterConfigSchema.parse({
    buttondown: {
      apiKey: "test-key",
      doubleOptIn: true,
    },
  });

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "newsletter");
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
        prompt: "Create a newsletter about AI",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should validate job data with direct content", () => {
      const data = {
        subject: "Weekly Update",
        content: "Hello subscribers!",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should validate job data with source entity IDs", () => {
      const data = {
        sourceEntityIds: ["post-1", "post-2"],
        sourceEntityType: "post",
      };
      const result = generationJobSchema.safeParse(data);
      expect(result.success).toBe(true);
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
        prompt: "Create a newsletter",
        addToQueue: true,
      };
      const result = handler.validateAndParse(validData);
      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Create a newsletter");
    });

    it("should reject invalid sourceEntityType", () => {
      const invalidData = {
        sourceEntityIds: ["post-1"],
        sourceEntityType: "invalid", // Not supported
      };
      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    it("should fail when no content source provided", async () => {
      const jobData: GenerationJobData = {
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

    it("should create newsletter from direct content with subject", async () => {
      const jobData: GenerationJobData = {
        subject: "Weekly Update",
        content: "Hello subscribers! Here are this week's highlights...",
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
      ): Promise<{ entityId: string; jobId: string }> => {
        const entityInput = input as { metadata?: { status?: string } };
        createdStatus = entityInput.metadata?.status;
        return originalCreate(input);
      };

      const jobData: GenerationJobData = {
        subject: "Draft Newsletter",
        content: "Content without addToQueue specified",
        // addToQueue intentionally not specified - should default to false
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(createdStatus).toBe("draft");
    });

    it("should fail when content provided without subject", async () => {
      const jobData: GenerationJobData = {
        content: "Hello subscribers!",
        addToQueue: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Subject is required");
    });

    it("should report progress during generation", async () => {
      const jobData: GenerationJobData = {
        subject: "Test Newsletter",
        content: "Test content",
        addToQueue: true,
      };

      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]?.progress).toBe(0);
    });

    it("should fail when source entities not found", async () => {
      const jobData: GenerationJobData = {
        sourceEntityIds: ["non-existent-post"],
        sourceEntityType: "post",
        addToQueue: true,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No source entities found");
    });

    it("should include entityIds in metadata when source entities are used", async () => {
      // Create mock posts
      const entityService = context.entityService;
      await entityService.createEntity({
        id: "post-1",
        entityType: "post",
        content: `---
title: "First Post"
slug: post-1
status: published
excerpt: "Introduction to the topic"
---

# First Post

Content here.`,
        metadata: {
          title: "First Post",
          slug: "post-1",
          status: "published",
          excerpt: "Introduction to the topic",
        },
      });

      // Mock AI generate to return expected shape
      context.ai.generate = async <T>(): Promise<T> =>
        ({
          subject: "Weekly Digest",
          content: "Here are the latest posts...",
        }) as T;

      let capturedMetadata: { entityIds?: string[] } | undefined;
      const originalCreate = entityService.createEntity.bind(entityService);
      entityService.createEntity = async (
        input,
      ): Promise<{ entityId: string; jobId: string }> => {
        capturedMetadata = (input as { metadata?: { entityIds?: string[] } })
          .metadata;
        return originalCreate(input);
      };

      const jobData: GenerationJobData = {
        sourceEntityIds: ["post-1"],
        sourceEntityType: "post",
        addToQueue: false,
      };

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(capturedMetadata?.entityIds).toEqual(["post-1"]);
    });
  });
});
