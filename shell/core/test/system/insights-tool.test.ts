import { describe, it, expect, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { toolResponseSchema } from "@brains/mcp-service";

const toolContext: ToolContext = { interfaceType: "mcp", userId: "test" };

function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

function expectSuccessData(raw: unknown): unknown {
  const result = toolResponseSchema.parse(raw);
  if (!("success" in result) || !result.success) {
    throw new Error("Expected tool success response");
  }
  return result.data;
}

function expectError(raw: unknown): string {
  const result = toolResponseSchema.parse(raw);
  if (!("success" in result) || result.success) {
    throw new Error("Expected tool error response");
  }
  return result.error;
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
    visibility: overrides.visibility ?? "public",
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

    const tools = createSystemTools(services);
    tool = findTool(tools, "system_insights");
  });

  describe("overview", () => {
    it("should return entity counts", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "overview" }, toolContext),
        ),
      ).toMatchObject({
        entityCounts: { post: 3, note: 2, link: 1 },
      });
    });

    it("should return total entity count", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "overview" }, toolContext),
        ),
      ).toMatchObject({ totalEntities: 6 });
    });

    it("should return content health summary", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "overview" }, toolContext),
        ),
      ).toMatchObject({
        contentHealth: { drafts: 1, published: 2 },
      });
    });
  });

  describe("publishing-cadence", () => {
    it("should group entity creation by month", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "publishing-cadence" }, toolContext),
        ),
      ).toEqual(
        expect.objectContaining({
          months: expect.arrayContaining([
            expect.objectContaining({ month: "2026-03" }),
          ]),
        }),
      );
    });

    it("should break down counts by entity type", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "publishing-cadence" }, toolContext),
        ),
      ).toEqual(
        expect.objectContaining({
          months: expect.arrayContaining([
            expect.objectContaining({
              month: "2026-03",
              counts: expect.objectContaining({ note: 2 }),
            }),
          ]),
        }),
      );
    });

    it("should sort months descending", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "publishing-cadence" }, toolContext),
        ),
      ).toMatchObject({
        months: [{ month: "2026-03" }, { month: "2026-02" }],
      });
    });
  });

  describe("content-health", () => {
    it("should list draft entities", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "content-health" }, toolContext),
        ),
      ).toEqual(
        expect.objectContaining({
          drafts: expect.arrayContaining([
            expect.objectContaining({ id: "post-2" }),
          ]),
        }),
      );
    });

    it("should include title and entityType in drafts", async () => {
      expect(
        expectSuccessData(
          await tool.handler({ type: "content-health" }, toolContext),
        ),
      ).toEqual(
        expect.objectContaining({
          drafts: expect.arrayContaining([
            expect.objectContaining({
              id: "post-2",
              entityType: "post",
              title: "Post Two",
            }),
          ]),
        }),
      );
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

      const tools = createSystemTools(services);
      const insightsTool = findTool(tools, "system_insights");
      expect(
        expectSuccessData(
          await insightsTool.handler({ type: "content-health" }, toolContext),
        ),
      ).toEqual(
        expect.objectContaining({
          stale: expect.arrayContaining([
            expect.objectContaining({
              id: "old-post",
              daysSinceUpdate: expect.any(Number),
            }),
          ]),
        }),
      );
    });
  });

  describe("extensibility", () => {
    it("should support plugin-registered insight types", async () => {
      services.insights.register("custom-metric", async () => ({
        customValue: 42,
      }));

      const tools = createSystemTools(services);
      const insightsTool = findTool(tools, "system_insights");
      expect(
        expectSuccessData(
          await insightsTool.handler({ type: "custom-metric" }, toolContext),
        ),
      ).toMatchObject({ customValue: 42 });
    });

    it("should list registered types in description", async () => {
      services.insights.register("topic-distribution", async () => ({}));

      const tools = createSystemTools(services);
      const insightsTool = findTool(tools, "system_insights");

      expect(insightsTool.description).toContain("topic-distribution");
    });
  });

  describe("invalid type", () => {
    it("should return error for unknown insight type", async () => {
      const error = expectError(
        await tool.handler({ type: "nonexistent" }, toolContext),
      );

      expect(error).toContain("Unknown insight type");
    });
  });

  describe("visibility scope", () => {
    beforeEach(() => {
      services.addEntities([
        makeEntity("post-shared", "post", {
          visibility: "shared",
          metadata: { title: "Shared Post", status: "published" },
        }),
        makeEntity("post-restricted", "post", {
          visibility: "restricted",
          metadata: { title: "Restricted Post", status: "published" },
        }),
      ]);
    });

    it("hides non-public counts from a public caller", async () => {
      // Only the 3 public posts; shared + restricted are invisible.
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "overview" },
            { ...toolContext, userPermissionLevel: "public" },
          ),
        ),
      ).toMatchObject({
        entityCounts: { post: 3 },
        totalEntities: 6,
      });
    });

    it("includes shared but not restricted counts for a trusted caller", async () => {
      // 3 public + 1 shared = 4 posts; restricted hidden.
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "overview" },
            { ...toolContext, userPermissionLevel: "trusted" },
          ),
        ),
      ).toMatchObject({
        entityCounts: { post: 4 },
        totalEntities: 7,
      });
    });

    it("shows every visibility tier for an anchor caller", async () => {
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "overview" },
            { ...toolContext, userPermissionLevel: "anchor" },
          ),
        ),
      ).toMatchObject({
        entityCounts: { post: 5 },
        totalEntities: 8,
      });
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
