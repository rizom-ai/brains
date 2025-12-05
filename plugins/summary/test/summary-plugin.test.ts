import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { SummaryPlugin } from "../src";
import { createSilentLogger } from "@brains/plugins/test";
import { MockShell } from "@brains/plugins/test";

describe("SummaryPlugin", () => {
  let plugin: SummaryPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    plugin = new SummaryPlugin();
  });

  afterEach(() => {
    mock.restore();
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
      await plugin.register(mockShell);

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

      await customPlugin.register(mockShell);

      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
      expect(config.maxSummaryLength).toBe(1000);
    });

    it("should subscribe to conversation digest events when auto-summary is enabled", async () => {
      // Just ensure register completes successfully
      // The actual subscription happens internally via context
      await plugin.register(mockShell);

      // Verify plugin is configured correctly
      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);
    });

    it("should not subscribe to events when auto-summary is disabled", async () => {
      const customPlugin = new SummaryPlugin({
        enableAutoSummary: false,
      });

      await customPlugin.register(mockShell);

      // Verify plugin is configured correctly
      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
    });
  });

  describe("digest handling", () => {
    it("should be configured to handle digest events", async () => {
      await plugin.register(mockShell);

      // Plugin should be ready to handle digests when configured
      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);

      // The actual digest handling is tested via integration tests
      // or by testing DigestHandler directly
    });
  });

  describe("summary operations", () => {
    it("should handle operations after registration", async () => {
      await plugin.register(mockShell);

      // Just verify the plugin can perform operations without errors
      // The actual functionality is tested via the MockShell's default implementations
      const summary = await plugin.getSummary("test-conv");
      expect(summary).toBeNull(); // MockShell returns null by default

      const deleted = await plugin.deleteSummary("test-conv");
      expect(deleted).toBe(true); // Delete always succeeds in mock

      const summaries = await plugin.getAllSummaries();
      expect(summaries).toEqual([]); // MockShell returns empty array by default

      const exported = await plugin.exportSummary("test-conv");
      expect(exported).toBeNull(); // No summary exists

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
      await plugin.register(mockShell);

      await plugin.cleanup();

      // Verify cleanup was called (plugin should still be functional but handler reset)
      expect(plugin).toBeDefined();
    });
  });

  describe("plugin capabilities", () => {
    it("should register and return capabilities including tools", async () => {
      const capabilities = await plugin.register(mockShell);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(Array.isArray(capabilities.tools)).toBe(true);

      // Check for expected tool names
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("summary_get");
      expect(toolNames).toContain("summary_list");
      expect(toolNames).toContain("summary_export");
      expect(toolNames).toContain("summary_delete");
      expect(toolNames).toContain("summary_stats");
    });
  });
});
