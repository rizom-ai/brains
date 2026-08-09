import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { baseEntitySchema, createPluginHarness } from "@brains/plugins/test";
import { rmSync, existsSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestEntity } from "@brains/test-utils";
import type { DirectorySync } from "../src/lib/directory-sync";
import type { BaseEntity } from "@brains/plugins";
import { MockEntityAdapter } from "./fixtures";

describe("DirectorySync AutoSync", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: DirectorySyncPlugin;
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-auto-sync-"));

    harness = createPluginHarness({ dataDir: testDir });
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());

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

      const entity = createTestEntity("note", {
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

      const entity = createTestEntity("note", {
        id: "test-entity",
        content: "# Original\n\nOriginal content",
        metadata: {},
      });

      await dirSync.fileOps.writeEntity(entity);

      const updatedEntity = createTestEntity("note", {
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

      const entity = createTestEntity("note", {
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

      const entity1 = createTestEntity("note", {
        id: "entity-1",
        content: "# Entity 1",
        metadata: {},
      });

      const entity2 = createTestEntity("note", {
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

describe("Export echo suppression", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: DirectorySyncPlugin;
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-echo-suppression-"));
    harness = createPluginHarness({ dataDir: testDir });
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
    plugin = new DirectorySyncPlugin({
      syncPath: testDir,
      autoSync: true,
      initialSync: false,
    });
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function dirSyncOrFail(): DirectorySync {
    const dirSync = plugin.getDirectorySync();
    if (!dirSync) throw new Error("DirectorySync not initialized");
    return dirSync;
  }

  it("suppresses the write path before an entity:created export", async () => {
    const dirSync = dirSyncOrFail();
    const filePath = join(testDir, "echo-created.md");
    const suppress = spyOn(dirSync, "suppressWatchPaths").mockImplementation(
      () => {
        expect(existsSync(filePath)).toBe(false);
      },
    );

    const entity = createTestEntity("note", {
      id: "echo-created",
      content: "---\n---\nEcho created",
    });
    await harness.sendMessage(
      "entity:created",
      { entity, entityType: "note", entityId: "echo-created" },
      "test",
    );

    expect(existsSync(filePath)).toBe(true);
    expect(suppress).toHaveBeenCalledWith([filePath]);
  });

  it("suppresses the write path before an entity:updated export", async () => {
    const dirSync = dirSyncOrFail();
    const entity = createTestEntity("note", {
      id: "echo-updated",
      content: "---\n---\nEcho updated",
    });
    const entityService = harness.getEntityService();
    const origGetEntity = entityService.getEntity.bind(entityService);
    entityService.getEntity = async <T extends BaseEntity>(request: {
      entityType: string;
      id: string;
    }): Promise<T | null> => {
      if (request.entityType === "note" && request.id === "echo-updated") {
        return entity as T;
      }
      return origGetEntity(request);
    };
    const filePath = join(testDir, "echo-updated.md");
    const suppress = spyOn(dirSync, "suppressWatchPaths").mockImplementation(
      () => {
        expect(existsSync(filePath)).toBe(false);
      },
    );

    await harness.sendMessage(
      "entity:updated",
      { entity, entityType: "note", entityId: "echo-updated" },
      "test",
    );

    expect(existsSync(filePath)).toBe(true);
    expect(suppress).toHaveBeenCalledWith([filePath]);
  });

  it("suppresses the file path before an entity:deleted unlink", async () => {
    const dirSync = dirSyncOrFail();
    const entity = createTestEntity("note", {
      id: "echo-deleted",
      content: "---\n---\nEcho deleted",
    });
    await dirSync.fileOps.writeEntity(entity);
    const filePath = join(testDir, "echo-deleted.md");
    expect(existsSync(filePath)).toBe(true);

    const suppress = spyOn(dirSync, "suppressWatchPaths").mockImplementation(
      () => {
        expect(existsSync(filePath)).toBe(true);
      },
    );
    await harness.sendMessage(
      "entity:deleted",
      { entityId: "echo-deleted", entityType: "note" },
      "test",
    );

    expect(existsSync(filePath)).toBe(false);
    expect(suppress).toHaveBeenCalledWith([filePath]);
  });

  it("does not recreate a pull-deleted entity from a late create event", async () => {
    const dirSync = dirSyncOrFail();
    const entity = createTestEntity("note", {
      id: "remote-deleted-create",
      content: "---\n---\nLate create event",
    });
    await dirSync.recordPendingPullDeletes(["remote-deleted-create.md"]);

    await harness.sendMessage(
      "entity:created",
      {
        entity,
        entityType: "note",
        entityId: "remote-deleted-create",
      },
      "test",
    );

    expect(existsSync(join(testDir, "remote-deleted-create.md"))).toBe(false);
  });

  it("does not recreate a pull-deleted entity from a late update", async () => {
    const dirSync = dirSyncOrFail();
    const entity = createTestEntity("note", {
      id: "remote-deleted",
      content: "---\n---\nLate embedding update",
    });
    const entityService = harness.getEntityService();
    entityService.getEntity = async <T extends BaseEntity>(): Promise<T> =>
      entity as T;
    await dirSync.recordPendingPullDeletes(["remote-deleted.md"]);
    expect(dirSync.isPendingDelete("note", "remote-deleted")).toBe(true);
    expect(existsSync(join(testDir, "remote-deleted.md"))).toBe(false);

    await harness.sendMessage(
      "entity:updated",
      { entity, entityType: "note", entityId: "remote-deleted" },
      "test",
    );

    expect(existsSync(join(testDir, "remote-deleted.md"))).toBe(false);
  });

  it("still exports unrelated entities while a pull deletion is pending", async () => {
    const dirSync = dirSyncOrFail();
    await dirSync.recordPendingPullDeletes(["remote-deleted.md"]);
    const entity = createTestEntity("note", {
      id: "unrelated",
      content: "---\n---\nConcurrent local edit",
    });

    await harness.sendMessage(
      "entity:created",
      { entity, entityType: "note", entityId: "unrelated" },
      "test",
    );

    expect(existsSync(join(testDir, "unrelated.md"))).toBe(true);
  });

  it("returns pdf and sidecar paths for document write paths", () => {
    const dirSync = dirSyncOrFail();
    const document = createTestEntity("document", {
      id: "echo-doc",
      content: Buffer.from("%PDF-1.4 test").toString("base64"),
    });

    const paths = dirSync.fileOps.getEntityWritePaths(document);

    const pdfPath = dirSync.fileOps.getEntityFilePath(document);
    expect(paths).toEqual([pdfPath, `${pdfPath}.meta.json`]);
  });

  it("returns only the entity file path for text write paths", () => {
    const dirSync = dirSyncOrFail();
    const note = createTestEntity("note", {
      id: "echo-note-paths",
      content: "---\n---\nPaths",
    });

    expect(dirSync.fileOps.getEntityWritePaths(note)).toEqual([
      dirSync.fileOps.getEntityFilePath(note),
    ]);
  });
});
