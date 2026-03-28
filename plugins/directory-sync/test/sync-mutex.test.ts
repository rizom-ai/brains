import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { createMockServicePluginContext } from "@brains/test-utils";
import { mkdtemp, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

/**
 * Tests that concurrent queueSyncBatch calls don't overlap.
 * When a batch is already in progress, a second call should
 * return null (sync already running) instead of queuing another batch.
 */
describe("sync mutex", () => {
  let testDir: string;
  let directorySync: DirectorySync;
  let context: ReturnType<typeof createMockServicePluginContext>;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "sync-mutex-test-"));

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

  it("should return null for second concurrent call", async () => {
    // Make enqueueBatch slow so the first call is still in progress
    context.jobs.enqueueBatch = mock(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "batch-slow";
    });

    const call1 = directorySync.queueSyncBatch(context, "test-1");
    const call2 = directorySync.queueSyncBatch(context, "test-2");

    const [result1, result2] = await Promise.all([call1, call2]);

    // First call succeeds, second is rejected
    expect(result1).not.toBeNull();
    expect(result2).toBeNull();
  });

  it("should release mutex even if queueSyncBatch throws", async () => {
    context.jobs.enqueueBatch = mock(async () => {
      throw new Error("DB error");
    });

    try {
      await directorySync.queueSyncBatch(context, "test-fail");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("DB error");
    }

    // Should be able to call again after error
    context.jobs.enqueueBatch = mock(async () => "batch-recovery");
    const result = await directorySync.queueSyncBatch(context, "test-retry");
    expect(result).not.toBeNull();
  });
});
