import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins";
import type { PluginCapabilities } from "@brains/plugins";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";
import { baseEntitySchema } from "@brains/entity-service";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, readFileSync } from "fs";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    const lines = markdown.split("\n");
    return {
      content: lines.slice(2).join("\n"),
    };
  }

  toMarkdown(entity: BaseEntity): string {
    const firstLine = entity.content.split("\n")[0] || "Untitled";
    return `# ${firstLine}\n\n${entity.content}`;
  }

  validate(entity: unknown): entity is BaseEntity {
    return true;
  }
}

describe("DirectorySyncPlugin", () => {
  let harness: ReturnType<
    typeof createServicePluginHarness<DirectorySyncPlugin>
  >;
  let plugin: DirectorySyncPlugin;
  let capabilities: PluginCapabilities;
  let syncPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    syncPath = join(tmpdir(), `test-directory-sync-${Date.now()}`);

    // Create test harness
    harness = createServicePluginHarness<DirectorySyncPlugin>();

    // Get the shell and register entity types
    const shell = harness.getShell();
    const entityRegistry = shell.getEntityRegistry();
    entityRegistry.registerEntityType(
      "base",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema,
      new MockEntityAdapter(),
    );

    // Create plugin
    plugin = new DirectorySyncPlugin({
      syncPath,
      watchEnabled: false,
    });

    // Install plugin
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    // Reset harness
    harness.reset();

    // Clean up test directory
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  describe("Plugin Registration", () => {
    it("should register plugin and provide tools", () => {
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools?.length).toBeGreaterThan(0);
    });

    it("should provide expected tools", () => {
      const toolNames = capabilities.tools?.map((t) => t.name) || [];
      expect(toolNames).toContain("directory-sync:sync");
      expect(toolNames).toContain("directory-sync:export");
      expect(toolNames).toContain("directory-sync:import");
      expect(toolNames).toContain("directory-sync:status");
      expect(toolNames).toContain("directory-sync:watch");
      expect(toolNames).toContain("directory-sync:ensure-structure");
    });

    it("should provide commands", () => {
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.commands?.length).toBeGreaterThan(0);

      const commandNames = capabilities.commands?.map((c) => c.name) || [];
      expect(commandNames).toContain("directory-sync");
      expect(commandNames).toContain("sync-status");
    });

    it("should register templates", () => {
      const templates = harness.getTemplates();
      expect(templates.has("directory-sync:status")).toBe(true);
    });
  });

  describe("Tool Functionality", () => {
    it("should initialize directory structure", async () => {
      // The plugin already initializes the directory in onRegister
      // So we expect it to exist
      expect(existsSync(syncPath)).toBe(true);

      // Use the ensure-structure tool (should work even if already exists)
      const ensureTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:ensure-structure",
      );
      expect(ensureTool).toBeDefined();

      const result = await ensureTool!.handler({}, {});
      expect(result).toEqual({ message: "Directory structure created" });
      expect(existsSync(syncPath)).toBe(true);
    });

    it("should get status", async () => {
      // Ensure directory exists
      const ensureTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:ensure-structure",
      );
      await ensureTool!.handler({}, {});

      // Get status
      const statusTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:status",
      );
      expect(statusTool).toBeDefined();

      const status = (await statusTool!.handler({}, {})) as any;
      expect(status.syncPath).toBe(syncPath);
      expect(status.exists).toBe(true);
      expect(status.watching).toBe(false);
    });

    it("should export entities", async () => {
      // Ensure directory exists
      const ensureTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:ensure-structure",
      );
      await ensureTool!.handler({}, {});

      // Create some test entities
      const shell = harness.getShell();
      const entityService = shell.getEntityService();

      await entityService.createEntity({
        id: "test-export-1",
        content: "Test Export 1\nThis is test content",
        entityType: "base",
        title: "Test Export 1",
        created: new Date(),
        updated: new Date(),
      });

      // Export using the tool (which queues a batch job)
      const exportTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:export",
      );
      expect(exportTool).toBeDefined();

      const exportResult = (await exportTool!.handler(
        { entityTypes: ["base"] },
        {},
      )) as any;
      expect(exportResult.status).toBe("queued");
      expect(exportResult.batchId).toBeDefined();

      // In a real test, we'd wait for the batch job to complete
      // For now, we'll just verify the job was queued
      expect(exportResult.entityTypes).toContain("base");
    });

    it("should handle sync operation", async () => {
      // Ensure directory exists
      const ensureTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:ensure-structure",
      );
      await ensureTool!.handler({}, {});

      // Sync using the tool
      const syncTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:sync",
      );
      expect(syncTool).toBeDefined();

      const syncResult = (await syncTool!.handler({}, {})) as any;

      // Should either complete immediately if no operations needed
      // or queue a batch job
      expect(syncResult).toBeDefined();
      if (syncResult.status === "queued") {
        expect(syncResult.batchId).toBeDefined();
      } else {
        expect(syncResult.status).toBe("completed");
      }
    });

    it("should control watching", async () => {
      const watchTool = capabilities.tools?.find(
        (t) => t.name === "directory-sync:watch",
      );
      expect(watchTool).toBeDefined();

      // Start watching
      let result = (await watchTool!.handler({ action: "start" }, {})) as any;
      expect(result.watching).toBe(true);

      // Stop watching
      result = (await watchTool!.handler({ action: "stop" }, {})) as any;
      expect(result.watching).toBe(false);
    });
  });

  describe("Message Handling", () => {
    it("should respond to sync status requests", async () => {
      const response = await harness.sendMessage<
        {},
        { syncPath: string; isInitialized: boolean; watchEnabled: boolean }
      >("sync:status:request", {}, "test");

      expect(response).toBeDefined();
      expect(response?.syncPath).toBe(syncPath);
      expect(response?.isInitialized).toBe(true);
      expect(response?.watchEnabled).toBe(false);
    });

    it("should respond to export requests", async () => {
      const response = await harness.sendMessage<
        { entityTypes?: string[] },
        { exported: number; failed: number }
      >("entity:export:request", { entityTypes: ["base"] }, "test");

      expect(response).toBeDefined();
      expect(response?.exported).toBeDefined();
      expect(response?.failed).toBeDefined();
    });

    it("should respond to configuration requests", async () => {
      const newPath = join(tmpdir(), `test-directory-sync-new-${Date.now()}`);

      const response = await harness.sendMessage<
        { syncPath: string },
        { syncPath: string; configured: boolean }
      >("sync:configure:request", { syncPath: newPath }, "test");

      expect(response).toBeDefined();
      expect(response?.syncPath).toBe(newPath);
      expect(response?.configured).toBe(true);

      // Clean up new path
      if (existsSync(newPath)) {
        rmSync(newPath, { recursive: true, force: true });
      }
    });
  });
});
