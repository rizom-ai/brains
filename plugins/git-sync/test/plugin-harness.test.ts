import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { createSyncTool, createStatusTool } from "../src/tools";
import { createCorePluginHarness } from "@brains/plugins/test";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, existsSync, mkdirSync } from "fs";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { GitSync } from "../src/lib/git-sync";

describe("GitSyncPlugin with CorePluginTestHarness", () => {
  let harness: ReturnType<typeof createCorePluginHarness<GitSyncPlugin>>;
  let testRepoPath: string;
  let plugin: GitSyncPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Create temporary test directory
    testRepoPath = join(tmpdir(), `test-git-sync-${Date.now()}`);
    mkdirSync(testRepoPath, { recursive: true });

    // Set test environment variable to use our test path
    process.env["GIT_SYNC_TEST_PATH"] = testRepoPath;

    // Create test harness
    harness = createCorePluginHarness<GitSyncPlugin>();

    // Set up message subscriptions for mocking dependencies
    harness.subscribe("sync:status:request", async () => {
      return {
        success: true,
        data: {
          syncPath: testRepoPath,
          isInitialized: true,
          watchEnabled: false,
        },
      };
    });

    harness.subscribe("entity:export:request", async () => {
      return {
        success: true,
        data: {
          entityIds: [],
          errors: [],
        },
      };
    });

    // Create plugin with direct config
    plugin = new GitSyncPlugin({
      enabled: true,
      debug: false,
      gitUrl: "https://github.com/test/repo.git",
      branch: "main",
      autoSync: false,
      syncInterval: 30,
    });

    // Install plugin
    capabilities = await harness.installPlugin(plugin);
  });

  afterEach(() => {
    // Reset harness
    harness.reset();

    // Clean up test directory
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }

    // Clean up environment variable
    delete process.env["GIT_SYNC_TEST_PATH"];
  });

  describe("Basic Plugin Tests", () => {
    it("should register plugin and provide tools", () => {
      // Verify capabilities
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBe(2);

      // Verify tool names
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("git-sync_sync");
      expect(toolNames).toContain("git-sync_status");
    });

    it("should provide tool metadata", () => {
      // Test tool creators directly (like topics plugin)
      const mockGitSync = {} as GitSync;
      const pluginId = "git-sync";

      const syncTool = createSyncTool(mockGitSync, pluginId);
      expect(syncTool.name).toBe("git-sync_sync");
      expect(syncTool.description).toContain("Sync brain data with git");
      expect(syncTool.visibility).toBe("anchor");

      const statusTool = createStatusTool(mockGitSync, pluginId);
      expect(statusTool.name).toBe("git-sync_status");
      expect(statusTool.description).toContain("git repository status");
      expect(statusTool.visibility).toBe("public");
    });
  });

  describe("Template Registration", () => {
    it("should register status template", () => {
      // Get the shell's registered templates
      const mockShell = harness.getShell();
      const templates = mockShell.getTemplates();

      // Templates are registered with plugin scope, so look for "git-sync:status"
      expect(templates.has("git-sync:status")).toBe(true);

      const statusTemplate = templates.get("git-sync:status");
      expect(statusTemplate).toBeDefined();
      expect(statusTemplate?.name).toBe("status");
      expect(statusTemplate?.description).toBe("Git synchronization status");
    });
  });

  describe("Plugin Configuration", () => {
    it("should configure plugin with correct settings", () => {
      // Verify plugin was configured correctly
      expect(plugin.id).toBe("git-sync");
      expect(plugin.type).toBe("core");
      expect(plugin.version).toBeDefined();
    });
  });
});
