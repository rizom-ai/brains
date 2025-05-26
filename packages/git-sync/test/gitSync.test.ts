import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { GitSync } from "../src/gitSync";
import type { EntityService, BaseEntity, Logger } from "@brains/types";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock logger
const createMockLogger = (): Logger => {
  const logger = {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
    child: mock(() => logger), // Return same logger instance
  };
  return logger as Logger;
};

// Mock entity service
const createMockEntityService = () => {
  const registeredTypes = ["note", "task"];

  return {
    getEntityTypes: mock(() => registeredTypes),
    hasAdapter: mock((type: string) => registeredTypes.includes(type)),
    listEntities: mock(async () => []),
    getAdapter: mock(() => ({
      toMarkdown: mock(
        (entity: BaseEntity) => `# ${entity.title}\n\n${entity.content}`,
      ),
    })),
    importRawEntity: mock(async () => {}),
    getEntity: mock(async () => null),
    createEntity: mock(async () => {}),
    updateEntity: mock(async () => {}),
    deleteEntity: mock(async () => {}),
    search: mock(async () => []),
  } as unknown as EntityService;
};

describe("GitSync", () => {
  let testRepoPath: string;
  let entityService: EntityService;
  let logger: Logger;
  let gitSync: GitSync;

  beforeEach(() => {
    // Create temporary test directory
    testRepoPath = join(tmpdir(), `test-git-sync-${Date.now()}`);
    mkdirSync(testRepoPath, { recursive: true });

    // Create mocks
    entityService = createMockEntityService();
    logger = createMockLogger();

    // Create GitSync instance
    gitSync = new GitSync({
      repoPath: testRepoPath,
      branch: "main",
      autoSync: false,
      entityService,
      logger,
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  test("initialize creates git repository", async () => {
    await gitSync.initialize();

    // Check that .git directory was created
    expect(existsSync(join(testRepoPath, ".git"))).toBe(true);
  });

  test("importFromGit skips files for unregistered entity types", async () => {
    await gitSync.initialize();

    // Create test files
    writeFileSync(join(testRepoPath, "test.md"), "# Root file");
    mkdirSync(join(testRepoPath, "unknown"), { recursive: true });
    writeFileSync(join(testRepoPath, "unknown", "file.md"), "# Unknown type");

    // Run import
    await gitSync.importFromGit();

    // Verify importRawEntity was not called (no registered types in root or unknown)
    expect(entityService.importRawEntity).not.toHaveBeenCalled();

    // Verify that files were skipped (logged at debug level)
    expect(logger.debug).toHaveBeenCalled();
  });

  test("importFromGit imports files from registered entity type directories", async () => {
    await gitSync.initialize();

    // Create test files in registered type directory
    mkdirSync(join(testRepoPath, "note"), { recursive: true });
    writeFileSync(
      join(testRepoPath, "note", "test-note.md"),
      "# Test Note\n\nContent",
    );

    // Create file stats
    const stats = {
      birthtime: new Date("2024-01-01"),
      mtime: new Date("2024-01-02"),
    };

    // Run import
    await gitSync.importFromGit();

    // Verify importRawEntity was called with correct data
    expect(entityService.importRawEntity).toHaveBeenCalledTimes(1);
    const callArgs = (entityService.importRawEntity as any).mock.calls[0][0];
    expect(callArgs.entityType).toBe("note");
    expect(callArgs.id).toBe("test-note");
    expect(callArgs.title).toBe("test note"); // Dashes converted to spaces
    expect(callArgs.content).toBe("# Test Note\n\nContent");
  });

  test("exportToGit creates directories and writes markdown files", async () => {
    await gitSync.initialize();

    // Mock entities to export
    const mockEntities = [
      {
        id: "note-1",
        entityType: "note",
        title: "Test Note",
        content: "Note content",
        tags: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ];

    (entityService.listEntities as any).mockResolvedValue(mockEntities);

    // Run export
    await gitSync.exportToGit();

    // Verify file was created
    const expectedPath = join(testRepoPath, "note", "Test Note.md");
    expect(existsSync(expectedPath)).toBe(true);
  });

  test("getStatus returns repository status", async () => {
    await gitSync.initialize();

    // Create a test file
    writeFileSync(join(testRepoPath, "test.md"), "# Test");

    const status = await gitSync.getStatus();

    expect(status.isRepo).toBe(true);
    expect(status.hasChanges).toBe(true);
    expect(status.files.length).toBeGreaterThan(0);
    // Note: branch name depends on git config, could be "main" or "master"
    expect(["main", "master"]).toContain(status.branch);
  });
});
