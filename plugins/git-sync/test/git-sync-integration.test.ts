import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GitSyncPlugin } from "../src/plugin";
import { DirectorySyncPlugin } from "@brains/directory-sync";
import type { PluginCapabilities } from "@brains/plugins";
import { createCorePluginHarness } from "@brains/plugins";
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

      // Commit through git-sync plugin tool
      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      expect(commitTool).toBeDefined();
      if (!commitTool) throw new Error("Commit tool not found");

      const commitResult = await commitTool.handler({
        commitMessage: "Add landing:hero content",
      });
      expect(commitResult).toBeDefined();

      // Push the commit
      const pushTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:push",
      );
      if (!pushTool) throw new Error("Push tool not found");
      await pushTool.handler({});

      // Verify file was committed with correct path
      const log = await git.log();
      expect(log.latest?.message).toContain("Add landing:hero content");

      // Clone to another directory and verify structure
      const cloneDir = join(tmpdir(), `test-clone-${Date.now()}`);
      const cloneGit = simpleGit();
      await cloneGit.clone(remoteDir, cloneDir, ["--branch", "main"]);

      const clonedFile = join(cloneDir, "site-content", "landing", "hero.md");
      expect(existsSync(clonedFile)).toBe(true);

      // Clean up clone
      rmSync(cloneDir, { recursive: true, force: true });
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

      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({
        commitMessage: "Add nested topic",
      });

      const statusTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler({});

      // Should be clean after commit
      expect(statusResult?.data?.hasChanges).toBe(false);
    });
  });

  describe("Commit Batching", () => {
    it("should batch multiple changes into single commit", async () => {
      // Create multiple files quickly
      mkdirSync(join(testDir, "note"), { recursive: true });

      writeFileSync(join(testDir, "note", "note1.md"), "# Note 1");
      writeFileSync(join(testDir, "note", "note2.md"), "# Note 2");
      writeFileSync(join(testDir, "note", "note3.md"), "# Note 3");

      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({
        commitMessage: "Batch commit: 3 notes",
      });

      const log = await git.log();
      expect(log.latest?.message).toBe("Batch commit: 3 notes");

      // Check that all files were included in one commit
      const diff = await git.diffSummary([
        `${log.latest?.hash}^`,
        log.latest?.hash ?? "",
      ]);
      expect(diff.files.length).toBe(3);
    });

    it("should generate smart commit messages", async () => {
      mkdirSync(join(testDir, "summary"), { recursive: true });

      // Add files with IDs that should be in commit message
      writeFileSync(
        join(testDir, "summary", "daily-2024-01-27.md"),
        "# Daily Summary",
      );
      writeFileSync(
        join(testDir, "summary", "weekly-2024-W04.md"),
        "# Weekly Summary",
      );

      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({});

      const log = await git.log();
      // Default commit should have auto-generated message
      expect(log.latest?.message).toBeDefined();
      expect(log.latest?.message?.length).toBeGreaterThan(0);
    });
  });

  describe("Invalid Entity Quarantine", () => {
    it("should handle quarantined files from directory-sync", async () => {
      // Create an invalid file that would be quarantined
      const invalidPath = join(testDir, "note", "invalid.md.invalid");
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(invalidPath, "Invalid content");

      // Git sync should commit the quarantine
      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({
        commitMessage: "Quarantine invalid entity",
      });

      const statusTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:status",
      );
      if (!statusTool) throw new Error("Status tool not found");
      const statusResult = await statusTool.handler({});
      expect(statusResult?.data?.hasChanges).toBe(false);

      // Verify .invalid file was committed
      const files = await git.raw(["ls-tree", "-r", "HEAD", "--name-only"]);
      expect(files).toContain("note/invalid.md.invalid");
    });

    it("should track recovery of quarantined files", async () => {
      // Create and commit invalid file
      const invalidPath = join(testDir, "note", "broken.md.invalid");
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(invalidPath, "Broken content");

      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({
        commitMessage: "Quarantine broken entity",
      });

      // Fix and rename back
      const fixedPath = join(testDir, "note", "broken.md");
      writeFileSync(fixedPath, "# Fixed\n\nNow valid");
      rmSync(invalidPath);

      await commitTool.handler({
        commitMessage: "Recovered: broken.md",
      });

      const log = await git.log();
      expect(log.latest?.message).toContain("Recovered");
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

    it("should handle auto-sync toggle", async () => {
      // Enable auto-sync
      const autoSyncTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:auto-sync",
      );
      if (!autoSyncTool) throw new Error("Auto-sync tool not found");

      let result = await autoSyncTool.handler({
        autoSync: true,
      });
      expect(result?.message).toContain("Auto-sync started");

      // Disable auto-sync
      result = await autoSyncTool.handler({
        autoSync: false,
      });
      expect(result?.message).toContain("Auto-sync stopped");
    });
  });

  describe("Error Handling", () => {
    it("should handle network failures gracefully", async () => {
      // Temporarily remove remote to simulate network failure
      rmSync(remoteDir, { recursive: true, force: true });

      writeFileSync(join(testDir, "test.md"), "# Test");

      const commitTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:commit",
      );
      if (!commitTool) throw new Error("Commit tool not found");
      await commitTool.handler({
        commitMessage: "Test commit",
      });

      // Push should fail but not crash
      const pushTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:push",
      );
      if (!pushTool) throw new Error("Push tool not found");

      // Expect push to throw due to missing remote
      await expect(pushTool.handler({})).rejects.toThrow();

      // Restore remote
      mkdirSync(remoteDir, { recursive: true });
      await simpleGit(remoteDir).init(true);
    });

    it("should handle invalid git operations", async () => {
      // Try to pull when no remote branch exists
      const pullTool = gitCapabilities.tools?.find(
        (t) => t.name === "git-sync:pull",
      );
      if (!pullTool) throw new Error("Pull tool not found");

      // Expect pull to throw when remote branch doesn't exist
      await expect(pullTool.handler({})).rejects.toThrow(
        "Failed to pull changes from remote repository",
      );
    });
  });
});
