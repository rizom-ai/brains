import {
  createMockEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";

/**
 * A book section lives in its book's folder, `book/<book>/…`. A section file
 * in a folder of its own, `book-section/<book>/…`, reads as the same section;
 * the import moves it into place, so the cleanup that looks for it there
 * finds it and the entity is kept.
 */
describe("a contained type's file outside its container's folder", () => {
  let testDir: string;
  let store: Map<string, BaseEntity>;
  let logger: ReturnType<typeof createMockLogger>;
  let entityService: ReturnType<typeof createMockEntityService>;

  const key = (entityType: string, id: string): string => `${entityType}/${id}`;

  function write(relativePath: string, content: string): void {
    const path = join(testDir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  function boot(): DirectorySync {
    return new DirectorySync({
      syncPath: testDir,
      entityService,
      logger,
      deleteOnFileRemoval: true,
    });
  }

  /** One boot's sync: import every file, then remove the orphans. */
  async function sync(): Promise<{ deleted: number }> {
    const directorySync = boot();
    await directorySync.importEntities();
    return directorySync.removeOrphanedEntities();
  }

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-misplaced-contained-"));
    store = new Map();
    logger = createMockLogger();
    entityService = createMockEntityService({
      entityTypes: ["note", "book", "book-section"],
      listEntitiesImpl: async (request) =>
        [...store.values()].filter(
          (entity) => entity.entityType === request.entityType,
        ),
    });
    spyOn(entityService, "getEntityTypeConfig").mockImplementation(
      (type: string) =>
        type === "book-section" ? { containedIn: "book" } : {},
    );
    spyOn(entityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity) => entity.content,
    );
    spyOn(entityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );
    spyOn(entityService, "getEntityWriteSnapshot").mockImplementation(
      async (request) => {
        const entity = store.get(key(request.entityType, request.id));
        return entity ? { entity, revision: entity.contentHash } : null;
      },
    );
    spyOn(entityService, "upsertEntity").mockImplementation(async (request) => {
      const entity = createTestEntity(request.entity.entityType, {
        ...request.entity,
      });
      store.set(key(entity.entityType, entity.id), entity);
      return {
        entityId: entity.id,
        jobId: `job-${entity.id}`,
        skipped: false,
        created: true,
      };
    });
    spyOn(entityService, "deleteEntity").mockImplementation(async (request) =>
      store.delete(key(request.entityType, request.id)),
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("imports the section, moves its file into the book's folder and keeps it", async () => {
    write("book/zara.md", "# Zarathustra\n");
    write("book-section/zara/00001-vorrede.md", "Vorrede.\n");

    const first = await sync();

    expect(
      existsSync(join(testDir, "book-section/zara/00001-vorrede.md")),
    ).toBe(false);
    expect(
      readFileSync(join(testDir, "book/zara/00001-vorrede.md"), "utf-8"),
    ).toBe("Vorrede.\n");
    expect(store.get("book-section/zara:00001-vorrede")?.content).toBe(
      "Vorrede.\n",
    );
    expect(first.deleted).toBe(0);

    const second = await sync();

    expect(second.deleted).toBe(0);
    expect(store.has("book-section/zara:00001-vorrede")).toBe(true);
    expect(entityService.deleteEntity).not.toHaveBeenCalled();
  });

  it("moves a nested section with its chapter folders", async () => {
    write(
      "book-section/zara/00002-erster-theil/00002-von-den-drei-verwandlungen.md",
      "Drei Verwandlungen.\n",
    );

    const first = await sync();
    const second = await sync();

    expect(
      readFileSync(
        join(
          testDir,
          "book/zara/00002-erster-theil/00002-von-den-drei-verwandlungen.md",
        ),
        "utf-8",
      ),
    ).toBe("Drei Verwandlungen.\n");
    expect(existsSync(join(testDir, "book-section"))).toBe(false);
    expect(
      store.has(
        "book-section/zara:00002-erster-theil:00002-von-den-drei-verwandlungen",
      ),
    ).toBe(true);
    expect(first.deleted + second.deleted).toBe(0);
  });

  it("keeps a misplaced file where it is when its book's folder already has one", async () => {
    write("book/zara/00001-vorrede.md", "Placed.\n");
    await sync();
    write("book-section/zara/00001-vorrede.md", "Misplaced.\n");

    const result = await boot().importEntities();
    const cleanup = await boot().removeOrphanedEntities();

    expect(
      readFileSync(join(testDir, "book/zara/00001-vorrede.md"), "utf-8"),
    ).toBe("Placed.\n");
    expect(
      readFileSync(
        join(testDir, "book-section/zara/00001-vorrede.md"),
        "utf-8",
      ),
    ).toBe("Misplaced.\n");
    expect(store.get("book-section/zara:00001-vorrede")?.content).toBe(
      "Placed.\n",
    );
    expect(entityService.upsertEntity).toHaveBeenCalledTimes(1);
    expect(cleanup.deleted).toBe(0);
    expect(result.issues).toContainEqual({
      path: "book-section/zara/00001-vorrede.md",
      message: expect.stringContaining("book/zara/00001-vorrede.md"),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("placement"),
      expect.objectContaining({
        path: "book-section/zara/00001-vorrede.md",
        canonicalPath: "book/zara/00001-vorrede.md",
      }),
    );
  });

  it("leaves a section already in its book's folder where it is", async () => {
    write("book/zara/00001-vorrede.md", "Vorrede.\n");

    await sync();

    expect(
      readFileSync(join(testDir, "book/zara/00001-vorrede.md"), "utf-8"),
    ).toBe("Vorrede.\n");
    expect(store.has("book-section/zara:00001-vorrede")).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
