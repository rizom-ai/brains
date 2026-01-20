import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { PortfolioPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("PortfolioPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: PortfolioPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test-datadir" });

    plugin = new PortfolioPlugin({});
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("portfolio");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should provide portfolio_create tool", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("portfolio_create");
    });

    it("should not provide any resources", () => {
      expect(capabilities.resources).toEqual([]);
    });
  });

  describe("Tool Schemas", () => {
    it("portfolio_create should require topic and year", () => {
      const createTool = capabilities.tools.find(
        (t) => t.name === "portfolio_create",
      );
      expect(createTool).toBeDefined();
      if (!createTool) throw new Error("createTool not found");
      expect(createTool.inputSchema["topic"]).toBeDefined();
      expect(createTool.inputSchema["year"]).toBeDefined();
    });

    it("portfolio_create should have optional title", () => {
      const createTool = capabilities.tools.find(
        (t) => t.name === "portfolio_create",
      );
      expect(createTool).toBeDefined();
      if (!createTool) throw new Error("createTool not found");
      const titleSchema = createTool.inputSchema["title"];
      expect(titleSchema).toBeDefined();
      if (!titleSchema) throw new Error("titleSchema not found");
      expect(titleSchema._def.typeName).toBe("ZodOptional");
    });
  });

  describe("Tool Execution", () => {
    it("portfolio_create should queue a job", async () => {
      const result = await harness.executeTool("portfolio_create", {
        topic: "Test Project",
        year: 2024,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("jobId");
    });
  });
});
