import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";
import { createServicePluginHarness } from "@brains/plugins";
import type { PluginCapabilities } from "@brains/plugins";

describe("TopicsPlugin", () => {
  let plugin: TopicsPlugin;
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(async () => {
    // Create plugin with default config
    plugin = new TopicsPlugin();

    // Create test harness (uses silent logger by default)
    harness = createServicePluginHarness();
  });

  describe("constructor", () => {
    it("should create plugin with default config", () => {
      const defaultPlugin = new TopicsPlugin();
      expect(defaultPlugin.id).toBe("topics");
      // Plugin.name is not exposed, check config instead
      expect(defaultPlugin.config).toBeDefined();
      expect(defaultPlugin.config.windowSize).toBe(30);
    });

    it("should create plugin with custom config", () => {
      const customPlugin = new TopicsPlugin({
        windowSize: 50,
        minRelevanceScore: 0.7,
      });

      expect(customPlugin.id).toBe("topics");
      expect(customPlugin.config.windowSize).toBe(50);
      expect(customPlugin.config.minRelevanceScore).toBe(0.7);
    });
  });

  describe("registration", () => {
    it("should register successfully", async () => {
      // Install plugin in harness
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities).toBeDefined();
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });
  });

  describe("tools", () => {
    it("should provide MCP tools", async () => {
      // Install plugin and get capabilities
      const capabilities = await harness.installPlugin(plugin);
      const tools = capabilities.tools;

      expect(tools).toHaveLength(5); // We have 5 tools

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("topics-extract");
      expect(toolNames).toContain("topics-list");
      expect(toolNames).toContain("topics-get");
      expect(toolNames).toContain("topics-search");
      expect(toolNames).toContain("topics-merge");
    });

    it("should have proper tool schemas", async () => {
      const capabilities = await harness.installPlugin(plugin);
      const tools = capabilities.tools;

      const extractTool = tools.find((t) => t.name === "topics-extract");
      expect(extractTool).toBeDefined();
      expect(extractTool?.description).toContain("Extract topics");
      expect(extractTool?.inputSchema).toBeDefined();

      const listTool = tools.find((t) => t.name === "topics-list");
      expect(listTool).toBeDefined();
      expect(listTool?.description).toContain("List all topics");
      expect(listTool?.inputSchema).toBeDefined();
    });
  });

  describe("commands", () => {
    it("should provide CLI commands", async () => {
      const capabilities = await harness.installPlugin(plugin);
      const commands = capabilities.commands;

      expect(commands.length).toBeGreaterThan(0);

      const commandNames = commands.map((c) => c.name);
      expect(commandNames).toContain("topics-list");
      expect(commandNames).toContain("topics-extract");
      expect(commandNames).toContain("topics-get");
      expect(commandNames).toContain("topics-search");
    });
  });

  describe("resources", () => {
    it("should return empty array", async () => {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.resources).toEqual([]);
    });
  });
});
