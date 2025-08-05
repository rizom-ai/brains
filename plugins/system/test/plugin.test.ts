import { describe, expect, it, beforeEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import type { InterfacePluginContext } from "@brains/plugins";
import type { BaseEntity, SearchResult } from "@brains/plugins";

describe("SystemPlugin", () => {
  let plugin: SystemPlugin;
  let mockContext: Partial<InterfacePluginContext>;

  beforeEach(() => {
    // Create mock context
    mockContext = {
      entityService: {
        search: async (query: string, options?: any) => {
          // Mock search results
          const results: SearchResult[] = [
            {
              entity: {
                id: "test-1",
                entityType: "base",
                content: "Test content matching " + query,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                metadata: { title: "Test Entity 1" },
              },
              score: 0.9,
            },
          ];
          return results;
        },
        getEntity: async (type: string, id: string) => {
          if (id === "test-1") {
            return {
              id: "test-1",
              entityType: type,
              content: "Test content",
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
              metadata: { title: "Test Entity" },
            };
          }
          return null;
        },
      } as any,
      query: async (prompt: string, context?: any) => {
        return {
          query: prompt,
          response: "AI response to: " + prompt,
          entities: [],
        };
      },
      getActiveJobs: async () => [],
      getActiveBatches: async () => [],
      getBatchStatus: async (batchId: string) => null,
    } as InterfacePluginContext;

    plugin = new SystemPlugin({ searchLimit: 5, debug: false });
    // Inject mock context
    (plugin as any).context = mockContext;
  });

  describe("searchEntities", () => {
    it("should search entities using entity service", async () => {
      const results = await plugin.searchEntities("test query");

      expect(results).toHaveLength(1);
      expect(results[0]?.entity.content).toContain("test query");
      expect(results[0]?.score).toBe(0.9);
    });

    it("should handle search options", async () => {
      const results = await plugin.searchEntities("test", {
        limit: 10,
        types: ["note"],
        sortBy: "relevance",
      });

      expect(results).toBeDefined();
    });
  });

  describe("getEntity", () => {
    it("should get entity by type and id", async () => {
      const entity = await plugin.getEntity("base", "test-1");

      expect(entity).toBeDefined();
      expect(entity?.id).toBe("test-1");
      expect(entity?.entityType).toBe("base");
    });

    it("should return null for non-existent entity", async () => {
      const entity = await plugin.getEntity("base", "non-existent");

      expect(entity).toBeNull();
    });
  });

  describe("query", () => {
    it("should perform AI-powered query", async () => {
      const result = await plugin.query("test prompt");

      expect(result.query).toBe("test prompt");
      expect(result.response).toContain("AI response");
    });
  });

  describe("getJobStatus", () => {
    it("should get job status without batchId", async () => {
      const status = await plugin.getJobStatus();

      expect(status.activeJobs).toBeDefined();
      expect(status.activeBatches).toBeDefined();
    });
  });

  describe("commands", () => {
    it("should provide search, get, and getjobstatus commands", async () => {
      const commands = await (plugin as any).getCommands();

      expect(commands).toHaveLength(3);

      const commandNames = commands.map((cmd: any) => cmd.name);
      expect(commandNames).toContain("search");
      expect(commandNames).toContain("get");
      expect(commandNames).toContain("getjobstatus");
    });
  });

  describe("tools", () => {
    it("should provide system tools", async () => {
      const tools = await (plugin as any).getTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((tool: any) => tool.name);
      expect(toolNames).toContain("system:query");
      expect(toolNames).toContain("system:search");
      expect(toolNames).toContain("system:get");
      expect(toolNames).toContain("system:check-job-status");
    });
  });
});
