import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createGenerateTool, createPublishTool } from "../../src/tools";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";
import { DeckFormatter } from "../../src/formatters/deck-formatter";
import {
  createMockDeckEntity,
  createMockDeckInput,
} from "../fixtures/deck-entities";

const mockToolContext: ToolContext = {
  userId: "test-user",
  interfaceType: "cli",
};

describe("Deck Tools", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createSilentLogger();
  });

  describe("createGenerateTool", () => {
    let mockContext: ServicePluginContext;
    let generateTool: ReturnType<typeof createGenerateTool>;

    beforeEach(() => {
      const mockEnqueueJob = mock(() => Promise.resolve("job-123"));

      mockContext = {
        enqueueJob: mockEnqueueJob,
        entityService: {
          getEntity: mock(() => Promise.resolve(null)),
          updateEntity: mock(() =>
            Promise.resolve({ entityId: "", entity: {} }),
          ),
          listEntities: mock(() => Promise.resolve([])),
          createEntity: mock(() => Promise.resolve({})),
          deleteEntity: mock(() => Promise.resolve({})),
        },
      } as unknown as ServicePluginContext;

      generateTool = createGenerateTool(mockContext, "decks");
    });

    describe("tool metadata", () => {
      it("should have correct tool name", () => {
        expect(generateTool.name).toBe("decks_generate");
      });

      it("should have descriptive description", () => {
        expect(generateTool.description).toContain("deck");
        expect(generateTool.description).toContain("draft");
      });

      it("should have correct input schema", () => {
        expect(generateTool.inputSchema).toBeDefined();
        expect(generateTool.inputSchema["prompt"]).toBeDefined();
        expect(generateTool.inputSchema["title"]).toBeDefined();
        expect(generateTool.inputSchema["content"]).toBeDefined();
        expect(generateTool.inputSchema["description"]).toBeDefined();
      });

      it("should have anchor visibility", () => {
        expect(generateTool.visibility).toBe("anchor");
      });
    });

    describe("job enqueuing", () => {
      it("should enqueue generation job with prompt only", async () => {
        const result = await generateTool.handler(
          { prompt: "Create a talk about AI" },
          mockToolContext,
        );

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect((result.data as Record<string, unknown>)["jobId"]).toBe(
          "job-123",
        );
        expect(result.message).toContain("queued");

        // Verify enqueueJob was called correctly
        const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
          .mock.calls[0];
        expect(enqueueCall).toBeDefined();
        expect(enqueueCall?.[0]).toBe("generation"); // Job type
        expect((enqueueCall?.[1] as Record<string, unknown>)["prompt"]).toBe(
          "Create a talk about AI",
        );
      });

      it("should enqueue job with title and content", async () => {
        const result = await generateTool.handler(
          {
            title: "My Presentation",
            content: "# Slide 1\n\n---\n\n# Slide 2",
          },
          mockToolContext,
        );

        expect(result.success).toBe(true);
        expect((result.data as Record<string, unknown>)["jobId"]).toBe(
          "job-123",
        );

        const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
          .mock.calls[0];
        const jobData = enqueueCall?.[1] as Record<string, unknown>;
        expect(jobData["title"]).toBe("My Presentation");
        expect(jobData["content"]).toBe("# Slide 1\n\n---\n\n# Slide 2");
      });

      it("should enqueue job with all optional fields", async () => {
        const result = await generateTool.handler(
          {
            prompt: "AI topic",
            title: "AI Presentation",
            content: "AI content",
            description: "A talk about AI",
            author: "Test Author",
            event: "Tech Conference 2024",
          },
          mockToolContext,
        );

        expect(result.success).toBe(true);

        const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
          .mock.calls[0];
        const jobData = enqueueCall?.[1] as Record<string, unknown>;
        expect(jobData["author"]).toBe("Test Author");
        expect(jobData["event"]).toBe("Tech Conference 2024");
        expect(jobData["description"]).toBe("A talk about AI");
      });

      it("should include correct job metadata", async () => {
        await generateTool.handler({ prompt: "Test" }, mockToolContext);

        // Verify enqueueJob was called with correct params:
        // (type, data, toolContext, options)
        expect(mockContext.enqueueJob).toHaveBeenCalledWith(
          "generation",
          expect.any(Object),
          mockToolContext, // Should pass toolContext for progress routing
          expect.objectContaining({
            source: "decks_generate",
            metadata: expect.objectContaining({
              operationType: "content_operations",
              operationTarget: "deck",
            }),
          }),
        );
      });

      it("should enqueue job with empty input (use defaults)", async () => {
        const result = await generateTool.handler({}, mockToolContext);

        expect(result.success).toBe(true);
        expect((result.data as Record<string, unknown>)["jobId"]).toBe(
          "job-123",
        );
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

      it("should handle invalid input types", async () => {
        const result = await generateTool.handler(
          { title: 123 }, // Wrong type
          mockToolContext,
        );

        expect(result.success).toBe(false);
        expect(result["error"]).toBeDefined();
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

    describe("skipAi option", () => {
      it("should pass skipAi flag to job data", async () => {
        const result = await generateTool.handler(
          { title: "My Deck", skipAi: true },
          mockToolContext,
        );

        expect(result.success).toBe(true);

        const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
          .mock.calls[0];
        const jobData = enqueueCall?.[1] as Record<string, unknown>;
        expect(jobData["skipAi"]).toBe(true);
        expect(jobData["title"]).toBe("My Deck");
      });

      it("should accept skipAi with title and content", async () => {
        const result = await generateTool.handler(
          {
            title: "My Deck",
            content: "# Slide 1\n\n---\n\n# Slide 2",
            skipAi: true,
          },
          mockToolContext,
        );

        expect(result.success).toBe(true);

        const enqueueCall = (mockContext.enqueueJob as ReturnType<typeof mock>)
          .mock.calls[0];
        const jobData = enqueueCall?.[1] as Record<string, unknown>;
        expect(jobData["skipAi"]).toBe(true);
        expect(jobData["content"]).toBe("# Slide 1\n\n---\n\n# Slide 2");
      });
    });
  });

  describe("createPublishTool", () => {
    let context: ServicePluginContext;
    let mockShell: MockShell;
    const formatter = new DeckFormatter();

    // Helper to create a deck entity with proper markdown content
    const createDeckEntity = async (
      title: string,
      slug: string,
    ): Promise<string> => {
      const slideContent = "# Slide 1\n\n---\n\n# Slide 2";

      const deckData = createMockDeckEntity({
        id: "temp",
        content: slideContent,
        title,
        description: "Test description",
        metadata: {
          slug,
          title,
          status: "draft",
        },
      });

      // Generate proper markdown with frontmatter
      const markdown = formatter.toMarkdown(deckData);

      // Create entity - use spread to pass all deck fields
      const entityInput = createMockDeckInput({
        content: markdown,
        title,
        description: "Test description",
        metadata: {
          slug,
          title,
          status: "draft",
        },
      });

      const result = await context.entityService.createEntity(entityInput);

      return result.entityId;
    };

    beforeEach(() => {
      mockShell = MockShell.createFresh({ logger });
      context = createServicePluginContext(mockShell, "decks");
    });

    it("should create publish tool with correct metadata", () => {
      const tool = createPublishTool(context, "decks");

      expect(tool.name).toBe("decks_publish");
      expect(tool.description).toContain("Publish a deck");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.visibility).toBe("anchor");
    });

    it("should return error when neither id nor slug provided", async () => {
      const tool = createPublishTool(context, "decks");

      const result = await tool.handler({}, mockToolContext);

      expect(result.success).toBe(false);
      expect(result["error"]).toContain(
        "Either 'id' or 'slug' must be provided",
      );
    });

    it("should return error when deck not found", async () => {
      const tool = createPublishTool(context, "decks");

      const result = await tool.handler({ id: "nonexistent" }, mockToolContext);

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("Deck not found: nonexistent");
    });

    it("should publish deck by id", async () => {
      // Create a deck entity with proper markdown content
      const deckId = await createDeckEntity("Test Deck", "test-deck");

      // Now publish it
      const publishTool = createPublishTool(context, "decks");
      const result = await publishTool.handler({ id: deckId }, mockToolContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
    });

    it("should publish deck by slug", async () => {
      // Create a deck entity with proper markdown content
      await createDeckEntity("Another Deck", "another-deck");

      // Now publish it by slug
      const publishTool = createPublishTool(context, "decks");
      const result = await publishTool.handler(
        { slug: "another-deck" },
        mockToolContext,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("published successfully");
    });
  });
});
