import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

/**
 * Regression tests for the git-sync race condition where files are read
 * while git is mid-write, resulting in empty or truncated content.
 *
 * Bug: Files with valid frontmatter (title, status, etc.) were quarantined
 * with "Required" validation errors because readEntity read them while
 * git pull was rewriting them, getting empty content. The Zod validation
 * then correctly reported the fields as undefined — but the file itself
 * was valid, just transiently empty during the git operation.
 *
 * Fix: Skip files with empty/whitespace-only content instead of
 * attempting deserialization. These are transient states, not invalid files.
 */
describe("Empty content race condition", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-empty-race-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    mockEntityService = createMockEntityService({
      entityTypes: ["deck", "note", "post"],
    });

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(() => ({
      metadata: {},
    }));

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

  it("should NOT quarantine empty files (git mid-write race)", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    const filePath = join(testDir, "deck", "tutorial.md");
    // Simulate git mid-write: file exists but is empty
    writeFileSync(filePath, "");

    const result = await dirSync.importEntities(["deck/tutorial.md"]);

    // File must NOT be quarantined — it's a transient state
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should NOT quarantine whitespace-only files", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    const filePath = join(testDir, "deck", "2025.md");
    writeFileSync(filePath, "   \n  \n  ");

    const result = await dirSync.importEntities(["deck/2025.md"]);

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should NOT quarantine files with only frontmatter delimiters (truncated write)", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    const filePath = join(testDir, "deck", "cococo.md");
    // Git wrote the opening delimiter but nothing else yet
    writeFileSync(filePath, "---\n");

    const result = await dirSync.importEntities(["deck/cococo.md"]);

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should NOT quarantine files with empty frontmatter (no fields written yet)", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    const filePath = join(testDir, "deck", "declaration.md");
    // Git wrote delimiters but no fields yet
    writeFileSync(filePath, "---\n---\n");

    const result = await dirSync.importEntities(["deck/declaration.md"]);

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.invalid`)).toBe(false);
    expect(result.quarantined).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should still import files with valid content", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    const filePath = join(testDir, "deck", "good.md");
    writeFileSync(
      filePath,
      "---\ntitle: Good Deck\nstatus: published\n---\n# Content\n",
    );

    const result = await dirSync.importEntities(["deck/good.md"]);

    expect(result.imported).toBe(1);
    expect(result.quarantined).toBe(0);
    expect(existsSync(filePath)).toBe(true);
  });

  it("should handle mix of empty and valid files during git pull", async () => {
    mkdirSync(join(testDir, "deck"), { recursive: true });
    mkdirSync(join(testDir, "note"), { recursive: true });

    const emptyFile = join(testDir, "deck", "being-written.md");
    const validFile = join(testDir, "note", "already-done.md");

    writeFileSync(emptyFile, "");
    writeFileSync(validFile, "---\ntitle: Done\n---\nContent\n");

    const result = await dirSync.importEntities([
      "deck/being-written.md",
      "note/already-done.md",
    ]);

    // Empty file skipped, valid file imported
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.quarantined).toBe(0);
    expect(existsSync(emptyFile)).toBe(true);
    expect(existsSync(validFile)).toBe(true);
  });
});
