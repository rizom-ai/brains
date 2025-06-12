import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { webserverPlugin } from "../../src/index";
import { PluginTestHarness, type TestEntity } from "@brains/utils";
import { join } from "path";
import { rmSync, existsSync, mkdirSync } from "fs";

describe("WebserverPlugin with PluginTestHarness", () => {
  let harness: PluginTestHarness;
  let testBrainDir: string;
  let testOutputDir: string;

  beforeEach(async () => {
    // Setup test directories
    testBrainDir = join(import.meta.dir, "test-brain-simple");
    testOutputDir = join(testBrainDir, "webserver");

    // Clean up if exists
    if (existsSync(testBrainDir)) {
      rmSync(testBrainDir, { recursive: true });
    }
    mkdirSync(testBrainDir, { recursive: true });

    harness = new PluginTestHarness();

    // Add test entities
    await harness.createTestEntity<TestEntity>("note", {
      title: "Test Note",
      content: "This is a test note",
      tags: ["test"],
    });
  });

  afterEach(async () => {
    // Cleanup
    await harness.cleanup();

    if (existsSync(testBrainDir)) {
      rmSync(testBrainDir, { recursive: true });
    }
  });

  describe("Basic Plugin Tests", () => {
    it("should register plugin successfully", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
      });

      // Install plugin in harness
      await harness.installPlugin(plugin);

      // Check plugin is installed
      const installedPlugins = harness.getInstalledPlugins();
      expect(installedPlugins).toContain(plugin);

      // Check tools are registered via capabilities
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("build_site");
      expect(toolNames).toContain("start_preview_server");
      expect(toolNames).toContain("start_production_server");
      expect(toolNames).toContain("stop_server");
      expect(toolNames).toContain("get_site_status");
    });

    it("should handle get_site_status tool", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
      });

      await harness.installPlugin(plugin);
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const statusTool = capabilities.tools.find(
        (t) => t.name === "get_site_status",
      );
      expect(statusTool).toBeDefined();

      if (!statusTool) throw new Error("Status tool not found");

      const result = await statusTool.handler({});
      const typedResult = result as {
        hasBuild: boolean;
        lastBuild?: string;
        servers: {
          preview: { running: boolean; url?: string };
          production: { running: boolean; url?: string };
        };
      };

      expect(typedResult.hasBuild).toBe(false);
      expect(typedResult.servers.preview.running).toBe(false);
      expect(typedResult.servers.production.running).toBe(false);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle stopping non-running server", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
      });

      await harness.installPlugin(plugin);
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const stopTool = capabilities.tools.find((t) => t.name === "stop_server");
      expect(stopTool).toBeDefined();

      if (!stopTool) throw new Error("Stop tool not found");

      // Try to stop a server that's not running
      const result = await stopTool.handler({ type: "preview" });
      const typedResult = result as { success: boolean; message?: string };

      // Should succeed even if server wasn't running
      expect(typedResult.success).toBe(true);
      expect(typedResult.message).toBe("preview server stopped");
    });
  });
});
