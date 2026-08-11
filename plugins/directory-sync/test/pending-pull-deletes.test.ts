import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createMockEntityService,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";
import { TINY_PDF_BYTES } from "./fixtures";

describe("pending pull deletions", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "pending-pull-delete-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  function createDirectorySync(deleteOnFileRemoval = true): DirectorySync {
    return new DirectorySync({
      syncPath: testDir,
      deleteOnFileRemoval,
      entityService: createMockEntityService({
        entityTypes: ["note", "document"],
      }),
      logger: createSilentLogger("pending-pull-delete"),
    });
  }

  it("tracks a missing pulled path until its entity delete completes", async () => {
    const directorySync = createDirectorySync();

    await directorySync.recordPendingPullDeletes(["remote-deleted.md"]);

    expect(directorySync.isPendingDelete("note", "remote-deleted")).toBe(true);
    directorySync.completePendingDelete(
      "note",
      "remote-deleted",
      join(testDir, "different.md"),
    );
    expect(directorySync.isPendingDelete("note", "remote-deleted")).toBe(true);
    directorySync.completePendingDelete(
      "note",
      "remote-deleted",
      join(testDir, "remote-deleted.md"),
    );
    expect(directorySync.isPendingDelete("note", "remote-deleted")).toBe(false);
  });

  it("tracks a remote deletion even if a late export recreated the file", async () => {
    writeFileSync(join(testDir, "resurrected.md"), "late export");
    const directorySync = createDirectorySync();

    await directorySync.recordPendingPullDeletes(["resurrected.md"]);

    expect(directorySync.isPendingDelete("note", "resurrected")).toBe(true);
  });

  it("does not treat a sidecar-only deletion as an entity deletion", async () => {
    mkdirSync(join(testDir, "document"), { recursive: true });
    writeFileSync(join(testDir, "document", "kept.pdf"), TINY_PDF_BYTES);
    const directorySync = createDirectorySync();

    await directorySync.recordPendingPullDeletes([
      "document/kept.pdf.meta.json",
    ]);

    expect(directorySync.isPendingDelete("document", "kept")).toBe(false);
  });

  it("clears a pending pull deletion after initial-sync cleanup", async () => {
    const entityService = createMockEntityService({ entityTypes: ["note"] });
    const deleted = createTestEntity("note", { id: "remote-deleted" });
    spyOn(entityService, "listEntities").mockResolvedValue([deleted]);
    spyOn(entityService, "deleteEntity").mockResolvedValue(true);
    const directorySync = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("pending-pull-cleanup"),
    });
    await directorySync.recordPendingPullDeletes(["remote-deleted.md"]);

    await directorySync.removeOrphanedEntities();

    expect(directorySync.isPendingDelete("note", "remote-deleted")).toBe(false);
  });

  it("does not retain pull deletions when entity removal is disabled", async () => {
    const directorySync = createDirectorySync(false);

    await directorySync.recordPendingPullDeletes(["remote-deleted.md"]);

    expect(directorySync.isPendingDelete("note", "remote-deleted")).toBe(false);
  });
});
