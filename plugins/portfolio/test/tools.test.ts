import { describe, it, expect, beforeEach, mock } from "bun:test";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";
import { createPortfolioTools } from "../src/tools";
import { createMockServicePluginContext } from "@brains/test-utils";

// Mock context
function createMockContext(): ServicePluginContext {
  const mockContext = createMockServicePluginContext({
    returns: {
      enqueueJob: "job-456",
      generateContent: {
        title: "AI Project",
        description: "AI generated description",
        context: "AI context",
        problem: "AI problem",
        solution: "AI solution",
        outcome: "AI outcome",
      },
      entityService: {
        createEntity: { entityId: "project-123" },
        getEntity: {
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
          contentHash: "abc123",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
          metadata: {
            title: "Test Project",
            slug: "test-project",
            status: "draft",
            year: 2024,
          },
        },
        updateEntity: { entityId: "project-123" },
      },
    },
  });

  // Override listEntities with conditional logic using mock cast
  const listEntitiesMock = mockContext.entityService.listEntities as ReturnType<
    typeof mock
  >;
  listEntitiesMock.mockImplementation(
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
            contentHash: "abc123",
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-01T00:00:00Z",
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
  );

  return mockContext;
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
  let createTool: PluginTool;
  let publishTool: PluginTool;

  beforeEach(() => {
    context = createMockContext();
    tools = createPortfolioTools("portfolio", context);
    createTool = getTool(tools, "portfolio_create");
    publishTool = getTool(tools, "portfolio_publish");
  });

  describe("createPortfolioTools", () => {
    it("should create two tools", () => {
      expect(tools).toHaveLength(2);
    });

    it("should create portfolio_create tool", () => {
      expect(createTool).toBeDefined();
      expect(createTool.description).toContain("case study");
    });

    it("should create portfolio_publish tool", () => {
      expect(publishTool).toBeDefined();
      expect(publishTool.description.toLowerCase()).toContain("publish");
    });
  });

  describe("portfolio_create", () => {
    it("should search for related content and queue generation job", async () => {
      const result = await createTool.handler(
        { topic: "Rizom Brains", year: 2024 },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.jobId).toBe("job-456");
      expect(context.enqueueJob).toHaveBeenCalled();
      expect(context.entityService.search).toHaveBeenCalled();
    });

    it("should require topic", async () => {
      const result = await createTool.handler(
        { year: 2024 },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should require year", async () => {
      const result = await createTool.handler(
        { topic: "Some Project" },
        createMockToolContext(),
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toBeDefined();
    });

    it("should accept optional title", async () => {
      const result = await createTool.handler(
        { topic: "API Gateway", year: 2023, title: "My API Project" },
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

    it("should include found entities count in response", async () => {
      const result = await createTool.handler(
        { topic: "Test Project", year: 2024 },
        createMockToolContext(),
      );

      expect(result.success).toBe(true);
      expect(result.data?.["relatedEntitiesFound"]).toBeDefined();
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
      const emptyContext = createMockServicePluginContext({
        returns: {
          entityService: {
            listEntities: [], // Always empty
          },
        },
      });

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
