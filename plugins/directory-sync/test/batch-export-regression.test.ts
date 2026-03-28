import { describe, it, expect } from "bun:test";
import { BatchOperationsManager } from "../src/lib/batch-operations";
import { createSilentLogger } from "@brains/test-utils";

/**
 * Regression test: queueSyncBatch should NOT create export operations.
 *
 * The bug: prepareBatchOperations creates export ops (DB→file) BEFORE
 * import ops (file→DB). When a user edits a file and runs sync, the
 * export overwrites their edit with stale DB content before the import
 * can pick it up.
 *
 * Exports are already handled by auto-sync's entity:created/entity:updated
 * subscribers — the batch export is redundant and destructive.
 */
describe("batch operations should not include exports (regression)", () => {
  it("prepareBatchOperations should return zero export operations", () => {
    const manager = new BatchOperationsManager(
      createSilentLogger("test"),
      "/tmp/test",
    );

    const result = manager.prepareBatchOperations(
      ["note", "blog-post", "series"],
      ["note/my-note.md", "blog-post/my-post.md"],
    );

    expect(result.exportOperationsCount).toBe(0);
    expect(result.importOperationsCount).toBeGreaterThan(0);

    // No operation should have type "directory-export"
    const exportOps = result.operations.filter(
      (op) => op.type === "directory-export",
    );
    expect(exportOps).toHaveLength(0);
  });

  it("prepareBatchOperations should still create import operations", () => {
    const manager = new BatchOperationsManager(
      createSilentLogger("test"),
      "/tmp/test",
    );

    const result = manager.prepareBatchOperations(
      ["note"],
      ["note/a.md", "note/b.md", "note/c.md"],
    );

    expect(result.importOperationsCount).toBeGreaterThan(0);
    expect(result.totalFiles).toBe(3);

    const importOps = result.operations.filter(
      (op) => op.type === "directory-import",
    );
    expect(importOps.length).toBeGreaterThan(0);
  });

  it("prepareBatchOperations should return empty when no files", () => {
    const manager = new BatchOperationsManager(
      createSilentLogger("test"),
      "/tmp/test",
    );

    const result = manager.prepareBatchOperations(["note"], []);

    expect(result.operations).toHaveLength(0);
    expect(result.exportOperationsCount).toBe(0);
    expect(result.importOperationsCount).toBe(0);
  });
});
