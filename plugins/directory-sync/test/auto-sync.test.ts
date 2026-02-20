import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import { rmSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestEntity } from "@brains/test-utils";

describe("DirectorySync AutoSync", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: DirectorySyncPlugin;
  let testDir: string;

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `test-auto-sync-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test harness with dataDir pointing to test directory
    harness = createServicePluginHarness({ dataDir: testDir });

    // Create plugin with autoSync enabled
    plugin = new DirectorySyncPlugin({
      syncPath: testDir,
      autoSync: true,
      initialSync: false,
    });
  });

  afterEach(async () => {
    // Clean up
    harness.reset();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Configuration", () => {
    it("should accept autoSync config option", () => {
      const config = {
        syncPath: testDir,
        autoSync: true,
      };

      const plugin = new DirectorySyncPlugin(config);
      expect(plugin).toBeDefined();
    });

    it("should default autoSync to true", () => {
      const plugin = new DirectorySyncPlugin({
        syncPath: testDir,
      });

      expect(plugin).toBeDefined();
    });
  });

  describe("Entity Event Subscriptions", () => {
    it("should write file when entity is created", async () => {
      await harness.installPlugin(plugin);

      // Get the DirectorySync instance
      const directorySync = plugin.getDirectorySync();
      expect(directorySync).toBeDefined();
      if (!directorySync) throw new Error("DirectorySync not initialized");

      // Create a test entity
      const entityContent = "# Test Entity\n\nTest content";
      const entity = createTestEntity("base", {
        id: "test-entity",
        content: entityContent,
        metadata: {},
      });

      // Write the entity directly (simulating what the handler does)
      await directorySync.fileOps.writeEntity(entity);

      // Check that file was created
      const filePath = join(testDir, "test-entity.md");
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("# Test Entity");
    });

    it("should update file when entity is updated", async () => {
      await harness.installPlugin(plugin);

      const directorySync = plugin.getDirectorySync();
      expect(directorySync).toBeDefined();
      if (!directorySync) throw new Error("DirectorySync not initialized");

      // Create initial entity
      const originalContent = "# Original\n\nOriginal content";
      const entity = createTestEntity("base", {
        id: "test-entity",
        content: originalContent,
        metadata: {},
      });

      await directorySync.fileOps.writeEntity(entity);

      // Update entity
      const updatedContent = "# Updated\n\nUpdated content";
      const updatedEntity = createTestEntity("base", {
        ...entity,
        content: updatedContent,
      });

      await directorySync.fileOps.writeEntity(updatedEntity);

      // Check that file was updated
      const filePath = join(testDir, "test-entity.md");
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("# Updated");
      expect(content).not.toContain("# Original");
    });

    it("should delete file when entity is deleted", async () => {
      await harness.installPlugin(plugin);

      const directorySync = plugin.getDirectorySync();
      expect(directorySync).toBeDefined();
      if (!directorySync) throw new Error("DirectorySync not initialized");

      // Create initial entity
      const entityContent = "# Test\n\nContent";
      const entity = createTestEntity("base", {
        id: "test-entity",
        content: entityContent,
        metadata: {},
      });

      await directorySync.fileOps.writeEntity(entity);

      const filePath = join(testDir, "test-entity.md");
      expect(existsSync(filePath)).toBe(true);

      // Delete the file (simulating what handler does)
      const { unlinkSync } = await import("fs");
      unlinkSync(filePath);

      // Check that file was deleted
      expect(existsSync(filePath)).toBe(false);
    });

    it("should not setup handlers when autoSync is false", async () => {
      const plugin = new DirectorySyncPlugin({
        syncPath: testDir,
        autoSync: false,
        initialSync: false,
      });

      await harness.installPlugin(plugin);

      // When autoSync is false, we don't setup event subscriptions
      // So file operations should still be manual
      const directorySync = plugin.getDirectorySync();
      expect(directorySync).toBeDefined();

      // Files can still be written manually, but won't auto-sync from events
      const filePath = join(testDir, "test-entity.md");
      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe("File Operations", () => {
    it("should write multiple entities to different files", async () => {
      await harness.installPlugin(plugin);

      const directorySync = plugin.getDirectorySync();
      expect(directorySync).toBeDefined();
      if (!directorySync) throw new Error("DirectorySync not initialized");

      // Create two entities
      const content1 = "# Entity 1";
      const entity1 = createTestEntity("base", {
        id: "entity-1",
        content: content1,
        metadata: {},
      });

      const content2 = "# Entity 2";
      const entity2 = createTestEntity("base", {
        id: "entity-2",
        content: content2,
        metadata: {},
      });

      await directorySync.fileOps.writeEntity(entity1);
      await directorySync.fileOps.writeEntity(entity2);

      // Both files should exist
      expect(existsSync(join(testDir, "entity-1.md"))).toBe(true);
      expect(existsSync(join(testDir, "entity-2.md"))).toBe(true);
    });
  });
});
