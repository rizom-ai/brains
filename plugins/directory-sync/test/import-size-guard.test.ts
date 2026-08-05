import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createMockAssetsNamespace,
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { DirectorySync } from "../src/lib/directory-sync";
import { FileOperations } from "../src/lib/file-operations";
import { OversizedFileError } from "../src/lib/oversized-file-error";

const LIMIT_BYTES = 8;

describe("directory import size guard", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "directory-import-size-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("allows text files exactly at the configured limit", async () => {
    mkdirSync(join(testDir, "note"), { recursive: true });
    writeFileSync(join(testDir, "note", "exact.md"), "x".repeat(LIMIT_BYTES));
    const service = createMockEntityService({ entityTypes: ["note"] });
    const fileOperations = new FileOperations(
      testDir,
      service,
      createMockAssetsNamespace(),
    );

    const entity = await fileOperations.readEntity(
      "note/exact.md",
      LIMIT_BYTES,
    );

    expect(entity.content).toBe("x".repeat(LIMIT_BYTES));
  });

  it("rejects oversized text before parsing and leaves the file in place", async () => {
    mkdirSync(join(testDir, "note"), { recursive: true });
    const relativePath = "note/oversized.md";
    const absolutePath = join(testDir, relativePath);
    writeFileSync(absolutePath, "x".repeat(LIMIT_BYTES + 1));
    const service = createMockEntityService({ entityTypes: ["note"] });
    const deserialize = spyOn(service, "deserializeEntity");
    const directorySync = new DirectorySync({
      syncPath: testDir,
      maxImportFileBytes: LIMIT_BYTES,
      entityService: service,
      assets: createMockAssetsNamespace(),
      logger: createSilentLogger("oversized-text-import"),
    });

    const result = await directorySync.importEntities([relativePath]);

    expect(result).toMatchObject({
      imported: 0,
      skipped: 1,
      failed: 0,
      issues: [
        {
          path: relativePath,
          message: expect.stringContaining("9 bytes"),
        },
      ],
    });
    expect(deserialize).not.toHaveBeenCalled();
    expect(existsSync(absolutePath)).toBe(true);
  });

  it("allows legacy binary files exactly at the configured limit", async () => {
    mkdirSync(join(testDir, "image"), { recursive: true });
    writeFileSync(
      join(testDir, "image", "exact.png"),
      Buffer.alloc(LIMIT_BYTES),
    );
    const service = createMockEntityService({ entityTypes: ["image"] });
    const fileOperations = new FileOperations(
      testDir,
      service,
      createMockAssetsNamespace(),
    );

    const entity = await fileOperations.readEntity(
      "image/exact.png",
      LIMIT_BYTES,
    );

    expect(entity.content).toBe(
      `data:image/png;base64,${Buffer.alloc(LIMIT_BYTES).toString("base64")}`,
    );
  });

  it("throws a typed error for oversized legacy binary files", async () => {
    mkdirSync(join(testDir, "image"), { recursive: true });
    const relativePath = "image/oversized.png";
    writeFileSync(join(testDir, relativePath), Buffer.alloc(LIMIT_BYTES + 1));
    const service = createMockEntityService({ entityTypes: ["image"] });
    const fileOperations = new FileOperations(
      testDir,
      service,
      createMockAssetsNamespace(),
    );

    try {
      await fileOperations.readEntity(relativePath, LIMIT_BYTES);
      throw new Error("Expected readEntity to reject the oversized file");
    } catch (error) {
      expect(error).toBeInstanceOf(OversizedFileError);
      expect(error).toMatchObject({
        filePath: relativePath,
        sizeBytes: LIMIT_BYTES + 1,
        limitBytes: LIMIT_BYTES,
      });
    }
  });
});
