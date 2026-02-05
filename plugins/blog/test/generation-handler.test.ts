import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { BlogGenerationJobHandler } from "../src/handlers/blogGenerationJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockServicePluginContext,
  createTestEntity,
} from "@brains/test-utils";
import type { BlogPost } from "../src/schemas/blog-post";

describe("BlogGenerationJobHandler", () => {
  let handler: BlogGenerationJobHandler;
  let mockContext: ServicePluginContext;
  let mockProgressReporter: ProgressReporter;
  let generateSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let listEntitiesSpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let createEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let reportSpy: Mock<(...args: unknown[]) => void>;

  const createMockPost = (
    id: string,
    slug: string,
    seriesName?: string,
    publishedAt?: string,
  ): BlogPost => {
    const content = `---
title: Test Post
slug: ${slug}
status: published
${publishedAt ? `publishedAt: "${publishedAt}"` : ""}
${seriesName ? `seriesName: ${seriesName}` : ""}
---

Content`;
    return createTestEntity<BlogPost>("post", {
      id,
      content,
      metadata: {
        title: "Test Post",
        slug,
        status: "published",
        publishedAt,
        seriesName,
      },
    });
  };

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

    // Set up spies for mock methods
    generateSpy = spyOn(
      mockContext.ai,
      "generate",
    ) as unknown as typeof generateSpy;
    listEntitiesSpy = spyOn(
      mockContext.entityService,
      "listEntities",
    ) as unknown as typeof listEntitiesSpy;
    createEntitySpy = spyOn(
      mockContext.entityService,
      "createEntity",
    ) as unknown as typeof createEntitySpy;
    reportSpy = spyOn(
      mockProgressReporter,
      "report",
    ) as unknown as typeof reportSpy;

    handler = new BlogGenerationJobHandler(
      createSilentLogger("test"),
      mockContext,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = {
        prompt: "Write about AI",
        title: "AI Post",
        content: "Content",
      };

      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.prompt).toBe("Write about AI");
      expect(result?.title).toBe("AI Post");
    });

    it("should accept empty object (all fields optional)", () => {
      const result = handler.validateAndParse({});

      expect(result).not.toBeNull();
    });

    it("should reject invalid data types", () => {
      const data = {
        seriesIndex: "not-a-number", // Should be number
      };

      const result = handler.validateAndParse(data);

      expect(result).toBeNull();
    });
  });

  describe("process - AI generates everything", () => {
    it("should generate title, content, and excerpt with AI", async () => {
      generateSpy.mockResolvedValue({
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

      // Verify AI generation was called
      const generateCall = generateSpy.mock.calls[0];
      expect(generateCall).toBeDefined();
      expect(
        (generateCall?.[0] as Record<string, unknown>)["prompt"],
      ).toContain("Write about AI");
      expect(
        (generateCall?.[0] as Record<string, unknown>)["templateName"],
      ).toBe("blog:generation");
    });

    it("should use default prompt when none provided", async () => {
      await handler.process({}, "job-123", mockProgressReporter);

      const generateCall = generateSpy.mock.calls[0];
      expect(
        (generateCall?.[0] as Record<string, unknown>)["prompt"],
      ).toContain("knowledge base");
    });

    it("should include series context in generation prompt", async () => {
      await handler.process(
        {
          prompt: "Write about AI",
          seriesName: "AI Series",
        },
        "job-123",
        mockProgressReporter,
      );

      const generateCall = generateSpy.mock.calls[0];
      expect(
        (generateCall?.[0] as Record<string, unknown>)["prompt"],
      ).toContain("AI Series");
    });

    it("should report progress during AI generation", async () => {
      await handler.process(
        { prompt: "Write about AI" },
        "job-123",
        mockProgressReporter,
      );

      const reportCalls = reportSpy.mock.calls;
      expect(reportCalls.length).toBeGreaterThan(2);
      expect(
        (reportCalls[0]?.[0] as Record<string, unknown>)["message"],
      ).toContain("Starting");
      expect(
        (reportCalls[reportCalls.length - 1]?.[0] as Record<string, unknown>)[
          "message"
        ],
      ).toContain("created successfully");
    });
  });

  describe("process - AI generates excerpt only", () => {
    it("should generate excerpt when title and content provided", async () => {
      generateSpy.mockResolvedValue({
        excerpt: "AI generated excerpt",
      });

      const result = await handler.process(
        {
          title: "My Title",
          content: "My content",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);

      // Verify excerpt generation was called
      const generateCall = generateSpy.mock.calls[0];
      expect(
        (generateCall?.[0] as Record<string, unknown>)["templateName"],
      ).toBe("blog:excerpt");
      expect(
        (generateCall?.[0] as Record<string, unknown>)["prompt"],
      ).toContain("My Title");
      expect(
        (generateCall?.[0] as Record<string, unknown>)["prompt"],
      ).toContain("My content");
    });

    it("should use generated excerpt in entity creation", async () => {
      generateSpy.mockResolvedValue({
        excerpt: "Generated excerpt text",
      });

      await handler.process(
        {
          title: "Test Post",
          content: "Test content",
        },
        "job-123",
        mockProgressReporter,
      );

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;
      expect(entityData.content).toContain("excerpt: Generated excerpt text");
    });
  });

  describe("process - user provides everything", () => {
    it("should use provided content without AI generation", async () => {
      const result = await handler.process(
        {
          title: "My Title",
          content: "My content",
          excerpt: "My excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.title).toBe("My Title");

      // Verify no AI generation calls
      expect(generateSpy.mock.calls.length).toBe(0);
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

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      expect(entityData.content).toContain("title: Custom Title");
      expect(entityData.content).toContain("excerpt: Custom excerpt");
      expect(entityData.content).toContain("Custom content here");
    });
  });

  describe("process - slug generation", () => {
    it("should generate slug from title", async () => {
      const result = await handler.process(
        {
          title: "Hello World Post",
          content: "Content",
          excerpt: "Excerpt",
        },
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
        {
          title: "Test Title",
          content: "Content",
          excerpt: "Excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      // ID should be set to the title for human-readable filenames (matches existing convention)
      expect(entityData.id).toBe("Test Title");

      // Slug should be in metadata for fast lookups and URL routing
      expect(entityData.metadata.slug).toBe("test-title");

      // Slug should also be in frontmatter
      expect(entityData.content).toContain("slug: test-title");
    });
  });

  describe("process - author extraction", () => {
    it("should extract author from profile", async () => {
      spyOn(mockContext.identity, "getProfile").mockReturnValue({
        name: "John Doe",
      } as ReturnType<typeof mockContext.identity.getProfile>);

      await handler.process(
        {
          title: "Test",
          content: "Content",
          excerpt: "Excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      expect(entityData.content).toContain("author: John Doe");
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

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      expect(entityData.content).toContain("seriesName: My Series");
      expect(entityData.content).toContain("seriesIndex: 1");
      expect(entityData.metadata.seriesName).toBe("My Series");
      expect(entityData.metadata.seriesIndex).toBe(1);
    });

    it("should auto-increment series index when not provided", async () => {
      listEntitiesSpy.mockResolvedValue([
        createMockPost(
          "post-1",
          "test-post-1",
          "My Series",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost(
          "post-2",
          "test-post-2",
          "My Series",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockPost(
          "post-3",
          "test-post-3",
          "Other Series",
          "2025-01-03T10:00:00.000Z",
        ),
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

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      // Should be 3 (2 existing + 1 new)
      expect(entityData.content).toContain("seriesIndex: 3");
      expect(entityData.metadata.seriesIndex).toBe(3);
    });

    it("should count only published posts in series for indexing", async () => {
      listEntitiesSpy.mockResolvedValue([
        createMockPost(
          "post-1",
          "test-post-1",
          "My Series",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockPost("post-2", "test-post-2", "My Series"), // Draft (no publishedAt)
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

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      // Should be 2 (1 published + 1 new)
      expect(entityData.metadata.seriesIndex).toBe(2);
    });
  });

  describe("process - entity creation", () => {
    it("should create post entity as draft by default", async () => {
      await handler.process(
        {
          title: "Test",
          content: "Content",
          excerpt: "Excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      expect(entityData.content).toContain("status: draft");
      expect(entityData.metadata.status).toBe("draft");
      expect(entityData.metadata.publishedAt).toBeUndefined();
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

      const createCall = createEntitySpy.mock.calls[0];
      const entityData = createCall?.[0] as BlogPost;

      expect(entityData.content).toContain("coverImageId: hero-image");
    });

    it("should return entityId and slug on success", async () => {
      createEntitySpy.mockResolvedValue({
        entityId: "my-post-slug",
        entity: {},
      });

      const result = await handler.process(
        {
          title: "My Post",
          content: "Content",
          excerpt: "Excerpt",
        },
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
      generateSpy.mockRejectedValue(new Error("AI service unavailable"));

      const result = await handler.process(
        { prompt: "Test" },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("AI service unavailable");
    });

    it("should handle entity creation errors", async () => {
      createEntitySpy.mockRejectedValue(new Error("Database error"));

      const result = await handler.process(
        {
          title: "Test",
          content: "Content",
          excerpt: "Excerpt",
        },
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Database error");
    });
  });
});
