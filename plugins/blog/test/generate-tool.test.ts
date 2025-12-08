import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createGenerateTool } from "../src/tools/generate";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { BlogConfig } from "../src/config";

// Mock ToolContext for handler calls
const mockToolContext: ToolContext = {
  userId: "test-user",
  interfaceType: "test",
};

describe("Generate Tool", () => {
  let mockContext: ServicePluginContext;
  let generateTool: ReturnType<typeof createGenerateTool>;
  const mockConfig: BlogConfig = {
    defaultPrompt: "Write a blog post about my work",
    paginate: true,
    pageSize: 10,
  };

  beforeEach(() => {
    const mockEnqueueJob = mock(() => Promise.resolve("job-123"));

    mockContext = {
      enqueueJob: mockEnqueueJob,
      entityService: {
        getEntity: mock(() => Promise.resolve(null)),
        updateEntity: mock(() => Promise.resolve({ entityId: "", entity: {} })),
        listEntities: mock(() => Promise.resolve([])),
        createEntity: mock(() => Promise.resolve({})),
        deleteEntity: mock(() => Promise.resolve({})),
      },
    } as unknown as ServicePluginContext;

    generateTool = createGenerateTool(mockContext, mockConfig, "blog");
  });

  describe("tool metadata", () => {
    it("should have correct tool name", () => {
      expect(generateTool.name).toBe("blog_generate");
    });

    it("should have descriptive description", () => {
      expect(generateTool.description).toContain("blog post");
      expect(generateTool.description).toContain("draft");
    });

    it("should have correct input schema", () => {
      expect(generateTool.inputSchema).toBeDefined();
      expect(generateTool.inputSchema["prompt"]).toBeDefined();
      expect(generateTool.inputSchema["title"]).toBeDefined();
      expect(generateTool.inputSchema["content"]).toBeDefined();
      expect(generateTool.inputSchema["excerpt"]).toBeDefined();
    });
  });

  describe("job enqueuing", () => {
    it("should enqueue generation job with prompt only", async () => {
      const result = await generateTool.handler(
        { prompt: "Write about AI" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>)["jobId"]).toBe("job-123");
      expect(result.message).toContain("queued");

      // Verify enqueueJob was called correctly
      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      expect(enqueueCall).toBeDefined();
      expect(enqueueCall?.[0]).toBe("generation"); // Job type
      expect((enqueueCall?.[1] as Record<string, unknown>)["prompt"]).toBe(
        "Write about AI",
      );
    });

    it("should enqueue job with title and content", async () => {
      const result = await generateTool.handler(
        {
          title: "My Post",
          content: "Post content here",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)["jobId"]).toBe("job-123");

      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      const jobData = enqueueCall?.[1] as Record<string, unknown>;
      expect(jobData["title"]).toBe("My Post");
      expect(jobData["content"]).toBe("Post content here");
    });

    it("should enqueue job with all optional fields", async () => {
      const result = await generateTool.handler(
        {
          prompt: "AI topic",
          title: "AI Post",
          content: "AI content",
          excerpt: "AI excerpt",
          coverImage: "https://example.com/image.jpg",
          seriesName: "AI Series",
          seriesIndex: 1,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);

      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      const jobData = enqueueCall?.[1] as Record<string, unknown>;
      expect(jobData["seriesName"]).toBe("AI Series");
      expect(jobData["seriesIndex"]).toBe(1);
      expect(jobData["coverImage"]).toBe("https://example.com/image.jpg");
    });

    it("should include correct job metadata", async () => {
      await generateTool.handler({ prompt: "Test" }, mockToolContext);

      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      const jobOptions = enqueueCall?.[2] as Record<string, unknown>;

      expect(jobOptions["source"]).toBe("blog_generate");
      expect(jobOptions["rootJobId"]).toBeDefined(); // rootJobId is at options level
      expect(jobOptions["metadata"]).toBeDefined();
      const metadata = jobOptions["metadata"] as Record<string, unknown>;
      expect(metadata["operationType"]).toBe("content_operations");
      expect(metadata["operationTarget"]).toBe("blog-post");
    });

    it("should enqueue job with empty input (use defaults)", async () => {
      const result = await generateTool.handler({}, mockToolContext);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)["jobId"]).toBe("job-123");
    });
  });

  describe("error handling", () => {
    it("should handle enqueueJob errors gracefully", async () => {
      (mockContext.enqueueJob as ReturnType<typeof mock>).mockRejectedValue(
        new Error("Queue full"),
      );

      const result = await generateTool.handler(
        { prompt: "Test" },
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("Queue full");
    });

    it("should validate input schema", async () => {
      const result = await generateTool.handler(
        { seriesIndex: "not-a-number" }, // Invalid type
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should handle invalid input types", async () => {
      const result = await generateTool.handler(
        { title: 123 }, // Wrong type
        mockToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });
  });

  describe("series posts", () => {
    it("should accept series metadata", async () => {
      const result = await generateTool.handler(
        {
          title: "Series Part 1",
          content: "Content",
          seriesName: "My Series",
          seriesIndex: 1,
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);

      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      const jobData = enqueueCall?.[1] as Record<string, unknown>;
      expect(jobData["seriesName"]).toBe("My Series");
      expect(jobData["seriesIndex"]).toBe(1);
    });

    it("should accept seriesName without seriesIndex", async () => {
      const result = await generateTool.handler(
        {
          title: "Series Part",
          content: "Content",
          seriesName: "My Series",
        },
        mockToolContext,
      );

      expect(result.success).toBe(true);

      const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
        .mock.calls[0];
      const jobData = enqueueCall?.[1] as Record<string, unknown>;
      expect(jobData["seriesName"]).toBe("My Series");
      expect(jobData["seriesIndex"]).toBeUndefined();
    });
  });

  describe("return data", () => {
    it("should return jobId in data field", async () => {
      (mockContext.enqueueJob as ReturnType<typeof mock>).mockResolvedValue(
        "custom-job-id",
      );

      const result = await generateTool.handler(
        { prompt: "Test" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as Record<string, unknown>)["jobId"]).toBe(
        "custom-job-id",
      );
    });

    it("should include success message with jobId", async () => {
      const result = await generateTool.handler(
        { prompt: "Test" },
        mockToolContext,
      );

      expect(result.message).toContain("job-123");
      expect(result.message).toContain("queued");
    });
  });
});
