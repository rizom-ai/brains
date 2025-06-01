import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { webserverPlugin } from "../../src/index";
import {
  PluginTestHarness,
  TestDataGenerator,
} from "@brains/plugin-test-utils";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";

describe("WebserverPlugin with PluginTestHarness", () => {
  let harness: PluginTestHarness;
  let testBrainDir: string;
  let testOutputDir: string;
  let astroSiteDir: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(async () => {
    // Save original Bun.spawn
    originalSpawn = Bun.spawn;

    // Setup test directories
    testBrainDir = join(import.meta.dir, "test-brain-simple");
    testOutputDir = join(testBrainDir, "webserver");
    astroSiteDir = join(import.meta.dir, "../../src/astro-site");

    // Clean up if exists
    if (existsSync(testBrainDir)) {
      rmSync(testBrainDir, { recursive: true });
    }
    mkdirSync(testBrainDir, { recursive: true });

    // Create mock astro-site directory structure
    mkdirSync(join(astroSiteDir, "src/content/landing"), { recursive: true });
    mkdirSync(join(astroSiteDir, "dist"), { recursive: true });

    // Create a mock package.json
    const packageJson = {
      name: "test-astro-site",
      scripts: {
        build: "echo 'mock build'",
        dev: "echo 'mock dev'",
      },
    };
    writeFileSync(
      join(astroSiteDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    // Mock Bun.spawn
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = ((
      ..._args: Parameters<typeof Bun.spawn>
    ): ReturnType<typeof Bun.spawn> => {
      return {
        exited: Promise.resolve(0),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as unknown as typeof Bun.spawn;

    // Create test harness
    harness = new PluginTestHarness();

    // Add test entities
    await harness.createTestEntity("note", {
      title: "Test Note",
      content: "This is a test note",
      tags: ["test"],
    });
  });

  afterEach(async () => {
    // Restore original Bun.spawn
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;

    // Cleanup
    await harness.cleanup();

    if (existsSync(testBrainDir)) {
      rmSync(testBrainDir, { recursive: true });
    }

    if (existsSync(astroSiteDir)) {
      rmSync(astroSiteDir, { recursive: true });
    }
  });

  describe("Basic Plugin Tests", () => {
    it("should register plugin and execute tools", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 16001,
        productionPort: 19001,
      });

      // Install plugin in harness
      await harness.installPlugin(plugin);

      // Check plugin is installed
      const installedPlugins = harness.getInstalledPlugins();
      expect(installedPlugins).toContain(plugin);

      // Get plugin capabilities directly
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Find and execute build tool
      const buildTool = capabilities.tools.find(t => t.name === "build_site");
      expect(buildTool).toBeDefined();

      if (!buildTool) throw new Error("Build tool not found");
      
      const result = await buildTool.handler({ clean: true });
      const typedResult = result as { success: boolean; message: string };
      expect(typedResult.success).toBe(true);
      expect(typedResult.message).toBe("Site built successfully");
    });

    it("should handle server lifecycle", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 16002,
        productionPort: 19002,
      });

      await harness.installPlugin(plugin);

      // Get tools
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const buildTool = capabilities.tools.find(t => t.name === "build_site");
      const previewTool = capabilities.tools.find(t => t.name === "preview_site");
      const statusTool = capabilities.tools.find(t => t.name === "get_site_status");

      // Build and preview
      if (!buildTool || !previewTool || !statusTool) {
        throw new Error("Required tools not found");
      }
      
      await buildTool.handler({});
      const previewResult = await previewTool.handler({});
      const typedPreviewResult = previewResult as { success: boolean; url: string };
      
      expect(typedPreviewResult.success).toBe(true);
      expect(typedPreviewResult.url).toBe("http://localhost:16002");

      // Check status
      const status = await statusTool.handler({});
      const typedStatus = status as { servers: { preview: { running: boolean } }; hasBuild: boolean };
      expect(typedStatus.servers.preview.running).toBe(true);
      expect(typedStatus.hasBuild).toBe(true);
    });

    it("should work with test data", async () => {
      // Add more test data
      const notes = TestDataGenerator.notes(3);
      for (const note of notes) {
        await harness.createTestEntity("note", note);
      }

      const plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Data Test",
        siteDescription: "Testing with generated data",
        previewPort: 16003,
        productionPort: 19003,
      });

      await harness.installPlugin(plugin);

      // Verify entities are available
      const entities = await harness.listEntities("note");
      expect(entities.length).toBe(4); // 1 initial + 3 generated

      // Build should work with these entities
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const buildTool = capabilities.tools.find(t => t.name === "build_site");
      
      if (!buildTool) throw new Error("Build tool not found");
      
      const result = await buildTool.handler({});
      const typedResult = result as { success: boolean };
      expect(typedResult.success).toBe(true);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle missing dist directory", async () => {
      const plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 16004,
        productionPort: 19004,
      });

      await harness.installPlugin(plugin);

      // Remove dist directory
      const distDir = join(astroSiteDir, "dist");
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true });
      }

      // Try to start server without build
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const startTool = capabilities.tools.find(t => t.name === "start_preview_server");

      if (!startTool) throw new Error("Start preview tool not found");
      
      const result = await startTool.handler({});
      const typedResult = result as { success: boolean; error?: string };
      expect(typedResult.success).toBe(false);
      expect(typedResult.error).toContain("No build found");
    });
  });
});