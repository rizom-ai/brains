import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { z } from "@brains/utils";
import type { ToolResponse } from "@brains/mcp-service";

import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync } from "fs";

// Schema for parsing sync tool response data
const syncResponseData = z.object({ jobId: z.string() });

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType = "base";
  public readonly schema = baseEntitySchema;

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return {
      content: markdown,
    };
  }

  toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    return {};
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Simple mock implementation
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}

describe("DirectorySyncPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let plugin: DirectorySyncPlugin;
  let capabilities: PluginCapabilities;
  let syncPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    syncPath = join(tmpdir(), `test-directory-sync-${Date.now()}`);

    // Create test harness with dataDir pointing to test directory
    harness = createPluginHarness<DirectorySyncPlugin>({
      dataDir: syncPath,
    });

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
      autoSync: false,
      initialSync: false,
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
      expect(capabilities.tools.length).toBeGreaterThan(0);
    });

    it("should provide expected tools", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("directory-sync_sync");
      expect(toolNames.length).toBe(1);
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
    });

    it("should handle sync operation", async () => {
      // Sync using the tool
      const syncTool = capabilities.tools.find(
        (t) => t.name === "directory-sync_sync",
      );
      expect(syncTool).toBeDefined();
      if (!syncTool) throw new Error("Sync tool not found");

      const syncResult: ToolResponse = await syncTool.handler(
        {},
        {
          interfaceType: "test",
          userId: "test-user",
        },
      );

      // Should either complete immediately if no operations needed
      // or queue a batch job (both return success: true with the new format)
      expect(syncResult).toBeDefined();
      expect(syncResult.success).toBe(true);
      if (syncResult.success) {
        const parsed = syncResponseData.safeParse(syncResult.data);
        if (parsed.success) {
          expect(parsed.data.jobId).toBeDefined();
        }
      }
    });
  });

  describe("Message Handling", () => {
    it("should respond to sync status requests", async () => {
      const response = await harness.sendMessage<
        Record<string, never>,
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
