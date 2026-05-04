import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BaseEntity } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

/**
 * Regression test: entity:import:request should clean up orphaned entities.
 *
 * Production bug:
 * 1. git-sync pulls, which deletes a file from disk
 * 2. git-sync sends entity:import:request with the changed paths
 * 3. importEntities() imports new/changed files but ignores missing ones
 * 4. Orphaned DB entity persists because cleanup never runs
 * 5. Deleted entity keeps reappearing (e.g., on CMS, in exports)
 *
 * The fix: run removeOrphanedEntities() after import in the message handler.
 */
describe("Import then orphan cleanup", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;

  // Simulated DB: listEntities returns these
  let storedEntities: Record<string, BaseEntity[]>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-import-orphan-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    storedEntities = { note: [] };

    mockEntityService = createMockEntityService({
      entityTypes: ["note"],
      listEntitiesImpl: async (request: { entityType: string }) =>
        storedEntities[request.entityType] ?? [],
    });

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
      deleteOnFileRemoval: true,
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should delete orphaned entity when file is removed after import", async () => {
    // Step 1: Create a file and import it
    mkdirSync(join(testDir, "note"), { recursive: true });
    writeFileSync(
      join(testDir, "note", "test-123.md"),
      "---\ntitle: Test 123\n---\nContent\n",
    );

    await dirSync.importEntities(["note/test-123.md"]);

    // Simulate the entity being in the DB after import
    storedEntities["note"] = [createTestEntity("note", { id: "test-123" })];

    // Step 2: Delete the file (simulating git pull that removed it)
    unlinkSync(join(testDir, "note", "test-123.md"));

    // Step 3: Run orphan cleanup — should delete the entity from DB
    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(1);
    expect(mockEntityService.deleteEntity).toHaveBeenCalledWith(
      "note",
      "test-123",
    );
  });

  it("should not delete entities that still have files on disk", async () => {
    mkdirSync(join(testDir, "note"), { recursive: true });
    writeFileSync(
      join(testDir, "note", "keep-me.md"),
      "---\ntitle: Keep Me\n---\nContent\n",
    );

    await dirSync.importEntities(["note/keep-me.md"]);

    // Entity in DB, file still on disk
    storedEntities["note"] = [createTestEntity("note", { id: "keep-me" })];

    const result = await dirSync.removeOrphanedEntities();

    expect(result.deleted).toBe(0);
    expect(mockEntityService.deleteEntity).not.toHaveBeenCalled();
  });
});
