import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { BlogGenerationJobHandler } from "../src/handlers/blogGenerationJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { createMockPost } from "./fixtures/blog-entities";

describe("BlogGenerationJobHandler", () => {
  let handler: BlogGenerationJobHandler;
  let mockContext: ServicePluginContext;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockProgressReporter = createMockProgressReporter();

    mockContext = createMockServicePluginContext({
      returns: {
        ai: {
          generate: {
            title: "Generated Title",
            content: "Generated content",
            excerpt: "Generated excerpt",
          },
        },
        entityService: {
          getEntity: null,
          listEntities: [],
          createEntity: { entityId: "test-slug" },
        },
      },
    });

    handler = new BlogGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const result = handler.validateAndParse({
        prompt: "Write about AI",
        title: "AI Post",
        content: "Content",
      });

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Write about AI");
      expect(result?.title).toBe("AI Post");
    });

    it("should accept empty object (all fields optional)", () => {
      expect(handler.validateAndParse({})).not.toBeNull();
    });

    it("should reject invalid data types", () => {
      expect(
        handler.validateAndParse({ seriesIndex: "not-a-number" }),
      ).toBeNull();
    });
  });

  describe("process - AI generates everything", () => {
    it("should generate title, content, and excerpt with AI", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        title: "AI Generated Title",
        content: "AI generated content here",
        excerpt: "AI generated excerpt",
      });

      const result = await handler.process(
        { prompt: "Write about AI" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.title).toBe("AI Generated Title");
      expect(result.slug).toBe("ai-generated-title");

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Write about AI"),
          templateName: "blog:generation",
        }),
      );
    });

    it("should use default prompt when none provided", async () => {
      await handler.process({}, "job-123", mockProgressReporter);

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("knowledge base"),
        }),
      );
    });

    it("should include series context in generation prompt", async () => {
      await handler.process(
        { prompt: "Write about AI", seriesName: "AI Series" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("AI Series"),
        }),
      );
    });

    it("should report progress during AI generation", async () => {
      await handler.process(
        { prompt: "Write about AI" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockProgressReporter.report).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Starting"),
        }),
      );
      expect(mockProgressReporter.report).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("created successfully"),
        }),
      );
    });
  });

  describe("process - AI generates excerpt only", () => {
    it("should generate excerpt when title and content provided", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        excerpt: "AI generated excerpt",
      });

      const result = await handler.process(
        { title: "My Title", content: "My content" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);

      expect(mockContext.ai.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: "blog:excerpt",
          prompt: expect.stringMatching(
            /My Title.*My content|My content.*My Title/s,
          ),
        }),
      );
    });

    it("should use generated excerpt in entity creation", async () => {
      spyOn(mockContext.ai, "generate").mockResolvedValue({
        excerpt: "Generated excerpt text",
      });

      await handler.process(
        { title: "Test Post", content: "Test content" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("excerpt: Generated excerpt text"),
        }),
        { deduplicateId: true },
      );
    });
  });

  describe("process - user provides everything", () => {
    it("should use provided content without AI generation", async () => {
      const result = await handler.process(
        { title: "My Title", content: "My content", excerpt: "My excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.title).toBe("My Title");
      expect(mockContext.ai.generate).not.toHaveBeenCalled();
    });

    it("should create entity with provided content", async () => {
      await handler.process(
        {
          title: "Custom Title",
          content: "Custom content here",
          excerpt: "Custom excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("title: Custom Title"),
        }),
        { deduplicateId: true },
      );
      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("excerpt: Custom excerpt"),
        }),
        { deduplicateId: true },
      );
      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Custom content here"),
        }),
        { deduplicateId: true },
      );
    });
  });

  describe("process - slug generation", () => {
    it("should generate slug from title", async () => {
      const result = await handler.process(
        { title: "Hello World Post", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.slug).toBe("hello-world-post");
    });

    it("should handle special characters in title", async () => {
      const result = await handler.process(
        {
          title: "C++ & Python: A Comparison!",
          content: "Content",
          excerpt: "Excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(result.slug).toBe("c-python-a-comparison");
    });

    it("should use title as entity ID for human-readable filenames", async () => {
      await handler.process(
        { title: "Test Title", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "Test Title",
          metadata: expect.objectContaining({ slug: "test-title" }),
          content: expect.stringContaining("slug: test-title"),
        }),
        { deduplicateId: true },
      );
    });
  });

  describe("process - author extraction", () => {
    it("should extract author from profile", async () => {
      spyOn(mockContext.identity, "getProfile").mockReturnValue({
        name: "John Doe",
      } as ReturnType<typeof mockContext.identity.getProfile>);

      await handler.process(
        { title: "Test", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("author: John Doe"),
        }),
        { deduplicateId: true },
      );
    });
  });

  describe("process - series handling", () => {
    it("should include series metadata when provided", async () => {
      await handler.process(
        {
          title: "Series Part 1",
          content: "Content",
          excerpt: "Excerpt",
          seriesName: "My Series",
          seriesIndex: 1,
        },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("seriesName: My Series"),
          metadata: expect.objectContaining({
            seriesName: "My Series",
            seriesIndex: 1,
          }),
        }),
        { deduplicateId: true },
      );
    });

    it("should auto-increment series index when not provided", async () => {
      spyOn(mockContext.entityService, "listEntities").mockResolvedValue([
        createMockPost("post-1", "Test Post", "test-post-1", "published", {
          seriesName: "My Series",
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-2", "Test Post", "test-post-2", "published", {
          seriesName: "My Series",
          publishedAt: "2025-01-02T10:00:00.000Z",
        }),
        createMockPost("post-3", "Test Post", "test-post-3", "published", {
          seriesName: "Other Series",
          publishedAt: "2025-01-03T10:00:00.000Z",
        }),
      ]);

      await handler.process(
        {
          title: "Series Part 3",
          content: "Content",
          excerpt: "Excerpt",
          seriesName: "My Series",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("seriesIndex: 3"),
          metadata: expect.objectContaining({ seriesIndex: 3 }),
        }),
        { deduplicateId: true },
      );
    });

    it("should count only published posts in series for indexing", async () => {
      spyOn(mockContext.entityService, "listEntities").mockResolvedValue([
        createMockPost("post-1", "Test Post", "test-post-1", "published", {
          seriesName: "My Series",
          publishedAt: "2025-01-01T10:00:00.000Z",
        }),
        createMockPost("post-2", "Test Post", "test-post-2", "draft", {
          seriesName: "My Series",
        }),
      ]);

      await handler.process(
        {
          title: "Series Part 2",
          content: "Content",
          excerpt: "Excerpt",
          seriesName: "My Series",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ seriesIndex: 2 }),
        }),
        { deduplicateId: true },
      );
    });
  });

  describe("process - entity creation", () => {
    it("should create post entity as draft by default", async () => {
      await handler.process(
        { title: "Test", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("status: draft"),
          metadata: expect.objectContaining({ status: "draft" }),
        }),
        { deduplicateId: true },
      );
    });

    it("should include cover image ID when provided", async () => {
      await handler.process(
        {
          title: "Test",
          content: "Content",
          excerpt: "Excerpt",
          coverImageId: "hero-image",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(mockContext.entityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("coverImageId: hero-image"),
        }),
        { deduplicateId: true },
      );
    });

    it("should return entityId and slug on success", async () => {
      spyOn(mockContext.entityService, "createEntity").mockResolvedValue({
        entityId: "my-post-slug",
        jobId: "job-456",
      });

      const result = await handler.process(
        { title: "My Post", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.entityId).toBe("my-post-slug");
      expect(result.slug).toBe("my-post");
    });
  });

  describe("error handling", () => {
    it("should handle AI generation errors", async () => {
      spyOn(mockContext.ai, "generate").mockRejectedValue(
        new Error("AI service unavailable"),
      );

      const result = await handler.process(
        { prompt: "Test" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("AI service unavailable");
    });

    it("should handle entity creation errors", async () => {
      spyOn(mockContext.entityService, "createEntity").mockRejectedValue(
        new Error("Database error"),
      );

      const result = await handler.process(
        { title: "Test", content: "Content", excerpt: "Excerpt" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database error");
    });
  });
});
