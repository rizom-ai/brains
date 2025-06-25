import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { gitSync } from "../src/plugin";
import {
  PluginTestHarness,
  TestDataGenerator,
  FileTestUtils,
  createToolTester,
} from "@brains/utils";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, existsSync } from "fs";
import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
} from "@brains/types";

// Mock simple-git
const mockGit = {
  clone: mock(() => Promise.resolve()),
  init: mock(() => Promise.resolve()),
  remote: mock(() =>
    Promise.resolve([
      {
        name: "origin",
        refs: {
          fetch: "https://github.com/test/repo.git",
          push: "https://github.com/test/repo.git",
        },
      },
    ]),
  ),
  addRemote: mock(() => Promise.resolve()),
  getRemotes: mock(() =>
    Promise.resolve([
      {
        name: "origin",
        refs: {
          fetch: "https://github.com/test/repo.git",
          push: "https://github.com/test/repo.git",
        },
      },
    ]),
  ),
  status: mock(() =>
    Promise.resolve({
      current: "main",
      tracking: "origin/main",
      ahead: 0,
      behind: 0,
      files: [],
      modified: [],
      not_added: [],
      conflicted: [],
      created: [],
      deleted: [],
      renamed: [],
      staged: [],
      isClean: () => true,
    }),
  ),
  branch: mock(() =>
    Promise.resolve({
      current: "main",
      branches: {
        main: {
          current: true,
          name: "main",
          tracking: "origin/main",
          label: "",
        },
      },
    }),
  ),
  add: mock(() => Promise.resolve()),
  addConfig: mock(() => Promise.resolve()),
  commit: mock(() => Promise.resolve()),
  push: mock(() => Promise.resolve()),
  pull: mock(() => Promise.resolve()),
  checkIsRepo: mock(() => Promise.resolve(true)),
  checkout: mock(() => Promise.resolve()),
  checkoutLocalBranch: mock(() => Promise.resolve()),
  log: mock(() =>
    Promise.resolve({ latest: { hash: "abc123", message: "Initial commit" } }),
  ),
};

mock.module("simple-git", () => ({
  default: () => mockGit,
  simpleGit: () => mockGit,
}));

// Mock directory-sync plugin
const createMockDirectorySync = (syncPath: string): Plugin => ({
  id: "directory-sync",
  version: "1.0.0",
  name: "Directory Sync",
  description: "Mock directory sync for testing",
  register: async (context: PluginContext): Promise<PluginCapabilities> => {
    return {
      tools: [
        {
          name: "directory-sync:status",
          description: "Get directory sync status",
          inputSchema: {},
          handler: async () => ({
            syncPath,
            isInitialized: true,
            watchEnabled: false,
          }),
        },
        {
          name: "directory-sync:sync",
          description: "Sync entities",
          inputSchema: {},
          handler: async () => ({
            exported: 0,
            imported: 0,
            errors: [],
          }),
        },
        {
          name: "directory-sync:import",
          description: "Import entities",
          inputSchema: {},
          handler: async () => ({
            imported: 0,
            skipped: 0,
            failed: 0,
          }),
        },
      ],
      resources: [],
    };
  },
});

