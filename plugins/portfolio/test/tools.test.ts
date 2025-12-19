import { describe, it, expect, beforeEach, mock } from "bun:test";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";
import { createPortfolioTools } from "../src/tools";

// Mock context
function createMockContext(): ServicePluginContext {
  return {
    entityService: {
      createEntity: mock(() =>
        Promise.resolve({ entityId: "project-123", contentHash: "abc123" }),
      ),
      getEntity: mock(() =>
        Promise.resolve({
          id: "test-project",
          entityType: "project",
          content: `---
title: Test Project
status: draft
description: Test
year: 2024
---

## Context

Test context`,
          metadata: {
            title: "Test Project",
            slug: "test-project",
            status: "draft",
            year: 2024,
          },
        }),
      ),
      updateEntity: mock(() =>
        Promise.resolve({ entityId: "project-123", contentHash: "def456" }),
      ),
      deleteEntity: mock(() => Promise.resolve()),
      listEntities: mock(
        (
          _entityType: string,
          options?: { filter?: { metadata?: { slug?: string } } },
        ) => {
          // Return matching project when filter matches
          if (options?.filter?.metadata?.slug === "test-project") {
            return Promise.resolve([
              {
                id: "test-project",
                entityType: "project",
                content: `---
title: Test Project
status: draft
description: Test
year: 2024
---

## Context

Test context

## Problem

Test problem

## Solution

Test solution

## Outcome

Test outcome`,
                metadata: {
                  title: "Test Project",
                  slug: "test-project",
                  status: "draft",
                  year: 2024,
                },
              },
            ]);
          }
          return Promise.resolve([]);
        },
      ),
      searchEntities: mock(() => Promise.resolve([])),
    } as unknown as ServicePluginContext["entityService"],
    enqueueJob: mock(() => Promise.resolve("job-456")),
    generateContent: mock(() =>
      Promise.resolve({
        title: "AI Project",
        description: "AI generated description",
        context: "AI context",
        problem: "AI problem",
        solution: "AI solution",
        outcome: "AI outcome",
      }),
    ),
    logger: {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    } as unknown as ServicePluginContext["logger"],
  } as unknown as ServicePluginContext;
}

function createMockToolContext(): ToolContext {
  return {
    interfaceType: "cli",
    userId: "user-789",
  };
}

function getTool(tools: PluginTool[], name: string): PluginTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

describe("Portfolio Tools", () => {
  let context: ServicePluginContext;
  let tools: ReturnType<typeof createPortfolioTools>;
  let generateTool: PluginTool;
  let publishTool: PluginTool;

  beforeEach(() => {
    context = createMockContext();
    tools = createPortfolioTools("portfolio", context);
    generateTool = getTool(tools, "portfolio_generate");
    publishTool = getTool(tools, "portfolio_publish");
  });

  describe("createPortfolioTools", () => {
    it("should create two tools", () => {
      expect(tools).toHaveLength(2);
    });

    it("should create portfolio_generate tool", () => {
      expect(generateTool).toBeDefined();
      expect(generateTool.description).toContain("AI");
    });

    it("should create portfolio_publish tool", () => {
      expect(publishTool).toBeDefined();
      expect(publishTool.description.toLowerCase()).toContain("publish");
    });
  });

  describe("portfolio_generate", () => {
    it("should queue a generation job with prompt and year", async () => {
      const result = await generateTool.handler(
        { prompt: "Create a project about building an API", year: 2024 },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.jobId).toBe("job-456");
      expect(context.enqueueJob).toHaveBeenCalled();
    });

    it("should require prompt", async () => {
      const result = await generateTool.handler(
        { year: 2024 },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should require year", async () => {
      const result = await generateTool.handler(
        { prompt: "Build something" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should accept optional title", async () => {
      const result = await generateTool.handler(
        { prompt: "Build an API", year: 2023, title: "My API Project" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(context.enqueueJob).toHaveBeenCalledWith(
        "generation",
        expect.objectContaining({ title: "My API Project" }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("portfolio_publish", () => {
    it("should publish a draft project", async () => {
      const result = await publishTool.handler(
        { slug: "test-project" },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(context.entityService.updateEntity).toHaveBeenCalled();
    });

    it("should require slug", async () => {
      const result = await publishTool.handler({}, createMockToolContext());

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should fail if project not found", async () => {
      // Create context that returns empty for nonexistent slug
      const emptyContext = {
        ...context,
        entityService: {
          ...context.entityService,
          listEntities: mock(() => Promise.resolve([])), // Always empty
        },
      } as unknown as ServicePluginContext;

      const emptyTools = createPortfolioTools("portfolio", emptyContext);
      const emptyPublishTool = getTool(emptyTools, "portfolio_publish");

      const result = await emptyPublishTool.handler(
        { slug: "nonexistent" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not found");
    });
  });
});
