import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { webserverPlugin } from "../../src/index";
import type { Registry, EntityService, BaseEntity, Plugin, PluginContext, PluginCapabilities } from "@brains/types";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { WebserverManager } from "../../src/webserver-manager";

// Create a silent logger for tests
const silentLogger = createSilentLogger();

// Type definitions for tool handlers
type BuildResult = { success: boolean; message?: string; lastBuild?: string; error?: string };
type ServerResult = { success: boolean; url?: string; message?: string; error?: string };
type StatusResult = { 
  hasBuild: boolean; 
  lastBuild?: string; 
  servers: { 
    preview: { running: boolean; url?: string }; 
    production: { running: boolean; url?: string } 
  } 
};

describe("WebserverPlugin Integration", () => {
  let plugin: Plugin;
  let pluginCapabilities: PluginCapabilities;
  let mockRegistry: Registry;
  let mockEntityService: EntityService;
  let testBrainDir: string;
  let testOutputDir: string;
  let webserverManager: WebserverManager;
  let originalSpawn: typeof Bun.spawn;
  let astroSiteDir: string;

  beforeEach(() => {
    // Save original Bun.spawn
    originalSpawn = Bun.spawn;
    
    // Create test directories
    testBrainDir = join(import.meta.dir, "test-brain");
    testOutputDir = join(testBrainDir, "webserver");
    astroSiteDir = join(import.meta.dir, "../../src/astro-site");
    
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
      JSON.stringify(packageJson, null, 2)
    );
    
    // Mock Bun.spawn to simulate successful builds
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = ((..._args: Parameters<typeof Bun.spawn>): ReturnType<typeof Bun.spawn> => {
      // Mock successful execution
      return {
        exited: Promise.resolve(0),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as unknown as typeof Bun.spawn;

    // Mock EntityService with test data
    mockEntityService = {
      listEntities: async <T extends BaseEntity>(entityType: string) => {
        if (entityType === "note") {
          return [
            {
              id: "note1",
              entityType: "note",
              title: "Integration Test Note",
              content: "This is a test note for integration testing",
              tags: ["test", "integration"],
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            },
          ] as T[];
        }
        return [];
      },
    } as EntityService;

    // Mock Registry
    const registeredServices: Record<string, unknown> = {};
    mockRegistry = {
      resolve: (serviceName: string) => {
        if (serviceName === "entityService") {
          return mockEntityService;
        }
        if (registeredServices[serviceName]) {
          return registeredServices[serviceName];
        }
        throw new Error(`Unknown service: ${serviceName}`);
      },
      register: (name: string, factory: () => unknown) => {
        registeredServices[name] = factory();
      },
    } as unknown as Registry;
  });

  afterEach(async () => {
    // Restore original Bun.spawn
    (Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    
    // Cleanup webserver manager
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (webserverManager) {
      await webserverManager.cleanup();
    }

    // Cleanup test directories
    if (existsSync(testBrainDir)) {
      rmSync(testBrainDir, { recursive: true });
    }
    
    // Cleanup mock astro-site
    if (existsSync(astroSiteDir)) {
      rmSync(astroSiteDir, { recursive: true });
    }
  });

  describe("Plugin Lifecycle", () => {
    it("should initialize and return plugin info", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14321, // Use different ports to avoid conflicts
        productionPort: 18080,
      });

      expect(plugin.id).toBe("webserver-plugin");
      expect(plugin.name).toBe("Webserver Plugin");
      expect(plugin.version).toBeDefined();
    });

    it("should provide tools after registration", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14322,
        productionPort: 18081,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      
      // Get webserver manager from registry
      webserverManager = mockRegistry.resolve("webserverManager");

      expect(pluginCapabilities.tools).toHaveLength(6);
      
      const toolNames = pluginCapabilities.tools.map(t => t.name);
      expect(toolNames).toContain("build_site");
      expect(toolNames).toContain("start_preview_server");
      expect(toolNames).toContain("start_production_server");
      expect(toolNames).toContain("stop_server");
      expect(toolNames).toContain("preview_site");
      expect(toolNames).toContain("get_site_status");
    });
  });

  describe("Site Building", () => {
    it("should build site through tool", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14323,
        productionPort: 18082,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const buildTool = pluginCapabilities.tools.find(t => t.name === "build_site");
      expect(buildTool).toBeDefined();

      // Execute build tool
      if (!buildTool) throw new Error("Build tool not found");
      const result = await buildTool.handler({ clean: true }) as BuildResult;
      
      // Log the error if build fails
      if (!result.success) {
        console.error("Build failed:", result.error);
      }
      
      expect(result.success).toBe(true);
      expect(result.message).toBe("Site built successfully");
      expect(result.lastBuild).toBeDefined();
    });

    it("should handle build errors gracefully", async () => {
      // Mock EntityService to throw error
      mockEntityService.listEntities = async <T extends BaseEntity>(): Promise<T[]> => {
        throw new Error("Database connection failed");
      };

      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14324,
        productionPort: 18083,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const buildTool = pluginCapabilities.tools.find(t => t.name === "build_site");
      if (!buildTool) throw new Error("Build tool not found");

      const result = await buildTool.handler({}) as BuildResult;
      expect(result.success).toBe(false);
      expect(result.error).toContain("Database connection failed");
    });
  });

  describe("Server Management", () => {
    it("should start and stop preview server", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14325,
        productionPort: 18084,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const buildTool = pluginCapabilities.tools.find(t => t.name === "build_site");
      const startPreviewTool = pluginCapabilities.tools.find(t => t.name === "start_preview_server");
      const stopServerTool = pluginCapabilities.tools.find(t => t.name === "stop_server");
      const statusTool = pluginCapabilities.tools.find(t => t.name === "get_site_status");

      if (!buildTool || !startPreviewTool || !stopServerTool || !statusTool) {
        throw new Error("Required tools not found");
      }

      // Build first
      await buildTool.handler({});

      // Start preview server
      const startResult = await startPreviewTool.handler({}) as ServerResult;
      expect(startResult.success).toBe(true);
      expect(startResult.url).toBe("http://localhost:14325");

      // Check status
      const statusResult = await statusTool.handler({}) as StatusResult;
      expect(statusResult.servers.preview.running).toBe(true);
      expect(statusResult.servers.preview.url).toBe("http://localhost:14325");

      // Stop server
      const stopResult = await stopServerTool.handler({ type: "preview" }) as ServerResult;
      expect(stopResult.success).toBe(true);

      // Check status again
      const finalStatus = await statusTool.handler({}) as StatusResult;
      expect(finalStatus.servers.preview.running).toBe(false);
    });

    it("should run preview_site tool (build + preview)", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14326,
        productionPort: 18085,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const previewTool = pluginCapabilities.tools.find(t => t.name === "preview_site");
      if (!previewTool) throw new Error("Preview tool not found");

      const result = await previewTool.handler({}) as ServerResult;
      expect(result.success).toBe(true);
      expect(result.url).toBe("http://localhost:14326");
      expect(result.message).toContain("Site built and preview server started");
    });
  });

  describe("Content Generation", () => {
    it("should generate content based on brain entities", async () => {
      // Add more test notes
      mockEntityService.listEntities = async <T extends BaseEntity>(entityType: string): Promise<T[]> => {
        if (entityType === "note") {
          return [
            {
              id: "note1",
              entityType: "note",
              title: "First Note",
              content: "Content of first note",
              tags: ["tag1", "tag2"],
              created: "2024-01-01T00:00:00Z",
              updated: "2024-01-01T00:00:00Z",
            },
            {
              id: "note2",
              entityType: "note",
              title: "Second Note",
              content: "Content of second note",
              tags: ["tag2", "tag3"],
              created: "2024-01-02T00:00:00Z",
              updated: "2024-01-02T00:00:00Z",
            },
            {
              id: "note3",
              entityType: "note",
              title: "Third Note",
              content: "Content of third note",
              tags: ["tag3", "tag4"],
              created: "2024-01-03T00:00:00Z",
              updated: "2024-01-03T00:00:00Z",
            },
          ] as T[];
        }
        return [];
      };

      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Integration Test Brain",
        siteDescription: "Testing content generation",
        siteUrl: "https://test.example.com",
        previewPort: 14327,
        productionPort: 18086,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const buildTool = pluginCapabilities.tools.find(t => t.name === "build_site");
      const statusTool = pluginCapabilities.tools.find(t => t.name === "get_site_status");

      if (!buildTool || !statusTool) {
        throw new Error("Required tools not found");
      }

      // Build site
      const buildResult = await buildTool.handler({}) as BuildResult;
      expect(buildResult.success).toBe(true);

      // Check status
      const status = await statusTool.handler({}) as StatusResult;
      expect(status.hasBuild).toBe(true);
      expect(status.lastBuild).toBeDefined();
    });
  });

  describe("Multiple Server Management", () => {
    it("should handle both preview and production servers", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14328,
        productionPort: 18087,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const buildTool = pluginCapabilities.tools.find(t => t.name === "build_site");
      const startPreviewTool = pluginCapabilities.tools.find(t => t.name === "start_preview_server");
      const startProductionTool = pluginCapabilities.tools.find(t => t.name === "start_production_server");
      const statusTool = pluginCapabilities.tools.find(t => t.name === "get_site_status");

      if (!buildTool || !startPreviewTool || !startProductionTool || !statusTool) {
        throw new Error("Required tools not found");
      }

      // Build first
      await buildTool.handler({});

      // Start both servers
      const previewResult = await startPreviewTool.handler({}) as ServerResult;
      expect(previewResult.success).toBe(true);

      const productionResult = await startProductionTool.handler({}) as ServerResult;
      expect(productionResult.success).toBe(true);

      // Check status
      const status = await statusTool.handler({}) as StatusResult;
      expect(status.servers.preview.running).toBe(true);
      expect(status.servers.production.running).toBe(true);
      expect(status.servers.preview.url).toBe("http://localhost:14328");
      expect(status.servers.production.url).toBe("http://localhost:18087");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing build when starting server", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14329,
        productionPort: 18088,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");
      
      // Remove the dist directory to simulate no build
      const distDir = join(astroSiteDir, "dist");
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true });
      }

      const startPreviewTool = pluginCapabilities.tools.find(t => t.name === "start_preview_server");
      if (!startPreviewTool) throw new Error("Start preview tool not found");

      // Try to start server without build
      const result = await startPreviewTool.handler({}) as ServerResult;
      expect(result.success).toBe(false);
      expect(result.error).toContain("No build found");
    });

    it("should handle invalid server type for stop command", async () => {
      plugin = webserverPlugin({
        outputDir: testOutputDir,
        siteTitle: "Test Brain",
        siteDescription: "Test Description",
        previewPort: 14330,
        productionPort: 18089,
      });

      const context = {
        registry: mockRegistry,
        logger: silentLogger.child("test"),
      } as unknown as PluginContext;

      pluginCapabilities = await plugin.register(context);
      webserverManager = mockRegistry.resolve("webserverManager");

      const stopServerTool = pluginCapabilities.tools.find(t => t.name === "stop_server");
      if (!stopServerTool) throw new Error("Stop server tool not found");

      // This should be caught by Zod validation
      try {
        await stopServerTool.handler({ type: "invalid" });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        // Expected to throw validation error
        expect(error).toBeDefined();
      }
    });
  });
});