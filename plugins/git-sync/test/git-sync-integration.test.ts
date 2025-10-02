import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import type { PluginCapabilities } from "@brains/plugins/test";
import { createCorePluginHarness } from "@brains/plugins/test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import simpleGit, { SimpleGit } from "simple-git";

describe("Git-Sync with Directory-Sync Integration", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let gitPlugin: GitSyncPlugin;
  let dirPlugin: DirectorySyncPlugin;
  let gitCapabilities: PluginCapabilities;
  let testDir: string; // Shared directory for both directory-sync and git-sync
  let remoteDir: string;
  let git: SimpleGit;

  beforeEach(async () => {
    // Create test directories
    testDir = join(tmpdir(), `test-sync-${Date.now()}`);
    remoteDir = join(tmpdir(), `test-git-remote-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(remoteDir, { recursive: true });

    // Initialize bare remote repository
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);

    // Set environment variable for git-sync to use same directory as directory-sync
    process.env["GIT_SYNC_TEST_PATH"] = testDir;

    // Create test harness
    harness = createCorePluginHarness();

    // Install directory-sync plugin first
    dirPlugin = new DirectorySyncPlugin({
      syncPath: testDir,
      watchEnabled: false,
      initialSync: false,
      debug: false,
    });
    await harness.installPlugin(dirPlugin);

    // Install git-sync plugin
    gitPlugin = new GitSyncPlugin({
      enabled: true,
      gitUrl: remoteDir,
      branch: "main",
      autoSync: false,
      syncInterval: 30,
      debug: false,
    });
    gitCapabilities = await harness.installPlugin(gitPlugin);

    // Initialize git for testing - point to the shared directory
    git = simpleGit(testDir);
  });

  afterEach(async () => {
    // Clean up
    harness.reset();

    // Clean up test directories
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }

    // Clean up environment variable
    delete process.env["GIT_SYNC_TEST_PATH"];
  });

  describe("Initialization", () => {
    it("should initialize git repository in test directory", async () => {
      const gitDir = join(testDir, ".git");
      expect(existsSync(gitDir)).toBe(true);
    });

    it("should set up remote repository", async () => {
      const remotes = await git.getRemotes(true);
      expect(remotes.length).toBeGreaterThan(0);
      expect(remotes[0].name).toBe("origin");
      expect(remotes[0].refs.push).toContain(remoteDir);
    });
  });

  describe("Entity ID Path Mapping Integration", () => {
    it("should correctly sync entities with colon-based IDs", async () => {
      // Create entity with colon ID in shared directory
      const filePath = join(testDir, "site-content", "landing", "hero.md");
      mkdirSync(join(testDir, "site-content", "landing"), {
        recursive: true,
      });
      writeFileSync(filePath, "# Hero Section\n\nWelcome!");

      // Sync through git-sync plugin tool (handles commit, push, pull)
      const syncTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:sync",
      );
      expect(syncTool).toBeDefined();
      if (!syncTool) throw new Error("Sync tool not found");

      const syncResult = await syncTool.handler({});
      expect(syncResult).toBeDefined();

      // Verify file was committed with correct path
      const log = await git.log();
      expect(log.latest).toBeDefined();

      // Verify the file exists in working directory
      expect(existsSync(filePath)).toBe(true);

      // Verify it was added to git
      const status = await git.status();
      expect(status.files.some((f) => f.path.includes("hero.md"))).toBe(false); // Should be committed, not in changes
    });

    it("should handle deeply nested entity structures", async () => {
      // Create deeply nested file
      const filePath = join(
        testDir,
        "topic",
        "tech",
        "web",
        "frontend",
        "react.md",
      );
      mkdirSync(join(testDir, "topic", "tech", "web", "frontend"), {
        recursive: true,
      });
      writeFileSync(filePath, "# React Topic\n\nReact content");

      const syncTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:sync",
      );
      if (!syncTool) throw new Error("Sync tool not found");
      await syncTool.handler({});

      const statusTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler({});

      // Should be clean after sync
      expect(statusResult?.data?.hasChanges).toBe(false);
    });
  });

  describe("Status and Sync Operations", () => {
    it("should report accurate status", async () => {
      const statusTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler({});

      expect(statusResult?.data?.isRepo).toBe(true);
      expect(statusResult?.data?.hasChanges).toBe(false);
      expect(statusResult?.data?.branch).toBe("main");
      expect(statusResult?.data?.ahead).toBe(0);
      expect(statusResult?.data?.behind).toBe(0);
    });

    it("should detect uncommitted changes", async () => {
      writeFileSync(join(testDir, "test.md"), "# Test");

      const statusTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler({});
      expect(statusResult?.data?.hasChanges).toBe(true);
      expect(statusResult?.data?.files.length).toBe(1);
      expect(statusResult?.data?.files[0].path).toBe("test.md");
    });
  });
});