describe("GitSyncPlugin with PluginTestHarness", () => {
  let harness: PluginTestHarness;
  let testRepoPath: string;
  let tools: Map<string, PluginTool> = new Map();

  beforeEach(async () => {
    // Create temporary test directory
    testRepoPath = join(tmpdir(), `test-git-sync-simple-${Date.now()}`);
    FileTestUtils.createDirs("", [testRepoPath]);

    // Set test environment variable
    process.env.GIT_SYNC_TEST_PATH = testRepoPath;

    // Create test harness
    harness = new PluginTestHarness();

    // Override the message bus to include send method
    const originalGetContext = harness.getPluginContext.bind(harness);
    harness.getPluginContext = () => {
      const context = originalGetContext();
      return {
        ...context,
        messageBus: {
          ...context.messageBus,
          send: async (type: string) => {
            if (type === "sync:status:request") {
              return {
                success: true,
                data: {
                  syncPath: testRepoPath,
                  isInitialized: true,
                  watchEnabled: false,
                },
              };
            }
            if (type === "entity:export:request") {
              return {
                success: true,
                data: {
                  exported: 0,
                  failed: 0,
                  errors: [],
                },
              };
            }
            if (type === "entity:import:request") {
              return {
                success: true,
                data: {
                  imported: 0,
                  skipped: 0,
                  failed: 0,
                  errors: [],
                },
              };
            }
            return { success: false, error: "Unknown message type" };
          },
        },
      };
    };

    // Install mock directory-sync plugin first
    const mockDirSync = createMockDirectorySync(testRepoPath);
    await harness.installPlugin(mockDirSync);

    // Add test entities
    const notes = TestDataGenerator.notes(2);
    for (const note of notes) {
      await harness.createTestEntity("note", note);
    }
  });

  afterEach(async () => {
    // Cleanup
    await harness.cleanup();

    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }

    // Clean up environment variable
    delete process.env.GIT_SYNC_TEST_PATH;
  });

  describe("Basic Plugin Tests", () => {
    it("should register plugin and provide tools", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      });

      // Get plugin capabilities
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Store tools for later use
      for (const tool of capabilities.tools) {
        tools.set(tool.name, tool);
      }

      // Verify tools
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("git-sync:sync");
      expect(toolNames).toContain("git-sync:commit");
      expect(toolNames).toContain("git-sync:push");
      expect(toolNames).toContain("git-sync:pull");
      expect(toolNames).toContain("git-sync:status");
      expect(toolNames).toContain("git-sync:auto-sync");
    });

    it("should get initial git status", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Find the status tool
      const statusTool = capabilities.tools.find(
        (t) => t.name === "git-sync:status",
      );
      expect(statusTool).toBeDefined();

      if (statusTool) {
        const result = await statusTool.handler({});
        expect(result).toBeDefined();
        expect(result).toHaveProperty("isRepo");
        expect(result).toHaveProperty("hasChanges");
        expect(result).toHaveProperty("branch");
      }
    });
  });

  describe("With Test Data", () => {
    it("should handle auto-sync configuration", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const autoSyncTool = capabilities.tools.find(
        (t) => t.name === "git-sync:auto-sync",
      );
      expect(autoSyncTool).toBeDefined();

      if (autoSyncTool) {
        // Test enabling auto-sync
        const enableResult = await autoSyncTool.handler({ autoSync: true });
        expect(enableResult).toHaveProperty("message");
        expect((enableResult as any).message).toContain("started");

        // Test disabling auto-sync
        const disableResult = await autoSyncTool.handler({ autoSync: false });
        expect(disableResult).toHaveProperty("message");
        expect((disableResult as any).message).toContain("stopped");
      }
    });

    it("should handle git operations", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Test sync
      const syncTool = capabilities.tools.find(
        (t) => t.name === "git-sync:sync",
      );
      if (syncTool) {
        const result = await syncTool.handler({});
        expect(result).toHaveProperty("message");
      }

      // Test commit
      const commitTool = capabilities.tools.find(
        (t) => t.name === "git-sync:commit",
      );
      if (commitTool) {
        const result = await commitTool.handler({
          commitMessage: "Test commit",
        });
        expect(result).toHaveProperty("message");
      }
    });

    it("should validate tool inputs", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      const autoSyncTool = capabilities.tools.find(
        (t) => t.name === "git-sync:auto-sync",
      );
      if (autoSyncTool) {
        const tester = createToolTester(autoSyncTool);

        // Test with valid input
        const result = await tester.execute({ autoSync: true });
        expect(result).toHaveProperty("message");

        // Tool should still work with invalid input due to runtime validation
        // The handler does its own type checking
        const result2 = await tester.execute({ autoSync: "not-a-boolean" });
        expect(result2).toBeDefined();
      }
    });
  });

  describe("Plugin Configuration", () => {
    it("should handle custom git configuration", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "git@github.com:user/repo.git",
        branch: "develop",
        autoSync: true,
        syncInterval: 5,
        commitMessage: "Auto-commit: {timestamp}",
        authorName: "Test Bot",
        authorEmail: "bot@test.com",
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      expect(capabilities.tools.length).toBeGreaterThan(0);

      // Verify the plugin initialized with auto-sync
      const statusTool = capabilities.tools.find(
        (t) => t.name === "git-sync:status",
      );
      if (statusTool) {
        const status = await statusTool.handler({});
        expect(status).toBeDefined();
      }
    });

    it("should use directory-sync plugin dependency", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
        directorySync: "directory-sync", // Explicitly specify the dependency
      });

      // GitSync no longer has hard dependencies with message-based communication
      // expect(plugin.dependencies).toContain("directory-sync");

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      expect(capabilities.tools.length).toBeGreaterThan(0);
    });

    it("should handle authentication token", async () => {
      const plugin = gitSync({
        enabled: true,
        debug: false,
        gitUrl: "https://github.com/test/repo.git",
        branch: "main",
        autoSync: false,
        syncInterval: 30,
        authToken: "github_pat_test_token",
      });

      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Verify the plugin accepts the auth token configuration
      expect(capabilities.tools.length).toBeGreaterThan(0);

      // The actual authentication URL formatting is tested internally
      // We just verify the plugin initializes properly with the token
    });
  });
});
