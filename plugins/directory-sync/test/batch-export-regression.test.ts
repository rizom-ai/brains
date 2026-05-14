import { describe, it, expect, mock } from "bun:test";
import { BatchOperationsManager } from "../src/lib/batch-operations";
import {
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";

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
  const makeManager = (deleteOnFileRemoval = true): BatchOperationsManager =>
    new BatchOperationsManager({
      logger: createSilentLogger("test"),
      syncPath: "/tmp/test",
      deleteOnFileRemoval,
    });

  it("prepareBatchOperations should return zero export operations", () => {
    const result = makeManager().prepareBatchOperations([
      "note/my-note.md",
      "blog-post/my-post.md",
    ]);

    expect(result.exportOperationsCount).toBe(0);
    expect(result.importOperationsCount).toBeGreaterThan(0);

    const exportOps = result.operations.filter(
      (op) => op.type === "directory-export",
    );
    expect(exportOps).toHaveLength(0);
  });

  it("prepareBatchOperations should still create import operations", () => {
    const result = makeManager().prepareBatchOperations([
      "note/a.md",
      "note/b.md",
      "note/c.md",
    ]);

    expect(result.importOperationsCount).toBeGreaterThan(0);
    expect(result.totalFiles).toBe(3);

    const importOps = result.operations.filter(
      (op) => op.type === "directory-import",
    );
    expect(importOps.length).toBeGreaterThan(0);
  });

  it("prepareBatchOperations should append cleanup by default", () => {
    const result = makeManager().prepareBatchOperations([
      "note/a.md",
      "note/b.md",
    ]);

    const lastOp = result.operations[result.operations.length - 1];
    expect(lastOp?.type).toBe("directory-cleanup");
  });

  it("prepareBatchOperations should keep cleanup-only batches when no files", () => {
    const result = makeManager().prepareBatchOperations([]);

    expect(result.operations).toEqual([
      { type: "directory-cleanup", data: {} },
    ]);
    expect(result.exportOperationsCount).toBe(0);
    expect(result.importOperationsCount).toBe(0);
    expect(result.totalFiles).toBe(0);
  });

  it("queueSyncBatch should enqueue cleanup-only batches when no files", async () => {
    const context = createMockServicePluginContext();
    const enqueueBatch = mock(async () => "batch-cleanup");
    context.jobs.enqueueBatch = enqueueBatch;

    const result = await makeManager().queueSyncBatch(context, "test", []);

    expect(enqueueBatch).toHaveBeenCalledWith(
      [{ type: "directory-cleanup", data: {} }],
      expect.anything(),
    );
    expect(result).toMatchObject({
      batchId: "batch-cleanup",
      operationCount: 1,
      importOperationsCount: 0,
      totalFiles: 0,
    });
  });

  it("prepareBatchOperations should skip cleanup when deleteOnFileRemoval is false", () => {
    const result = makeManager(false).prepareBatchOperations(["note/a.md"]);

    const cleanupOps = result.operations.filter(
      (op) => op.type === "directory-cleanup",
    );
    expect(cleanupOps).toHaveLength(0);
  });

  it("queueSyncBatch should skip empty batches entirely when deleteOnFileRemoval is false", async () => {
    const context = createMockServicePluginContext();
    const enqueueBatch = mock(async () => "batch-noop");
    context.jobs.enqueueBatch = enqueueBatch;

    const result = await makeManager(false).queueSyncBatch(context, "test", []);

    expect(enqueueBatch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
