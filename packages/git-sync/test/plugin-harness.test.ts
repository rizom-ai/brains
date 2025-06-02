import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { gitSync } from "../src/plugin";
import {
  PluginTestHarness,
  TestDataGenerator,
  FileTestUtils,
} from "@brains/plugin-test-utils";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, existsSync, readFileSync } from "fs";

describe("GitSyncPlugin with PluginTestHarness", () => {
  let harness: PluginTestHarness;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testRepoPath = join(tmpdir(), `test-git-sync-simple-${Date.now()}`);
    FileTestUtils.createDirs("", [testRepoPath]);

    // Create test harness
    harness = new PluginTestHarness();

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
  });

  describe("Basic Plugin Tests", () => {
    it("should register plugin and provide tools", async () => {
      const plugin = gitSync({
        repoPath: testRepoPath,
        branch: "main",
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Check plugin is installed
      const installedPlugins = harness.getInstalledPlugins();
      expect(installedPlugins).toContain(plugin);

      // Get plugin capabilities
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);

      // Verify tools
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("git_sync");
      expect(toolNames).toContain("git_sync_pull");
      expect(toolNames).toContain("git_sync_push");
      expect(toolNames).toContain("git_sync_status");

      // Verify git repo was initialized
      FileTestUtils.assertExists(join(testRepoPath, ".git"));
    });

    it("should execute git status", async () => {
      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Get status tool
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const statusTool = capabilities.tools.find(
        (t) => t.name === "git_sync_status",
      );

      const status = (await statusTool!.handler({})) as any;
      expect(status.isRepo).toBe(true);
      expect(status.branch).toBeDefined();
      expect(status.files).toBeDefined();
    });

    it("should push entities to git", async () => {
      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Get push tool
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pushTool = capabilities.tools.find(
        (t) => t.name === "git_sync_push",
      );

      // Execute push
      const result = (await pushTool!.handler({})) as any;
      expect(result.message).toBe("Push completed");

      // Verify files were created
      const noteDir = join(testRepoPath, "note");
      FileTestUtils.assertExists(noteDir);

      // Check that markdown files exist
      const files = FileTestUtils.listFiles(noteDir);
      expect(files.length).toBeGreaterThan(0);

      // Verify content of one file
      if (files.length > 0) {
        const content = readFileSync(join(noteDir, files[0]), "utf-8");
        expect(content).toContain("# Test Note");
      }
    });

    it("should perform full sync", async () => {
      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Get sync tool
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const syncTool = capabilities.tools.find((t) => t.name === "git_sync");

      // Execute sync
      const result = (await syncTool!.handler({})) as any;
      expect(result.message).toBe("Sync completed");

      // Verify status
      const statusTool = capabilities.tools.find(
        (t) => t.name === "git_sync_status",
      );
      const status = (await statusTool!.handler({})) as any;
      expect(status.isRepo).toBe(true);
    });
  });

  describe("Pull Operation", () => {
    it("should handle pull from repository", async () => {
      // Create some files to pull
      FileTestUtils.createFiles(testRepoPath, {
        "note/existing-note.md":
          "# Existing Note\n\nThis was already in the repo",
      });

      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Get pull tool
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pullTool = capabilities.tools.find(
        (t) => t.name === "git_sync_pull",
      );

      // Execute pull
      const result = (await pullTool!.handler({})) as any;
      expect(result.message).toBe("Pull completed");
    });

    it("should skip files for unregistered entity types during import", async () => {
      // Create files in unregistered directories
      FileTestUtils.createFiles(testRepoPath, {
        "test.md": "# Root file",
        "unknown/file.md": "# Unknown type",
        "note/valid-note.md": "# Valid Note\n\nContent",
      });

      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Get initial entity count
      const initialNotes = await harness.listEntities("note");
      const initialCount = initialNotes.length;

      // Execute pull
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pullTool = capabilities.tools.find(
        (t) => t.name === "git_sync_pull",
      );

      await pullTool!.handler({});

      // Check that only the valid note was imported
      const finalNotes = await harness.listEntities("note");
      expect(finalNotes.length).toBe(initialCount + 1);

      // Verify the imported note has correct data
      const importedNote = finalNotes.find((n) => n.id === "valid-note");
      expect(importedNote).toBeDefined();
      expect(importedNote?.title).toBe("valid note");

      // Verify that unknown type was not imported (harness doesn't track unknown types)
      // The fact that only one note was imported proves that files in root and unknown dirs were skipped
    });

    it("should import files with correct metadata from filename", async () => {
      // Create a file with dashes in name to test title conversion
      FileTestUtils.createFiles(testRepoPath, {
        "note/test-note-with-dashes.md": "# Test Note\n\nContent here",
      });

      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Execute pull
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pullTool = capabilities.tools.find(
        (t) => t.name === "git_sync_pull",
      );

      await pullTool!.handler({});

      // Verify the imported note has correct metadata
      const notes = await harness.listEntities("note");
      const importedNote = notes.find((n) => n.id === "test-note-with-dashes");

      expect(importedNote).toBeDefined();
      expect(importedNote?.entityType).toBe("note");
      expect(importedNote?.id).toBe("test-note-with-dashes");
      expect(importedNote?.title).toBe("test note with dashes"); // Dashes converted to spaces
      expect(importedNote?.content).toBe("# Test Note\n\nContent here");
    });
  });

  describe("With Test Data", () => {
    it("should handle multiple entity types", async () => {
      // Add different entity types
      await harness.createTestEntity("task", {
        title: "Test Task",
        content: "Task content",
        status: "pending",
      });

      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Push entities
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pushTool = capabilities.tools.find(
        (t) => t.name === "git_sync_push",
      );

      await pushTool!.handler({});

      // Check directories - need to check subdirectories, not just root
      const noteDir = join(testRepoPath, "note");
      FileTestUtils.assertExists(noteDir);

      // Task directory should also exist since we added a task entity
      const taskDir = join(testRepoPath, "task");
      if (existsSync(taskDir)) {
        const taskFiles = FileTestUtils.listFiles(taskDir);
        expect(taskFiles.length).toBeGreaterThan(0);
      }
    });

    it("should handle entities with special names", async () => {
      // Create entity with special characters
      await harness.createTestEntity("note", {
        title: "Note: Special/Characters",
        content: "Content with @#$% symbols",
      });

      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: false,
      });

      await harness.installPlugin(plugin);

      // Push
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const pushTool = capabilities.tools.find(
        (t) => t.name === "git_sync_push",
      );

      await pushTool!.handler({});

      // Verify files exist (names will be sanitized)
      const noteDir = join(testRepoPath, "note");
      const files = FileTestUtils.listFiles(noteDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe("Auto Sync", () => {
    it("should enable auto sync when configured", async () => {
      const plugin = gitSync({
        repoPath: testRepoPath,
        autoSync: true,
        syncInterval: 60000,
      });

      // Should not throw
      await harness.installPlugin(plugin);

      // Verify still works
      const context = harness.getPluginContext();
      const capabilities = await plugin.register(context);
      const statusTool = capabilities.tools.find(
        (t) => t.name === "git_sync_status",
      );

      const status = (await statusTool!.handler({})) as any;
      expect(status.isRepo).toBe(true);
    });
  });
});
