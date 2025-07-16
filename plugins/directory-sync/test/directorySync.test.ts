import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/directorySync";
import { PluginTestHarness } from "@brains/test-utils";
import type { BaseEntity, EntityAdapter } from "@brains/types";
import { baseEntitySchema } from "@brains/types";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    // Simple mock implementation
    const lines = markdown.split("\n");
    return {
      content: lines.slice(2).join("\n"),
    };
  }

  toMarkdown(entity: BaseEntity): string {
    // Extract title from content or use a default
    const firstLine = entity.content.split("\n")[0] || "Untitled";
    return `# ${firstLine}\n\n${entity.content}`;
  }

  validate(entity: unknown): entity is BaseEntity {
    return true;
  }
}

describe("DirectorySync", (): void => {
  let directorySync: DirectorySync;
  let harness: PluginTestHarness;
  let syncPath: string;

  beforeEach(async (): Promise<void> => {
    // Create a temporary directory for testing
    syncPath = join(tmpdir(), `brain-test-${Date.now()}`);

    // Set up test harness
    harness = new PluginTestHarness();
    await harness.setup();

    // Register entity types with adapters
    const pluginContext = harness.getPluginContext();
    pluginContext.registerEntityType(
      "base",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
    pluginContext.registerEntityType(
      "note",
      baseEntitySchema,
      new MockEntityAdapter(),
    );

    // Create DirectorySync with harness entity service
    directorySync = new DirectorySync({
      syncPath,
      entityService: pluginContext.entityService,
      logger: pluginContext.logger,
    });
  });

  afterEach(async (): Promise<void> => {
    // Clean up test directory
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
    // Clean up harness
    await harness.cleanup();
  });

  test("initialize creates sync directory", async (): Promise<void> => {
    expect(existsSync(syncPath)).toBe(false);

    await directorySync.initialize();

    expect(existsSync(syncPath)).toBe(true);
  });

  test("export entities to directory", async (): Promise<void> => {
    await directorySync.initialize();

    // Add test entities
    await harness.createTestEntity("base", {
      id: "test-1",
      content: "Test Entity 1\nThis is test content 1",
      entityType: "base",
    });

    await harness.createTestEntity("note", {
      id: "test-note",
      content: "Test Note\nThis is a test note",
      entityType: "note",
    });

    // Export entities
    const result = await directorySync.exportEntities();

    expect(result.exported).toBe(2);
    expect(result.failed).toBe(0);

    // Check files were created
    expect(existsSync(join(syncPath, "test-1.md"))).toBe(true);
    expect(existsSync(join(syncPath, "note", "test-note.md"))).toBe(true);

    // Check content
    const baseContent = readFileSync(join(syncPath, "test-1.md"), "utf-8");
    expect(baseContent).toContain("Test Entity 1");
    expect(baseContent).toContain("This is test content 1");
  });

  test("import entities from directory", async (): Promise<void> => {
    await directorySync.initialize();

    // First export some entities
    await harness.createTestEntity("base", {
      id: "import-test",
      content: "Import Test\nContent to import",
      entityType: "base",
    });

    await directorySync.exportEntities();

    // Clear entities and reinitialize
    await harness.cleanup();
    harness = new PluginTestHarness();
    await harness.setup();
    const pluginContext = harness.getPluginContext();
    pluginContext.registerEntityType(
      "base",
      baseEntitySchema,
      new MockEntityAdapter(),
    );
    pluginContext.registerEntityType(
      "note",
      baseEntitySchema,
      new MockEntityAdapter(),
    );

    directorySync = new DirectorySync({
      syncPath,
      entityService: pluginContext.entityService,
      logger: pluginContext.logger,
    });

    // Import entities
    const result = await directorySync.importEntities();

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    // Check entity was imported
    const imported = await harness.listEntities("base");
    expect(imported).toHaveLength(1);
    expect(imported[0].id).toBe("import-test");
  });

  test("getEntityFilePath returns correct paths", (): void => {
    const baseEntity: BaseEntity = {
      id: "base-entity",
      title: "Base Entity",
      content: "",
      entityType: "base",
      created: new Date(),
      updated: new Date(),
    };

    const noteEntity: BaseEntity = {
      id: "note-entity",
      title: "Note Entity",
      content: "",
      entityType: "note",
      created: new Date(),
      updated: new Date(),
    };

    expect(directorySync.getEntityFilePath(baseEntity)).toBe(
      join(syncPath, "base-entity.md"),
    );

    expect(directorySync.getEntityFilePath(noteEntity)).toBe(
      join(syncPath, "note", "note-entity.md"),
    );
  });

  test("sync performs import then export", async (): Promise<void> => {
    await directorySync.initialize();

    // Add an entity
    await harness.createTestEntity("base", {
      id: "sync-test",
      content: "Sync Test\nSync content",
      entityType: "base",
    });

    // Perform sync
    const result = await directorySync.sync();

    expect(result.export.exported).toBe(1);
    expect(result.import.imported).toBe(0); // No existing files to import
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // Check file was created
    expect(existsSync(join(syncPath, "sync-test.md"))).toBe(true);
  });

  test("getStatus returns directory information", async (): Promise<void> => {
    await directorySync.initialize();

    // Add and export some entities
    await harness.createTestEntity("base", {
      id: "status-test",
      content: "Status Test\nStatus content",
      entityType: "base",
    });

    await directorySync.exportEntities();

    // Get status
    const status = await directorySync.getStatus();

    expect(status.syncPath).toBe(syncPath);
    expect(status.exists).toBe(true);
    expect(status.watching).toBe(false);
    expect(status.stats.totalFiles).toBe(1);
    expect(status.stats.byEntityType.base).toBe(1);
    expect(status.files).toHaveLength(1);
    expect(status.files[0].path).toBe("status-test.md");
  });
});
