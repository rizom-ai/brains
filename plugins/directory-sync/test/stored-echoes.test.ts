import { createMockEntityService } from "@brains/entity-service/test";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BaseEntity } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { TINY_PDF_BYTES } from "./fixtures";

/**
 * A brain's own exports come back through Git: auto-sync commits them, and
 * the next pull's delta since the checkpoint lists them as changed. A file
 * whose bytes hash to the stored entity's contentHash is that export, and
 * importing it again is a job that can only skip.
 */
describe("DirectorySync.withoutStoredEchoes", () => {
  let testDir: string;
  let dirSync: DirectorySync;
  const stored = new Map<string, string>();

  const store = (entityType: string, id: string, content: string): void => {
    stored.set(`${entityType}:${id}`, computeContentHash(content));
  };

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "test-stored-echoes-"));
    mkdirSync(join(testDir, "note"), { recursive: true });
    mkdirSync(join(testDir, "document"), { recursive: true });
    stored.clear();
    const entityService = createMockEntityService({
      entityTypes: ["note", "document"],
    });
    entityService.getEntityWriteSnapshot = async (request: {
      entityType: string;
      id: string;
    }): Promise<{ entity: BaseEntity; revision: string } | null> => {
      const contentHash = stored.get(`${request.entityType}:${request.id}`);
      return contentHash
        ? {
            entity: {
              id: request.id,
              entityType: request.entityType,
              content: "",
              contentHash,
              visibility: "public",
              metadata: {},
              created: new Date(0).toISOString(),
              updated: new Date(0).toISOString(),
            },
            revision: "r1",
          }
        : null;
    };
    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("drops a file whose bytes are the stored entity's export", async () => {
    writeFileSync(join(testDir, "note", "own.md"), "exported by the brain\n");
    store("note", "own", "exported by the brain\n");

    expect(await dirSync.withoutStoredEchoes(["note/own.md"])).toEqual([]);
  });

  it("keeps a file that differs from the stored entity", async () => {
    writeFileSync(join(testDir, "note", "edited.md"), "edited on GitHub\n");
    store("note", "edited", "what the brain last wrote\n");

    expect(await dirSync.withoutStoredEchoes(["note/edited.md"])).toEqual([
      "note/edited.md",
    ]);
  });

  it("keeps what it cannot confirm: new, deleted and binary files", async () => {
    writeFileSync(join(testDir, "note", "new.md"), "no entity yet\n");
    writeFileSync(join(testDir, "document", "paper.pdf"), TINY_PDF_BYTES);
    store("document", "paper", "not comparable to bytes\n");

    expect(
      await dirSync.withoutStoredEchoes([
        "note/new.md",
        "note/deleted.md",
        "document/paper.pdf",
      ]),
    ).toEqual(["note/new.md", "note/deleted.md", "document/paper.pdf"]);
  });
});

/**
 * While plugins register, a type composed after directory-sync is not
 * registered yet, so its stored entity cannot be read back. Its file is kept
 * for the import to decide, without reading the entity.
 */
describe("DirectorySync.withoutStoredEchoes for an unregistered type", () => {
  let testDir: string;

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("keeps the file without reading its stored entity", async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-stored-echoes-unregistered-"));
    mkdirSync(join(testDir, "widget"), { recursive: true });
    writeFileSync(join(testDir, "widget", "legacy.md"), "Widget v2\n");
    const entityService = createMockEntityService({ entityTypes: ["note"] });
    const reads: string[] = [];
    entityService.getEntityWriteSnapshot = async (request: {
      entityType: string;
      id: string;
    }): Promise<null> => {
      reads.push(`${request.entityType}/${request.id}`);
      throw new Error(
        `Unknown entity type ${request.entityType}: no adapter registered`,
      );
    };
    const dirSync = new DirectorySync({
      syncPath: testDir,
      entityService,
      logger: createSilentLogger("test"),
    });

    expect(await dirSync.withoutStoredEchoes(["widget/legacy.md"])).toEqual([
      "widget/legacy.md",
    ]);
    expect(reads).toEqual([]);
  });
});
