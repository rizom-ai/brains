import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import type { PluginCapabilities } from "@brains/plugins/test";
import {
  createServicePluginHarness,
  createCorePluginHarness,
} from "@brains/plugins/test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";

describe("Git-Sync with Directory-Sync Integration", () => {
  let dirHarness: ReturnType<typeof createServicePluginHarness>;
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

    // Create test harnesses with shared data directory
    dirHarness = createServicePluginHarness({ dataDir: testDir });
    harness = createCorePluginHarness({ dataDir: testDir });

    // Install directory-sync plugin first
    dirPlugin = new DirectorySyncPlugin({
      syncPath: testDir,
      initialSync: false,
    });
    await dirHarness.installPlugin(dirPlugin);

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
    dirHarness.reset();
    harness.reset();

    // Clean up test directories
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(remoteDir)) {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  describe("Initialization", () => {
    it("should initialize git repository in test directory", async () => {
      const gitDir = join(testDir, ".git");
      expect(existsSync(gitDir)).toBe(true);
    });

    it("should set up remote repository", async () => {
      const remotes = await git.getRemotes(true);
      expect(remotes.length).toBeGreaterThan(0);
      const origin = remotes[0];
      if (!origin) throw new Error("No remote found");
      expect(origin.name).toBe("origin");
      expect(origin.refs.push).toContain(remoteDir);
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
      const syncTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_sync",
      );
      expect(syncTool).toBeDefined();
      if (!syncTool) throw new Error("Sync tool not found");

      const syncResult = await syncTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );
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

      const syncTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_sync",
      );
      if (!syncTool) throw new Error("Sync tool not found");
      await syncTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );

      const statusTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );

      // Should be clean after sync
      if (!statusResult.data) throw new Error("No data in status result");
      expect(statusResult.data["hasChanges"]).toBe(false);
    });
  });

  describe("Push on Manual Sync", () => {
    it("should push new files to remote on single sync call", async () => {
      // This test reproduces a bug where new files required two sync calls:
      // 1st sync: file committed but not pushed (manualSync=false meant push conditions weren't met)
      // 2nd sync: file pushed (now ahead > 0 triggers push)
      //
      // Expected behavior: user explicitly calling sync should push in one call

      // Create a new entity file (simulating directory-sync auto-export)
      const filePath = join(testDir, "link", "test-link-abc123.md");
      mkdirSync(join(testDir, "link"), { recursive: true });
      writeFileSync(
        filePath,
        "---\ntitle: Test Link\nurl: https://example.com\n---\n\nTest summary",
      );

      // Call sync tool ONCE (used to require TWICE before fix)
      const syncTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_sync",
      );
      if (!syncTool) throw new Error("Sync tool not found");

      await syncTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );

      // Verify file was committed locally
      const localStatus = await git.status();
      expect(localStatus.isClean()).toBe(true);

      // Clone the remote to verify file was pushed
      const verifyDir = join(tmpdir(), `verify-${Date.now()}`);
      mkdirSync(verifyDir, { recursive: true });
      await simpleGit(verifyDir).clone(remoteDir, ".", ["--branch", "main"]);

      // Verify the file exists in the cloned repo
      expect(existsSync(join(verifyDir, "link", "test-link-abc123.md"))).toBe(
        true,
      );

      // Clean up verify dir
      rmSync(verifyDir, { recursive: true, force: true });
    });
  });

  describe("Status and Sync Operations", () => {
    it("should report accurate status", async () => {
      const statusTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );

      if (!statusResult.data) throw new Error("No data in status result");
      expect(statusResult.data["isRepo"]).toBe(true);
      expect(statusResult.data["hasChanges"]).toBe(false);
      expect(statusResult.data["branch"]).toBe("main");
      expect(statusResult.data["ahead"]).toBe(0);
      expect(statusResult.data["behind"]).toBe(0);
    });

    it("should detect uncommitted changes", async () => {
      writeFileSync(join(testDir, "test.md"), "# Test");

      const statusTool = gitCapabilities.tools.find(
        (t) => t.name === "git-sync_status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler(
        {},
        { interfaceType: "test", userId: "test-user" },
      );
      if (!statusResult.data) throw new Error("No data in status result");
      expect(statusResult.data["hasChanges"]).toBe(true);
      const files = statusResult.data["files"];
      expect(Array.isArray(files) && files.length).toBe(1);
      expect(Array.isArray(files) && files[0].path).toBe("test.md");
    });
  });
});
