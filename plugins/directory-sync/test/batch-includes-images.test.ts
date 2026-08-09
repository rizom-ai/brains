import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { createMockServicePluginContext } from "@brains/test-utils";
import { TINY_PDF_BYTES, TINY_PNG_BYTES } from "./fixtures";

describe("queueSyncBatch should include images (regression)", () => {
  let dirSync: DirectorySync;
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-batch-images-"));

    const mockEntityService = createMockEntityService({
      entityTypes: ["post", "image"],
    });

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should include image files in batch sync", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    mkdirSync(join(testDir, "image"), { recursive: true });
    writeFileSync(join(testDir, "post", "my-post.md"), "# Post");
    writeFileSync(join(testDir, "image", "cover.png"), TINY_PNG_BYTES);

    const context = createMockServicePluginContext({
      entityTypes: ["post", "image"],
    });

    const result = await dirSync.queueSyncBatch(context, "test");

    // Should include both the markdown file and the image
    expect(result).not.toBeNull();
    expect(result?.totalFiles).toBe(2);
  });

  it("should not miss images that were previously skipped", async () => {
    mkdirSync(join(testDir, "image"), { recursive: true });
    writeFileSync(join(testDir, "image", "photo.webp"), TINY_PNG_BYTES);
    writeFileSync(join(testDir, "image", "banner.png"), TINY_PNG_BYTES);

    const context = createMockServicePluginContext({
      entityTypes: ["image"],
    });

    const result = await dirSync.queueSyncBatch(context, "test");

    expect(result).not.toBeNull();
    expect(result?.totalFiles).toBe(2);
  });

  it("queues only existing files reported by a periodic git pull", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(join(testDir, "post", "changed.md"), "# Changed");
    writeFileSync(join(testDir, "post", "unchanged.md"), "# Unchanged");

    const context = createMockServicePluginContext({ entityTypes: ["post"] });
    const result = await dirSync.queueSyncBatch(
      context,
      "periodic-sync",
      undefined,
      ["post/changed.md"],
    );

    expect(result).toMatchObject({
      operationCount: 1,
      importOperationsCount: 1,
      totalFiles: 1,
    });
  });

  it("imports a document whose metadata sidecar alone was deleted", async () => {
    mkdirSync(join(testDir, "document"), { recursive: true });
    writeFileSync(join(testDir, "document", "kept.pdf"), TINY_PDF_BYTES);
    const documentSync = new DirectorySync({
      syncPath: testDir,
      entityService: createMockEntityService({ entityTypes: ["document"] }),
      logger: createSilentLogger("sidecar-delete"),
    });
    const context = createMockServicePluginContext({
      entityTypes: ["document"],
    });

    const result = await documentSync.queueSyncBatch(
      context,
      "periodic-sync",
      undefined,
      ["document/kept.pdf.meta.json"],
      ["document/kept.pdf.meta.json"],
    );

    expect(result).toMatchObject({
      operationCount: 1,
      importOperationsCount: 1,
      totalFiles: 1,
    });
    expect(context.jobs.enqueueBatch).toHaveBeenCalledWith(
      [
        {
          type: "directory-import",
          data: {
            batchIndex: 0,
            paths: ["document/kept.pdf"],
            batchSize: 1,
          },
        },
      ],
      expect.any(Object),
    );
  });

  it("keeps an explicitly remote-deleted path out of imports if it was recreated", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(join(testDir, "post", "resurrected.md"), "# Late export");
    const context = createMockServicePluginContext({ entityTypes: ["post"] });

    const result = await dirSync.queueSyncBatch(
      context,
      "periodic-sync",
      undefined,
      ["post/resurrected.md"],
      ["post/resurrected.md"],
    );

    expect(result).toMatchObject({
      operationCount: 1,
      importOperationsCount: 0,
      totalFiles: 0,
    });
    expect(context.jobs.enqueueBatch).toHaveBeenCalledWith(
      [
        {
          type: "directory-delete",
          data: {
            entityType: "post",
            entityId: "resurrected",
            filePath: join(testDir, "post", "resurrected.md"),
          },
        },
      ],
      expect.any(Object),
    );
  });

  it("does not queue targeted deletes when file removal is disabled", async () => {
    const entityService = createMockEntityService({ entityTypes: ["post"] });
    const noDeleteSync = new DirectorySync({
      syncPath: testDir,
      deleteOnFileRemoval: false,
      entityService,
      logger: createSilentLogger("no-pull-deletes"),
    });
    const context = createMockServicePluginContext({ entityTypes: ["post"] });

    const result = await noDeleteSync.queueSyncBatch(
      context,
      "periodic-sync",
      undefined,
      ["post/deleted.md"],
    );

    expect(result).toBeNull();
    expect(context.jobs.enqueueBatch).not.toHaveBeenCalled();
  });

  it("queues targeted deletes for files deleted by a periodic git pull", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(join(testDir, "post", "untouched.md"), "# Untouched");

    const context = createMockServicePluginContext({ entityTypes: ["post"] });
    const result = await dirSync.queueSyncBatch(
      context,
      "periodic-sync",
      undefined,
      ["post/deleted.md"],
    );

    expect(result).toMatchObject({
      operationCount: 1,
      importOperationsCount: 0,
      totalFiles: 0,
    });
    expect(context.jobs.enqueueBatch).toHaveBeenCalledWith(
      [
        {
          type: "directory-delete",
          data: {
            entityType: "post",
            entityId: "deleted",
            filePath: join(testDir, "post", "deleted.md"),
          },
        },
      ],
      expect.any(Object),
    );
  });
});
