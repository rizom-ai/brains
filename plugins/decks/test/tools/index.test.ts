import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { createGenerateTool } from "../../src/tools";
import { createMockServicePluginContext } from "@brains/test-utils";
import {
  type ServicePluginContext,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import type { ToolContext } from "@brains/plugins";
import { z } from "@brains/utils";

const jobIdData = z.object({ jobId: z.string() });

const mockToolContext: ToolContext = {
  userId: "test-user",
  interfaceType: "cli",
};

describe("Deck Tools", () => {
  describe("createGenerateTool", () => {
    let mockContext: ServicePluginContext;
    let generateTool: ReturnType<typeof createGenerateTool>;

    beforeEach(() => {
      mockContext = createMockServicePluginContext({
        returns: {
          jobsEnqueue: "job-123",
          entityService: {
            getEntity: null,
            listEntities: [],
            createEntity: { entityId: "test-entity" },
          },
        },
      });

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

        expectSuccess(result);
        const data = jobIdData.parse(result.data);
        expect(data.jobId).toBe("job-123");
        expect(result.message).toContain("queued");

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.objectContaining({ prompt: "Create a talk about AI" }),
          mockToolContext,
          expect.any(Object),
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

        expectSuccess(result);
        const data2 = jobIdData.parse(result.data);
        expect(data2.jobId).toBe("job-123");

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.objectContaining({
            title: "My Presentation",
            content: "# Slide 1\n\n---\n\n# Slide 2",
          }),
          mockToolContext,
          expect.any(Object),
        );
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

        expectSuccess(result);

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.objectContaining({
            author: "Test Author",
            event: "Tech Conference 2024",
            description: "A talk about AI",
          }),
          mockToolContext,
          expect.any(Object),
        );
      });

      it("should include correct job metadata", async () => {
        await generateTool.handler({ prompt: "Test" }, mockToolContext);

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.any(Object),
          mockToolContext,
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

        expectSuccess(result);
        const data3 = jobIdData.parse(result.data);
        expect(data3.jobId).toBe("job-123");
      });
    });

    describe("error handling", () => {
      it("should handle enqueueJob errors gracefully", async () => {
        spyOn(mockContext.jobs, "enqueue").mockRejectedValue(
          new Error("Queue full"),
        );

        const result = await generateTool.handler(
          { prompt: "Test" },
          mockToolContext,
        );

        expectError(result);
        expect(result.error).toContain("Queue full");
      });

      it("should handle invalid input types", async () => {
        const result = await generateTool.handler(
          { title: 123 }, // Wrong type
          mockToolContext,
        );

        expectError(result);
        expect(result.error).toBeDefined();
      });
    });

    describe("return data", () => {
      it("should return jobId in data field", async () => {
        spyOn(mockContext.jobs, "enqueue").mockResolvedValue("custom-job-id");

        const result = await generateTool.handler(
          { prompt: "Test" },
          mockToolContext,
        );

        expectSuccess(result);
        const data4 = jobIdData.parse(result.data);
        expect(data4.jobId).toBe("custom-job-id");
      });

      it("should include success message with jobId", async () => {
        const result = await generateTool.handler(
          { prompt: "Test" },
          mockToolContext,
        );

        expectSuccess(result);
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

        expectSuccess(result);

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.objectContaining({ skipAi: true, title: "My Deck" }),
          mockToolContext,
          expect.any(Object),
        );
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

        expectSuccess(result);

        expect(mockContext.jobs.enqueue).toHaveBeenCalledWith(
          "deck:generation",
          expect.objectContaining({
            skipAi: true,
            content: "# Slide 1\n\n---\n\n# Slide 2",
          }),
          mockToolContext,
          expect.any(Object),
        );
      });
    });
  });
});
