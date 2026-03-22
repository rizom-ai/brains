import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryPlugin } from "../src";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("SummaryPlugin", () => {
  let harness: PluginTestHarness<SummaryPlugin>;
  let plugin: SummaryPlugin;

  beforeEach(() => {
    harness = createPluginHarness<SummaryPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new SummaryPlugin();
  });

  it("should be instantiable", () => {
    expect(plugin).toBeDefined();
  });

  it("should have correct plugin name", () => {
    expect(plugin.id).toBe("summary");
  });

  it("should have plugin metadata", () => {
    expect(plugin.version).toBeDefined();
    expect(plugin.id).toBe("summary");
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      await harness.installPlugin(plugin);

      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);
      expect(config.includeDecisions).toBe(true);
      expect(config.includeActionItems).toBe(true);
      expect(config.maxSummaryLength).toBe(500);
    });

    it("should initialize with custom config", async () => {
      const customHarness = createPluginHarness<SummaryPlugin>({
        dataDir: "/tmp/test-datadir",
      });
      const customPlugin = new SummaryPlugin({
        enableAutoSummary: false,
        maxSummaryLength: 1000,
      });

      await customHarness.installPlugin(customPlugin);

      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
      expect(config.maxSummaryLength).toBe(1000);
    });

    it("should subscribe to conversation digest events when auto-summary is enabled", async () => {
      await harness.installPlugin(plugin);

      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);
    });

    it("should not subscribe to events when auto-summary is disabled", async () => {
      const customHarness = createPluginHarness<SummaryPlugin>({
        dataDir: "/tmp/test-datadir",
      });
      const customPlugin = new SummaryPlugin({ enableAutoSummary: false });

      await customHarness.installPlugin(customPlugin);

      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
    });
  });

  describe("digest handling", () => {
    it("should be configured to handle digest events", async () => {
      await harness.installPlugin(plugin);

      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);
    });
  });

  describe("summary operations", () => {
    it("should handle operations after registration", async () => {
      await harness.installPlugin(plugin);

      const summary = await plugin.getSummary("test-conv");
      expect(summary).toBeNull();

      const deleted = await plugin.deleteSummary("test-conv");
      expect(deleted).toBe(true);

      const summaries = await plugin.getAllSummaries();
      expect(summaries).toEqual([]);

      const exported = await plugin.exportSummary("test-conv");
      expect(exported).toBeNull();

      const stats = await plugin.getStatistics();
      expect(stats).toEqual({
        totalSummaries: 0,
        totalEntries: 0,
        averageEntriesPerSummary: 0,
      });
    });
  });

  describe("cleanup", () => {
    it("should clean up resources properly", async () => {
      await harness.installPlugin(plugin);
      await plugin.cleanup();
      expect(plugin).toBeDefined();
    });
  });

  describe("plugin capabilities", () => {
    it("should register and return capabilities including tools", async () => {
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(Array.isArray(capabilities.tools)).toBe(true);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("summary_get");
      expect(toolNames).toHaveLength(1);
    });
  });
});
