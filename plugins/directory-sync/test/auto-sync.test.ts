import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { rmSync, existsSync, readFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestEntity } from "@brains/test-utils";
import type { DirectorySync } from "../src/lib/directory-sync";

describe("DirectorySync AutoSync", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: DirectorySyncPlugin;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-auto-sync-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    harness = createPluginHarness({ dataDir: testDir });

    plugin = new DirectorySyncPlugin({
      syncPath: testDir,
      autoSync: true,
      initialSync: false,
    });
  });

  afterEach(async () => {
    harness.reset();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function getDirectorySyncOrFail(): DirectorySync {
    const dirSync = plugin.getDirectorySync();
    if (!dirSync) throw new Error("DirectorySync not initialized");
    return dirSync;
  }

  describe("Configuration", () => {
    it("should accept autoSync config option", () => {
      const p = new DirectorySyncPlugin({ syncPath: testDir, autoSync: true });
      expect(p).toBeDefined();
    });

    it("should default autoSync to true", () => {
      const p = new DirectorySyncPlugin({ syncPath: testDir });
      expect(p).toBeDefined();
    });
  });

  describe("Entity Event Subscriptions", () => {
    it("should write file when entity is created", async () => {
      await harness.installPlugin(plugin);
      const dirSync = getDirectorySyncOrFail();

      const entity = createTestEntity("base", {
        id: "test-entity",
        content: "# Test Entity\n\nTest content",
        metadata: {},
      });

      await dirSync.fileOps.writeEntity(entity);

      const filePath = join(testDir, "test-entity.md");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toContain("# Test Entity");
    });

    it("should update file when entity is updated", async () => {
      await harness.installPlugin(plugin);
      const dirSync = getDirectorySyncOrFail();

      const entity = createTestEntity("base", {
        id: "test-entity",
        content: "# Original\n\nOriginal content",
        metadata: {},
      });

      await dirSync.fileOps.writeEntity(entity);

      const updatedEntity = createTestEntity("base", {
        ...entity,
        content: "# Updated\n\nUpdated content",
      });

      await dirSync.fileOps.writeEntity(updatedEntity);

      const content = readFileSync(join(testDir, "test-entity.md"), "utf-8");
      expect(content).toContain("# Updated");
      expect(content).not.toContain("# Original");
    });

    it("should delete file when entity is deleted", async () => {
      await harness.installPlugin(plugin);
      const dirSync = getDirectorySyncOrFail();

      const entity = createTestEntity("base", {
        id: "test-entity",
        content: "# Test\n\nContent",
        metadata: {},
      });

      await dirSync.fileOps.writeEntity(entity);

      const filePath = join(testDir, "test-entity.md");
      expect(existsSync(filePath)).toBe(true);

      unlinkSync(filePath);
      expect(existsSync(filePath)).toBe(false);
    });

    it("should not setup handlers when autoSync is false", async () => {
      const noAutoPlugin = new DirectorySyncPlugin({
        syncPath: testDir,
        autoSync: false,
        initialSync: false,
      });

      await harness.installPlugin(noAutoPlugin);

      const dirSync = noAutoPlugin.getDirectorySync();
      expect(dirSync).toBeDefined();

      expect(existsSync(join(testDir, "test-entity.md"))).toBe(false);
    });
  });

  describe("File Operations", () => {
    it("should write multiple entities to different files", async () => {
      await harness.installPlugin(plugin);
      const dirSync = getDirectorySyncOrFail();

      const entity1 = createTestEntity("base", {
        id: "entity-1",
        content: "# Entity 1",
        metadata: {},
      });

      const entity2 = createTestEntity("base", {
        id: "entity-2",
        content: "# Entity 2",
        metadata: {},
      });

      await dirSync.fileOps.writeEntity(entity1);
      await dirSync.fileOps.writeEntity(entity2);

      expect(existsSync(join(testDir, "entity-1.md"))).toBe(true);
      expect(existsSync(join(testDir, "entity-2.md"))).toBe(true);
    });
  });
});
