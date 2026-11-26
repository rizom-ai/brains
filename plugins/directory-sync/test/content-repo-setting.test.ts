import {
  createMockEntityService,
  createTestEntity,
} from "@brains/entity-service/test";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BaseEntity } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";

/**
 * A type declares `contentRepo: false` when its records must never leave
 * the database: a copy of another brain's entity, say. Directory sync then
 * writes it no file, reads no file as one of its records, and never takes
 * the absence of its file as a deletion.
 */
describe("a type kept out of the content repo", () => {
  let testDir: string;
  let entityService: ReturnType<typeof createMockEntityService>;
  let dirSync: DirectorySync;
  let deleted: Array<{ entityType: string; id: string }>;

  const note = createTestEntity<BaseEntity>("note", {
    id: "mine",
    content: "---\ntitle: Mine\n---\nMy own note.",
    metadata: { title: "Mine" },
  });
  const copy = createTestEntity<BaseEntity>("shared-copy", {
    id: "theirs",
    content: "---\ntitle: Theirs\n---\nA peer's text.",
    metadata: { title: "Theirs" },
  });

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-content-repo-"));
    deleted = [];
    entityService = createMockEntityService({
      entityTypes: ["note", "shared-copy"],
      listEntitiesImpl: async (request) =>
        request.entityType === "note"
          ? [note]
          : request.entityType === "shared-copy"
            ? [copy]
            : [],
    });
    spyOn(entityService, "getEntityTypeConfig").mockImplementation((type) =>
      type === "shared-copy" ? { contentRepo: false } : {},
    );
    spyOn(entityService, "deleteEntity").mockImplementation(async (request) => {
      deleted.push({ entityType: request.entityType, id: request.id });
      return true;
    });
    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("exports the other types and writes it no file", async () => {
    // With deletion on, an export takes a missing file as a removed entity;
    // off, it writes the file.
    const writing = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("test"),
      deleteOnFileRemoval: false,
    });

    await writing.exportEntities();

    expect(existsSync(join(testDir, "mine.md"))).toBe(true);
    expect(existsSync(join(testDir, "shared-copy"))).toBe(false);
  });

  it("writes it no file even when the export names the type", async () => {
    await dirSync.exportEntities(["shared-copy"]);

    expect(existsSync(join(testDir, "shared-copy"))).toBe(false);
  });

  it("never deletes its records for having no file", async () => {
    // Its own note's file is gone too, so the cleanup has something to do.
    await dirSync.removeOrphanedEntities();

    expect(deleted).toEqual([{ entityType: "note", id: "mine" }]);
  });

  it("never deletes its records during an export either", async () => {
    await dirSync.exportEntities();

    expect(
      deleted.filter(({ entityType }) => entityType === "shared-copy"),
    ).toEqual([]);
  });

  it("does not import a file placed in its folder", async () => {
    mkdirSync(join(testDir, "shared-copy"), { recursive: true });
    writeFileSync(
      join(testDir, "shared-copy", "forged.md"),
      "---\ntitle: Forged\n---\nNot really from a peer.",
    );
    const created = spyOn(entityService, "createEntity");
    const upserted = spyOn(entityService, "upsertEntity");

    const result = await dirSync.importEntities(["shared-copy/forged.md"]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(created).not.toHaveBeenCalled();
    expect(upserted).not.toHaveBeenCalled();
  });
});
