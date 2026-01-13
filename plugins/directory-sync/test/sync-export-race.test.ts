import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { createSilentLogger } from "@brains/test-utils";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";

/**
 * Test that sync() should NOT call exportEntities().
 * Export should be handled by entity:updated subscribers instead.
 *
 * This test will FAIL with the current implementation (sync does export)
 * and PASS after the fix (sync only imports).
 */
describe("sync() should not export (regression)", () => {
  let syncPath: string;
  let directorySync: DirectorySync;

  beforeEach(() => {
    syncPath = join(tmpdir(), `test-sync-no-export-${Date.now()}`);
    mkdirSync(syncPath, { recursive: true });
    mkdirSync(join(syncPath, "series"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  it("sync() should only import, not export", async () => {
    // Create a file with coverImageId
    const fileContent = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

    const filePath = join(syncPath, "series", "series-test-series.md");
    writeFileSync(filePath, fileContent);

    // Track what the mock entity service returns
    const oldDbContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

    const mockEntity: BaseEntity = createTestEntity("series", {
      id: "series-test-series",
      content: oldDbContent, // DB has OLD content without coverImageId
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata: { name: "Test Series", slug: "test-series" },
    });

    // Create mock entity service
    const mockEntityService = {
      getEntityTypes: () => ["series"],
      hasEntityType: (type: string) => type === "series",
      getEntity: async () => mockEntity,
      listEntities: async () => [mockEntity],
      upsertEntity: async () => ({
        entityId: "series-test-series",
        jobId: "job-123",
        created: false,
      }),
      deserializeEntity: () => ({
        content: fileContent,
        entityType: "series",
        metadata: { name: "Test Series", slug: "test-series" },
      }),
      serializeEntity: (entity: BaseEntity) => entity.content,
      getAsyncJobStatus: async () => ({ status: "completed" as const }),
    } as unknown as IEntityService;

    // Create DirectorySync with the mock
    directorySync = new DirectorySync({
      syncPath,
      autoSync: false,
      entityTypes: ["series"],
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });

    await directorySync.initialize();

    // Run sync
    const result = await directorySync.sync();

    // Read the file after sync
    const fileContentAfterSync = readFileSync(filePath, "utf-8");

    // THE KEY ASSERTION:
    // If sync() exports, it will write the OLD DB content (without coverImageId)
    // If sync() only imports, the file should still have coverImageId

    // This test should FAIL with current implementation because:
    // 1. sync() calls exportEntities()
    // 2. exportEntities() reads mockEntity from DB (which has old content)
    // 3. exportEntities() writes old content to file, stripping coverImageId

    expect(fileContentAfterSync).toContain("coverImageId: series-test-cover");

    // Also verify the result structure shows no export happened
    // After the fix, result.export should show 0 exported or not exist
    // Current implementation will show exported: 1
    expect(result.export.exported).toBe(0);
  });
});
