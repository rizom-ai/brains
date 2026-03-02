import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BaseEntity } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

describe("Import Path Validation", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-import-path-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    mockEntityService = createMockEntityService({
      entityTypes: ["post", "base"],
    });

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );

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

  it("should skip paths from unregistered entity type directories", async () => {
    // _obsidian is not a registered entity type
    const result = await dirSync.importEntities([
      "_obsidian/bases/Notes.base",
      "_obsidian/bases/Settings.base",
    ]);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("should skip git rename-format paths", async () => {
    const result = await dirSync.importEntities([
      "_obsidian/fileClasses/{base.md => base.md.invalid}",
      "anchor-profile/{anchor-profile.md => anchor-profile.md.invalid}",
    ]);
    expect(result.failed).toBe(0);
  });

  it("should still import valid entity paths", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "post", "hello.md"),
      "---\ntitle: hello\n---\n",
    );

    const result = await dirSync.importEntities(["post/hello.md"]);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("should handle a mix of valid and invalid paths", async () => {
    mkdirSync(join(testDir, "post"), { recursive: true });
    writeFileSync(
      join(testDir, "post", "hello.md"),
      "---\ntitle: hello\n---\n",
    );

    const result = await dirSync.importEntities([
      "post/hello.md",
      "_obsidian/bases/Notes.base",
      "{old.md => old.md.invalid}",
    ]);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });
});
