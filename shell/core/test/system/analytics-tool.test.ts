import { describe, it, expect, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { toolResponseSchema } from "@brains/mcp-service";
import {
  defineAnalyticsReport,
  type AnalyticsReportDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

// The brain's owner, who sees work in progress; public callers are below.
const toolContext: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "test" },
  userPermissionLevel: "admin",
};

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

describe("system_analytics tool", () => {
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
    tool = findTool(tools, "system_analytics");
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
      const analyticsTool = findTool(tools, "system_analytics");
      expect(
        expectSuccessData(
          await analyticsTool.handler({ type: "content-health" }, toolContext),
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

  describe("core report params", () => {
    const cadence = async (
      params: Record<string, unknown>,
    ): Promise<
      Array<{ month: string; counts: Record<string, number>; total: number }>
    > => {
      const data = expectSuccessData(
        await tool.handler({ type: "publishing-cadence", params }, toolContext),
      );
      if (
        typeof data !== "object" ||
        data === null ||
        !("months" in data) ||
        !Array.isArray(data.months)
      )
        throw new Error("Expected cadence months");
      return data.months;
    };

    it("counts a piece in the month it was published, not imported", async () => {
      services.addEntities([
        makeEntity("imported", "post", {
          created: "2026-03-28T10:00:00Z",
          metadata: {
            title: "Imported",
            status: "published",
            publishedAt: "2024-09-15T10:00:00Z",
          },
        }),
      ]);
      tool = findTool(createSystemTools(services), "system_analytics");

      const months = await cadence({ entityTypes: ["post"] });
      expect(months.find((m) => m.month === "2024-09")?.counts).toEqual({
        post: 1,
      });
      expect(months.find((m) => m.month === "2026-03")?.counts).toEqual({
        post: 2,
      });
    });

    it("narrows the cadence to types and months", async () => {
      expect(
        await cadence({
          entityTypes: ["note"],
          from: "2026-03",
          to: "2026-03",
        }),
      ).toEqual([{ month: "2026-03", counts: { note: 2 }, total: 2 }]);
      expect(await cadence({ from: "2026-04" })).toEqual([]);
    });

    it("calls content stale after the days asked for, within the types asked for", async () => {
      const fortyDaysAgo = new Date(
        Date.now() - 40 * 24 * 60 * 60 * 1000,
      ).toISOString();
      services.addEntities([
        makeEntity("quiet-note", "note", {
          updated: fortyDaysAgo,
          metadata: { title: "Quiet note" },
        }),
      ]);
      tool = findTool(createSystemTools(services), "system_analytics");
      const stale = async (params: Record<string, unknown>): Promise<unknown> =>
        expectSuccessData(
          await tool.handler({ type: "content-health", params }, toolContext),
        );

      expect(await stale({})).toMatchObject({ stale: [] });
      expect(await stale({ staleDays: 30 })).toMatchObject({
        stale: [expect.objectContaining({ id: "quiet-note" })],
      });
      expect(
        await stale({ staleDays: 30, entityTypes: ["post"] }),
      ).toMatchObject({
        stale: [],
        drafts: [expect.objectContaining({ id: "post-2" })],
      });
    });
  });

  describe("plugin reports", () => {
    function rangeReport(seen: number[]): AnalyticsReportDefinition {
      return defineAnalyticsReport({
        type: "custom-range",
        description: "A plugin report over a number of days.",
        params: z.object({
          days: z.number().int().min(1).default(7).describe("Days to cover"),
        }),
        handler: async ({ days }) => {
          seen.push(days);
          return { days };
        },
      });
    }

    it("runs a plugin's report with its typed params", async () => {
      const seen: number[] = [];
      services.analytics.register(rangeReport(seen));
      const analyticsTool = findTool(
        createSystemTools(services),
        "system_analytics",
      );

      expect(
        expectSuccessData(
          await analyticsTool.handler(
            { type: "custom-range", params: { days: 30 } },
            toolContext,
          ),
        ),
      ).toEqual({ days: 30 });
      await analyticsTool.handler({ type: "custom-range" }, toolContext);
      expect(seen).toEqual([30, 7]);
    });

    it("refuses params the report does not accept, naming the report", async () => {
      services.analytics.register(rangeReport([]));
      const analyticsTool = findTool(
        createSystemTools(services),
        "system_analytics",
      );

      const error = expectError(
        await analyticsTool.handler(
          { type: "custom-range", params: { days: 0 } },
          toolContext,
        ),
      );
      expect(error).toContain("custom-range");
      expect(error).toContain("days");
    });

    it("shows every report and its params in the tool's input schema", () => {
      services.analytics.register(rangeReport([]));
      const analyticsTool = findTool(
        createSystemTools(services),
        "system_analytics",
      );

      const schema = JSON.stringify(
        z.toJSONSchema(z.object(analyticsTool.inputSchema)),
      );
      for (const type of ["overview", "content-health", "custom-range"]) {
        expect(schema).toContain(`"${type}"`);
      }
      expect(schema).toContain("Days to cover");
      expect(analyticsTool.description).toContain("custom-range");
    });

    it("keeps a report above the caller's level from them", async () => {
      services.analytics.register(
        defineAnalyticsReport({
          type: "operational",
          description: "Operational numbers for the owner.",
          params: z.object({}),
          minVisibility: "admin",
          handler: async () => ({ secret: 1 }),
        }),
      );
      const analyticsTool = findTool(
        createSystemTools(services),
        "system_analytics",
      );

      const error = expectError(
        await analyticsTool.handler(
          { type: "operational" },
          { ...toolContext, userPermissionLevel: "trusted" },
        ),
      );
      expect(error).toContain("operational");
      expect(
        expectSuccessData(
          await analyticsTool.handler({ type: "operational" }, toolContext),
        ),
      ).toEqual({ secret: 1 });
    });
  });

  describe("invalid type", () => {
    it("names the reports it has when asked for another", async () => {
      const error = expectError(
        await tool.handler({ type: "nonexistent" }, toolContext),
      );

      expect(error).toContain("overview");
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

    it("hides non-public counts and drafts from a public caller", async () => {
      // Only the 2 published public posts; the draft, shared and restricted
      // posts are invisible.
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "overview" },
            { ...toolContext, userPermissionLevel: "public" },
          ),
        ),
      ).toMatchObject({
        entityCounts: { post: 2, note: 2, link: 1 },
        totalEntities: 5,
        contentHealth: { drafts: 0, published: 2 },
      });
    });

    it("lists no drafts to a public caller", async () => {
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "content-health" },
            { ...toolContext, userPermissionLevel: "public" },
          ),
        ),
      ).toMatchObject({ drafts: [] });
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

    it("shows every visibility tier for an Admin caller", async () => {
      expect(
        expectSuccessData(
          await tool.handler(
            { type: "overview" },
            { ...toolContext, userPermissionLevel: "admin" },
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
      expect(tool.name).toBe("system_analytics");
    });

    it("should be publicly visible", () => {
      expect(tool.visibility).toBe("public");
    });

    it("declares read-only side effects", () => {
      expect(tool.sideEffects).toBe("none");
    });
  });
});
