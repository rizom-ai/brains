import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/directorySync";
import { createSilentLogger } from "@brains/utils";
import type { BaseEntity } from "@brains/types";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { EntityAdapter } from "@brains/types";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock entity adapter
class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  fromMarkdown(markdown: string): Partial<BaseEntity> {
    // Simple mock implementation
    const lines = markdown.split("\n");
    const firstLine = lines[0]?.replace("# ", "") || "";
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

  serializeEntity(entity: BaseEntity): string {
    const adapter = this.adapters.get(entity.entityType);
    if (!adapter) {
      throw new Error(`No adapter for entity type: ${entity.entityType}`);
    }
    return adapter.toMarkdown(entity);
  }

  deserializeEntity(markdown: string, entityType: string): Partial<BaseEntity> {
    const adapter = this.adapters.get(entityType);
    if (!adapter) {
      throw new Error(`No adapter for entity type: ${entityType}`);
    }
    return adapter.fromMarkdown(markdown);
  }

  async createEntity<T extends BaseEntity>(
    entity: Omit<T, "id" | "created" | "updated"> & {
      id?: string;
      created?: string;
      updated?: string;
    },
  ): Promise<{ entityId: string; jobId: string }> {
    const entities = this.entities.get(entity.entityType) || [];
    const newEntity = {
      ...entity,
      id: entity.id || `generated-${Date.now()}`,
      created: entity.created || new Date().toISOString(),
      updated: entity.updated || new Date().toISOString(),
    } as T;
    entities.push(newEntity);
    this.entities.set(entity.entityType, entities);
    return {
      entityId: newEntity.id,
      jobId: `mock-job-${Date.now()}`,
    };
  }

  async updateEntity<T extends BaseEntity>(
    entity: T,
  ): Promise<{ entityId: string; jobId: string }> {
    const entities = this.entities.get(entity.entityType) || [];
    const index = entities.findIndex((e) => e.id === entity.id);
    if (index >= 0) {
      entities[index] = entity;
      this.entities.set(entity.entityType, entities);
    }
    return {
      entityId: entity.id,
      jobId: `mock-job-${Date.now()}`,
    };
  }

  async getAsyncJobStatus(): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    error?: string;
  } | null> {
    return {
      status: "completed",
    };
  }

  async getEntity<T extends BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entities = this.entities.get(entityType) || [];
    return (entities.find((e) => e.id === id) as T) || null;
  }

  async deleteEntity(id: string): Promise<boolean> {
    for (const [entityType, entities] of this.entities) {
      const index = entities.findIndex((e) => e.id === id);
      if (index >= 0) {
        entities.splice(index, 1);
        this.entities.set(entityType, entities);
        return true;
      }
    }
    return false;
  }

  async search(): Promise<any[]> {
    return [];
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
    await entityService.createEntity({
      id: "test-1",
      content: "Test Entity 1\nThis is test content 1",
      entityType: "base",
    });

    await entityService.createEntity({
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
    await entityService.createEntity({
      id: "import-test",
      content: "Import Test\nContent to import",
      entityType: "base",
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
    const imported = await entityService.listEntities("base");
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
    await entityService.createEntity({
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
    await entityService.createEntity({
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
