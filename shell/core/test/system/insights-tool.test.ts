import { describe, it, expect, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { SystemServices } from "../../src/system/types";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolResult } from "@brains/mcp-service";

const toolContext = { interfaceType: "mcp" as const, userId: "test" };

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

function parseResult(raw: unknown): {
  success: boolean;
  data?: Record<string, unknown> | undefined;
  error?: string | undefined;
  message?: string | undefined;
} {
  const result = raw as ToolResult;
  if (result.success) {
    return {
      success: true,
      data: result.data as Record<string, unknown>,
      message: result.message,
    };
  }
  return { success: false, error: result.error };
}

function makeEntity(
  id: string,
  entityType: string,
  overrides: Partial<BaseEntity> = {},
): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType,
    content: `# ${id}`,
    contentHash: "abc",
    created: overrides.created ?? now,
    updated: overrides.updated ?? now,
    metadata: overrides.metadata ?? { title: id },
  };
}

describe("system_insights tool", () => {
  let services: ReturnType<typeof createMockSystemServices>;
  let tool: Tool;

  beforeEach(() => {
    services = createMockSystemServices();

    services.addEntities([
      makeEntity("post-1", "post", {
        created: "2026-03-01T10:00:00Z",
        metadata: { title: "Post One", status: "published" },
      }),
      makeEntity("post-2", "post", {
        created: "2026-03-15T10:00:00Z",
        metadata: { title: "Post Two", status: "draft" },
      }),
      makeEntity("post-3", "post", {
        created: "2026-02-10T10:00:00Z",
        metadata: { title: "Post Three", status: "published" },
      }),
      makeEntity("note-1", "note", {
        created: "2026-03-20T10:00:00Z",
        metadata: { title: "Note One" },
      }),
      makeEntity("note-2", "note", {
        created: "2026-03-22T10:00:00Z",
        metadata: { title: "Note Two" },
      }),
      makeEntity("link-1", "link", {
        created: "2026-03-25T10:00:00Z",
        metadata: { title: "Link One" },
      }),
    ]);

    const tools = createSystemTools(services as unknown as SystemServices);
    tool = findTool(tools, "system_insights");
  });

  describe("overview", () => {
    it("should return entity counts", async () => {
      const result = parseResult(
        await tool.handler({ type: "overview" }, toolContext),
      );

      expect(result.success).toBe(true);
      const counts = result.data?.["entityCounts"] as Record<string, number>;
      expect(counts["post"]).toBe(3);
      expect(counts["note"]).toBe(2);
      expect(counts["link"]).toBe(1);
    });

    it("should return total entity count", async () => {
      const result = parseResult(
        await tool.handler({ type: "overview" }, toolContext),
      );

      expect(result.success).toBe(true);
      expect(result.data?.["totalEntities"]).toBe(6);
    });

    it("should return content health summary", async () => {
      const result = parseResult(
        await tool.handler({ type: "overview" }, toolContext),
      );

      expect(result.success).toBe(true);
      const health = result.data?.["contentHealth"] as Record<string, number>;
      expect(health["drafts"]).toBe(1);
      expect(health["published"]).toBe(2);
    });
  });

  describe("publishing-cadence", () => {
    it("should group entity creation by month", async () => {
      const result = parseResult(
        await tool.handler({ type: "publishing-cadence" }, toolContext),
      );

      expect(result.success).toBe(true);
      const months = result.data?.["months"] as Array<{
        month: string;
        total: number;
      }>;
      expect(months.length).toBeGreaterThan(0);

      const march = months.find((m) => m.month === "2026-03");
      expect(march).toBeDefined();
      expect(march?.total).toBeGreaterThan(0);
    });

    it("should break down counts by entity type", async () => {
      const result = parseResult(
        await tool.handler({ type: "publishing-cadence" }, toolContext),
      );

      const months = result.data?.["months"] as Array<{
        month: string;
        counts: Record<string, number>;
      }>;
      const march = months.find((m) => m.month === "2026-03");
      expect(march?.counts["note"]).toBe(2);
    });

    it("should sort months descending", async () => {
      const result = parseResult(
        await tool.handler({ type: "publishing-cadence" }, toolContext),
      );

      const months = result.data?.["months"] as Array<{ month: string }>;
      expect(months[0]?.month).toBe("2026-03");
      expect(months[1]?.month).toBe("2026-02");
    });
  });

  describe("content-health", () => {
    it("should list draft entities", async () => {
      const result = parseResult(
        await tool.handler({ type: "content-health" }, toolContext),
      );

      expect(result.success).toBe(true);
      const drafts = result.data?.["drafts"] as Array<{ id: string }>;
      expect(drafts.some((d) => d.id === "post-2")).toBe(true);
    });

    it("should include title and entityType in drafts", async () => {
      const result = parseResult(
        await tool.handler({ type: "content-health" }, toolContext),
      );

      const drafts = result.data?.["drafts"] as Array<{
        id: string;
        entityType: string;
        title: string;
      }>;
      const draft = drafts.find((d) => d.id === "post-2");
      expect(draft?.entityType).toBe("post");
      expect(draft?.title).toBe("Post Two");
    });

    it("should list stale entities", async () => {
      // Add an entity updated > 90 days ago
      services.addEntities([
        makeEntity("old-post", "post", {
          created: "2025-01-01T10:00:00Z",
          updated: "2025-01-01T10:00:00Z",
          metadata: { title: "Old Post", status: "published" },
        }),
      ]);

      const tools = createSystemTools(services as unknown as SystemServices);
      const insightsTool = findTool(tools, "system_insights");
      const result = parseResult(
        await insightsTool.handler({ type: "content-health" }, toolContext),
      );

      const stale = result.data?.["stale"] as Array<{
        id: string;
        daysSinceUpdate: number;
      }>;
      expect(stale.some((s) => s.id === "old-post")).toBe(true);
      const oldPost = stale.find((s) => s.id === "old-post");
      expect(oldPost?.daysSinceUpdate).toBeGreaterThan(90);
    });
  });

  describe("extensibility", () => {
    it("should support plugin-registered insight types", async () => {
      services.insights.register("custom-metric", async () => ({
        customValue: 42,
      }));

      const tools = createSystemTools(services as unknown as SystemServices);
      const insightsTool = findTool(tools, "system_insights");
      const result = parseResult(
        await insightsTool.handler({ type: "custom-metric" }, toolContext),
      );

      expect(result.success).toBe(true);
      expect(result.data?.["customValue"]).toBe(42);
    });

    it("should list registered types in description", async () => {
      services.insights.register("topic-distribution", async () => ({}));

      const tools = createSystemTools(services as unknown as SystemServices);
      const insightsTool = findTool(tools, "system_insights");

      expect(insightsTool.description).toContain("topic-distribution");
    });
  });

  describe("invalid type", () => {
    it("should return error for unknown insight type", async () => {
      const result = parseResult(
        await tool.handler({ type: "nonexistent" }, toolContext),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("system_insights");
    });

    it("should be publicly visible", () => {
      expect(tool.visibility).toBe("public");
    });
  });
});
