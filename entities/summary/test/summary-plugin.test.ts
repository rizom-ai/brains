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

  it("should register as entity plugin", async () => {
    await harness.installPlugin(plugin);
    expect(plugin.type).toBe("entity");
  });

  it("should register summary entity type", async () => {
    await harness.installPlugin(plugin);
    expect(harness.getEntityService().getEntityTypes()).toContain("summary");
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
      const customPlugin = new SummaryPlugin({
        enableAutoSummary: false,
        maxSummaryLength: 1000,
      });
      await harness.installPlugin(customPlugin);

      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
      expect(config.maxSummaryLength).toBe(1000);
    });
  });

  describe("capabilities", () => {
    it("should return zero tools", async () => {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.tools).toHaveLength(0);
    });

    it("should register templates", async () => {
      await harness.installPlugin(plugin);
      const templates = harness.getTemplates();
      const names = Array.from(templates.keys());
      expect(names.some((n) => n.includes("summary-list"))).toBe(true);
      expect(names.some((n) => n.includes("summary-detail"))).toBe(true);
    });

    it("should register datasource", async () => {
      await harness.installPlugin(plugin);
      const dataSources = harness.getDataSources();
      const ids = Array.from(dataSources.keys());
      expect(ids.some((id) => id.includes("summary"))).toBe(true);
    });
  });
});
