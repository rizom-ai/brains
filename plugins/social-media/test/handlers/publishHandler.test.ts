import { describe, it, expect, beforeEach } from "bun:test";
import {
  PublishJobHandler,
  publishJobSchema,
} from "../../src/handlers/publishHandler";
import { socialMediaConfigSchema } from "../../src/config";
import type { SocialMediaProvider } from "../../src/lib/provider";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";

describe("PublishJobHandler", () => {
  let handler: PublishJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;
  let mockProvider: SocialMediaProvider;
  let providers: Map<string, SocialMediaProvider>;
  const config = socialMediaConfigSchema.parse({});

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "social-media");

    // Create mock provider
    mockProvider = {
      platform: "linkedin",
      createPost: async (
        _content: string,
      ): Promise<{ postId: string; url?: string }> => ({
        postId: "mock-post-id-123",
        url: "https://linkedin.com/posts/123",
      }),
      validateCredentials: async (): Promise<boolean> => true,
    };
    providers = new Map([["linkedin", mockProvider]]);

    handler = new PublishJobHandler(logger, context, config, providers);

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

  describe("publishJobSchema", () => {
    it("should validate job data with postId", () => {
      const data = { postId: "social-post-123" };
      const result = publishJobSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should reject missing postId", () => {
      const data = {};
      const result = publishJobSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = { postId: "social-post-123" };
      const result = handler.validateAndParse(validData);
      expect(result).not.toBeNull();
      expect(result?.postId).toBe("social-post-123");
    });

    it("should reject invalid job data", () => {
      const invalidData = { postId: 123 }; // Wrong type
      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    it("should fail when post not found", async () => {
      const result = await handler.process(
        { postId: "non-existent" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should fail when no provider configured", async () => {
      // Create handler without providers
      const handlerNoProviders = new PublishJobHandler(
        logger,
        context,
        config,
        new Map(),
      );

      // First create a post entity
      const { socialPostAdapter } = await import(
        "../../src/adapters/social-post-adapter"
      );
      // Content goes in body, not frontmatter
      const markdown = socialPostAdapter.createPostContent(
        {
          platform: "linkedin",
          status: "queued",
          retryCount: 0,
        },
        "Test post",
      );
      const partial = socialPostAdapter.fromMarkdown(markdown);
      await context.entityService.createEntity({
        id: "test-post-123",
        entityType: "social-post",
        content: markdown,
        metadata: partial.metadata ?? {},
      });

      const result = await handlerNoProviders.process(
        { postId: "test-post-123" },
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No provider");
    });

    it("should report progress during publishing", async () => {
      await handler.process(
        { postId: "non-existent" },
        "job-123",
        progressReporter,
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]?.progress).toBe(0);
    });
  });
});
