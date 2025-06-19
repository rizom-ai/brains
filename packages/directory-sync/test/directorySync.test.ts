import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/directorySync";
import { createSilentLogger } from "@brains/utils";
import type { EntityService, BaseEntity } from "@brains/types";
import type { EntityAdapter } from "@brains/base-entity";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  fromMarkdown(markdown: string): BaseEntity {
    // Simple mock implementation
    const lines = markdown.split("\n");
    const title = lines[0].replace("# ", "");
    return {
      id: title.toLowerCase().replace(/\s+/g, "-"),
      title,
      content: lines.slice(2).join("\n"),
      entityType: "base",
      created: new Date(),
      updated: new Date(),
    };
  }

  toMarkdown(entity: BaseEntity): string {
    return `# ${entity.title}\n\n${entity.content}`;
  }

  validate(entity: unknown): entity is BaseEntity {
    return true;
  }
}

// Mock entity service
class MockEntityService implements Partial<EntityService> {
  private entities: Map<string, BaseEntity[]> = new Map();
  private adapters: Map<string, EntityAdapter<BaseEntity>> = new Map();

  constructor() {
    this.adapters.set("base", new MockEntityAdapter());
    this.adapters.set("note", new MockEntityAdapter());
  }

  async listEntities(entityType: string, options?: any): Promise<BaseEntity[]> {
    return this.entities.get(entityType) || [];
  }

  getEntityTypes(): string[] {
    return ["base", "note"];
  }

  hasAdapter(entityType: string): boolean {
    return this.adapters.has(entityType);
  }

  getAdapter(entityType: string): EntityAdapter<BaseEntity> {
    const adapter = this.adapters.get(entityType);
    if (!adapter) {
      throw new Error(`No adapter for entity type: ${entityType}`);
    }
    return adapter;
  }

  async importRawEntity(raw: any): Promise<void> {
    const adapter = this.getAdapter(raw.entityType);
    const entity = adapter.fromMarkdown(raw.content);

    const entities = this.entities.get(raw.entityType) || [];
    entities.push({
      ...entity,
      id: raw.id,
      created: raw.created,
      updated: raw.updated,
    });
    this.entities.set(raw.entityType, entities);
  }

  // Helper methods for testing
  addEntity(entity: BaseEntity): void {
    const entities = this.entities.get(entity.entityType) || [];
    entities.push(entity);
    this.entities.set(entity.entityType, entities);
  }

  getEntities(entityType: string): BaseEntity[] {
    return this.entities.get(entityType) || [];
  }
}

describe("DirectorySync", (): void => {
  let directorySync: DirectorySync;
  let entityService: MockEntityService;
  let syncPath: string;
  const logger = createSilentLogger();

  beforeEach((): void => {
    // Create a temporary directory for testing
    syncPath = join(tmpdir(), `brain-test-${Date.now()}`);

    entityService = new MockEntityService();
    directorySync = new DirectorySync({
      syncPath,
      entityService: entityService as any,
      logger,
    });
  });

  afterEach((): void => {
    // Clean up test directory
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  test("initialize creates sync directory", async (): Promise<void> => {
    expect(existsSync(syncPath)).toBe(false);

    await directorySync.initialize();

    expect(existsSync(syncPath)).toBe(true);
  });

  test("export entities to directory", async (): Promise<void> => {
    await directorySync.initialize();

    // Add test entities
    entityService.addEntity({
      id: "test-1",
      title: "Test Entity 1",
      content: "This is test content 1",
      entityType: "base",
      created: new Date(),
      updated: new Date(),
    });

    entityService.addEntity({
      id: "test-note",
      title: "Test Note",
      content: "This is a test note",
      entityType: "note",
      created: new Date(),
      updated: new Date(),
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
    entityService.addEntity({
      id: "import-test",
      title: "Import Test",
      content: "Content to import",
      entityType: "base",
      created: new Date(),
      updated: new Date(),
    });

    await directorySync.exportEntities();

    // Clear entities
    entityService = new MockEntityService();
    directorySync = new DirectorySync({
      syncPath,
      entityService: entityService as any,
      logger,
    });

    // Import entities
    const result = await directorySync.importEntities();

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);

    // Check entity was imported
    const imported = entityService.getEntities("base");
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
    entityService.addEntity({
      id: "sync-test",
      title: "Sync Test",
      content: "Sync content",
      entityType: "base",
      created: new Date(),
      updated: new Date(),
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
    entityService.addEntity({
      id: "status-test",
      title: "Status Test",
      content: "Status content",
      entityType: "base",
      created: new Date(),
      updated: new Date(),
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
