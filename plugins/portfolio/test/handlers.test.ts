import type { mock } from "bun:test";
import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import type { ServicePluginContext, Logger } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  ProjectGenerationJobHandler,
  projectGenerationJobSchema,
} from "../src/handlers/generation-handler";
import {
  createMockServicePluginContext,
  createMockLogger,
  createMockProgressReporter,
} from "@brains/test-utils";

function createMockContext(): ServicePluginContext {
  return createMockServicePluginContext({
    returns: {
      enqueueJob: "job-456",
      generateContent: {
        title: "AI Project Title",
        description: "AI generated description",
        context: "AI generated context",
        problem: "AI generated problem",
        solution: "AI generated solution",
        outcome: "AI generated outcome",
      },
      entityService: {
        createEntity: { entityId: "project-123" },
        getEntity: null,
        listEntities: [],
      },
    },
  });
}

describe("ProjectGenerationJobHandler", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let handler: ProjectGenerationJobHandler;
  let progressReporter: ProgressReporter;

  beforeEach(() => {
    context = createMockContext();
    logger = createMockLogger();
    handler = new ProjectGenerationJobHandler(logger, context);
    progressReporter = createMockProgressReporter();
  });

  describe("validateAndParse", () => {
    it("should parse valid job data", () => {
      const data = { prompt: "Build an API", year: 2024 };
      const result = handler.validateAndParse(data);

      expect(result).toEqual({ prompt: "Build an API", year: 2024 });
    });

    it("should parse data with optional title", () => {
      const data = { prompt: "Build an API", year: 2024, title: "My API" };
      const result = handler.validateAndParse(data);

      expect(result).toEqual({
        prompt: "Build an API",
        year: 2024,
        title: "My API",
      });
    });

    it("should return null for invalid data", () => {
      const data = { prompt: "Build an API" }; // missing year
      const result = handler.validateAndParse(data);

      expect(result).toBeNull();
    });

    it("should return null when prompt is missing", () => {
      const data = { year: 2024 };
      const result = handler.validateAndParse(data);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    it("should generate project with AI content", async () => {
      const data = { prompt: "Build an API gateway", year: 2024 };
      const result = await handler.process(data, "job-123", progressReporter);

      expect(result.success).toBe(true);
      expect(result.entityId).toBe("project-123");
      expect(result.title).toBe("AI Project Title");
    });

    it("should use provided title instead of AI-generated", async () => {
      const data = {
        prompt: "Build an API gateway",
        year: 2024,
        title: "Custom Title",
      };
      const result = await handler.process(data, "job-123", progressReporter);

      expect(result.success).toBe(true);
      expect(result.title).toBe("Custom Title");
    });

    it("should call generateContent with correct template", async () => {
      const data = { prompt: "Build something cool", year: 2023 };
      await handler.process(data, "job-123", progressReporter);

      expect(context.generateContent).toHaveBeenCalledWith({
        prompt: "Build something cool",
        templateName: "portfolio:generation",
      });
    });

    it("should create entity with correct structure", async () => {
      const data = { prompt: "Build an API", year: 2024 };
      await handler.process(data, "job-123", progressReporter);

      expect(context.entityService.createEntity).toHaveBeenCalled();

      const createCall = (
        context.entityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const entityArg = createCall?.[0] as {
        entityType: string;
        content: string;
        metadata: { title: string; slug: string; status: string; year: number };
      };

      expect(entityArg.entityType).toBe("project");
      expect(entityArg.content).toContain("## Context");
      expect(entityArg.content).toContain("## Problem");
      expect(entityArg.content).toContain("## Solution");
      expect(entityArg.content).toContain("## Outcome");
      expect(entityArg.metadata.status).toBe("draft");
      expect(entityArg.metadata.year).toBe(2024);
    });

    it("should report progress throughout processing", async () => {
      const data = { prompt: "Build an API", year: 2024 };
      await handler.process(data, "job-123", progressReporter);

      const reportCalls = (progressReporter.report as ReturnType<typeof mock>)
        .mock.calls;
      expect(reportCalls.length).toBeGreaterThanOrEqual(4);

      // Check progress increases
      const progressValues = reportCalls.map(
        (call: unknown[]) => (call[0] as { progress: number }).progress,
      );
      for (let i = 1; i < progressValues.length; i++) {
        const current = progressValues[i];
        const previous = progressValues[i - 1];
        if (current !== undefined && previous !== undefined) {
          expect(current).toBeGreaterThanOrEqual(previous);
        }
      }
    });

    it("should return error result when generation fails", async () => {
      // Create a fresh context with failing generateContent
      const failingContext = createMockServicePluginContext({
        returns: {
          entityService: {
            createEntity: { entityId: "project-123" },
            getEntity: null,
            listEntities: [],
          },
        },
      });
      spyOn(failingContext, "generateContent").mockRejectedValue(
        new Error("AI unavailable"),
      );

      const failingHandler = new ProjectGenerationJobHandler(
        logger,
        failingContext,
      );
      const data = { prompt: "Build an API", year: 2024 };
      const result = await failingHandler.process(
        data,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("AI unavailable");
    });
  });

  describe("onError", () => {
    it("should log error details", async () => {
      const error = new Error("Processing failed");
      const data = { prompt: "Build an API", year: 2024 };

      await handler.onError(error, data, "job-123", progressReporter);

      expect(logger.error).toHaveBeenCalled();
    });
  });
});

describe("projectGenerationJobSchema", () => {
  it("should validate prompt and year", () => {
    const result = projectGenerationJobSchema.safeParse({
      prompt: "Test",
      year: 2024,
    });
    expect(result.success).toBe(true);
  });

  it("should require prompt", () => {
    const result = projectGenerationJobSchema.safeParse({ year: 2024 });
    expect(result.success).toBe(false);
  });

  it("should require year", () => {
    const result = projectGenerationJobSchema.safeParse({ prompt: "Test" });
    expect(result.success).toBe(false);
  });

  it("should accept optional title", () => {
    const result = projectGenerationJobSchema.safeParse({
      prompt: "Test",
      year: 2024,
      title: "My Title",
    });
    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("My Title");
  });
});
