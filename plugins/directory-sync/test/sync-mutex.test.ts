import { createMockEntityService } from "@brains/entity-service/test";
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  createMockServicePluginContext,
  createTempDataDir,
} from "@brains/plugins/test";
import { caughtError, createSilentLogger } from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { rmSync } from "fs";

/**
 * Tests that concurrent queueSyncBatch calls don't overlap. A second call
 * waits for the one in progress and then queues its own batch: dropping it
 * made startup report "No files to import" without importing anything.
 */
describe("sync mutex", () => {
  let testDir: string;
  let directorySync: DirectorySync;
  let context: ReturnType<typeof createMockServicePluginContext>;

  beforeEach(async () => {
    testDir = await createTempDataDir("sync-mutex-test-");

    // Create a file so queueSyncBatch has something to work with
    await mkdir(join(testDir, "note"), { recursive: true });
    await writeFile(join(testDir, "note", "test.md"), "---\n---\nContent");

    const entityService = createMockEntityService({
      entityTypes: ["note"],
      returns: {
        listEntities: [],
      },
    });
    entityService.hasEntityType = (): boolean => true;

    directorySync = new DirectorySync({
      syncPath: testDir,
      autoSync: false,
      entityService,
      logger: createSilentLogger("test"),
    });
    await directorySync.initializeDirectory();

    context = createMockServicePluginContext();
    // enqueueBatch returns a batchId
    context.jobs.enqueueBatch = mock(async () => "batch-1");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("queues the second concurrent call after the first instead of dropping it", async () => {
    // Hold the first call inside enqueueBatch until the second has been made,
    // so the overlap is guaranteed rather than relying on a sleep outlasting it.
    const firstEnqueue = Promise.withResolvers<void>();
    context.jobs.enqueueBatch = mock(async () => {
      await firstEnqueue.promise;
      return "batch-slow";
    });

    const call1 = directorySync.queueSyncBatch(context, "test-1");
    const call2 = directorySync.queueSyncBatch(context, "test-2");
    await Bun.sleep(10);
    // The second call has not started discovery while the first enqueues.
    expect(context.jobs.enqueueBatch).toHaveBeenCalledTimes(1);

    firstEnqueue.resolve();
    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(context.jobs.enqueueBatch).toHaveBeenCalledTimes(2);
  });

  it("should release mutex even if queueSyncBatch throws", async () => {
    context.jobs.enqueueBatch = mock(async () => {
      throw new Error("DB error");
    });

    try {
      await directorySync.queueSyncBatch(context, "test-fail");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(caughtError(error).message).toBe("DB error");
    }

    // Should be able to call again after error
    context.jobs.enqueueBatch = mock(async () => "batch-recovery");
    const result = await directorySync.queueSyncBatch(context, "test-retry");
    expect(result).not.toBeNull();
  });
});
