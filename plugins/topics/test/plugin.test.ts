import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";
import { createServicePluginHarness } from "@brains/plugins";
import type { PluginCapabilities } from "@brains/plugins";
import { Logger } from "@brains/utils";

describe("TopicsPlugin", () => {
  let plugin: TopicsPlugin;
  let harness: ReturnType<typeof createServicePluginHarness>;
  let logger: Logger;

  beforeEach(async () => {
    logger = Logger.getInstance().child("test");

    // Create plugin with default config
    plugin = new TopicsPlugin();

    // Create test harness
    harness = await createServicePluginHarness({
      logger,
    });
  });

  describe("constructor", () => {
    it("should create plugin with default config", () => {
      const defaultPlugin = new TopicsPlugin();
      expect(defaultPlugin.id).toBe("topics");
      // Plugin.name is not exposed, check config instead
      expect(defaultPlugin.config).toBeDefined();
      expect(defaultPlugin.config.extractionWindowHours).toBe(24);
    });

    it("should create plugin with custom config", () => {
      const customPlugin = new TopicsPlugin({
        extractionWindowHours: 48,
        minRelevanceScore: 0.7,
      });

      expect(customPlugin.id).toBe("topics");
      expect(customPlugin.config.extractionWindowHours).toBe(48);
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
      expect(toolNames).toContain("topics:extract");
      expect(toolNames).toContain("topics:list");
      expect(toolNames).toContain("topics:get");
      expect(toolNames).toContain("topics:search");
      expect(toolNames).toContain("topics:merge");
    });

    it("should have proper tool schemas", async () => {
      const capabilities = await harness.installPlugin(plugin);
      const tools = capabilities.tools;

      const extractTool = tools.find((t) => t.name === "topics:extract");
      expect(extractTool).toBeDefined();
      expect(extractTool?.description).toContain("Extract topics");
      expect(extractTool?.inputSchema).toBeDefined();

      const listTool = tools.find((t) => t.name === "topics:list");
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
      expect(commandNames).toContain("topics:list");
      expect(commandNames).toContain("topics:extract");
      expect(commandNames).toContain("topics:get");
      expect(commandNames).toContain("topics:search");
    });
  });

  describe("resources", () => {
    it("should return empty array", async () => {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.resources).toEqual([]);
    });
  });
});
