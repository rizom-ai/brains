import { describe, it, expect, mock, beforeEach } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import type { GitSync } from "../src/lib/git-sync";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

/**
 * Tests for DirectorySync.fullSync() — the unified operation that
 * replaces batch-based sync + separate git tools.
 *
 * fullSync does: pull → import + cleanup → commit + push
 */

function createDirectorySync(tmpDir: string): DirectorySync {
  const entityService = createMockEntityService({
    returns: {
      listEntities: [],
    },
  });
  entityService.serializeEntity = (entity) => entity.content;
  entityService.hasEntityType = () => true;

  return new DirectorySync({
    syncPath: tmpDir,
    autoSync: false,
    entityService,
    logger: createSilentLogger("test"),
  });
}

function createMockGitSync(): {
  gitSync: Pick<
    GitSync,
    "pull" | "commit" | "push" | "hasLocalChanges" | "withLock"
  >;
  pullMock: ReturnType<typeof mock>;
  commitMock: ReturnType<typeof mock>;
  pushMock: ReturnType<typeof mock>;
  hasLocalChangesMock: ReturnType<typeof mock>;
} {
  const pullMock = mock(() =>
    Promise.resolve({ files: [], alreadyUpToDate: true }),
  );
  const commitMock = mock(() => Promise.resolve());
  const pushMock = mock(() => Promise.resolve());
  const hasLocalChangesMock = mock(() => Promise.resolve(true));

  return {
    gitSync: {
      pull: pullMock,
      commit: commitMock,
      push: pushMock,
      hasLocalChanges: hasLocalChangesMock,
      withLock: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    },
    pullMock,
    commitMock,
    pushMock,
    hasLocalChangesMock,
  };
}

describe("DirectorySync.fullSync", () => {
  let tmpDir: string;
  let directorySync: DirectorySync;

  beforeEach(async () => {
    tmpDir = await import("fs/promises").then((fs) =>
      fs.mkdtemp("/tmp/fullsync-test-"),
    );
    directorySync = createDirectorySync(tmpDir);
    await directorySync.initializeDirectory();
  });

  it("should exist as a method on DirectorySync", () => {
    expect(typeof directorySync.fullSync).toBe("function");
  });

  it("should return imported count and git status", async () => {
    const result = await directorySync.fullSync();

    expect(result).toHaveProperty("imported");
    expect(result).toHaveProperty("gitPulled");
    expect(result).toHaveProperty("gitPushed");
    expect(typeof result.imported).toBe("number");
  });

  it("should pull before syncing when git is provided", async () => {
    const { gitSync, pullMock } = createMockGitSync();

    await directorySync.fullSync(gitSync as unknown as GitSync);

    expect(pullMock).toHaveBeenCalledTimes(1);
  });

  it("should commit+push after sync when git has local changes", async () => {
    const { gitSync, commitMock, pushMock, hasLocalChangesMock } =
      createMockGitSync();
    hasLocalChangesMock.mockResolvedValue(true);

    await directorySync.fullSync(gitSync as unknown as GitSync);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("should skip commit+push when no local changes", async () => {
    const { gitSync, commitMock, pushMock, hasLocalChangesMock } =
      createMockGitSync();
    hasLocalChangesMock.mockResolvedValue(false);

    await directorySync.fullSync(gitSync as unknown as GitSync);

    expect(commitMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("should skip all git operations when no gitSync provided", async () => {
    const result = await directorySync.fullSync();

    expect(result.gitPulled).toBe(false);
    expect(result.gitPushed).toBe(false);
  });

  it("should call operations in correct order", async () => {
    const order: string[] = [];
    const { gitSync, pullMock, commitMock, pushMock, hasLocalChangesMock } =
      createMockGitSync();

    pullMock.mockImplementation(async () => {
      order.push("pull");
      return { files: [], alreadyUpToDate: true };
    });
    hasLocalChangesMock.mockImplementation(async () => {
      order.push("hasLocalChanges");
      return true;
    });
    commitMock.mockImplementation(async () => {
      order.push("commit");
    });
    pushMock.mockImplementation(async () => {
      order.push("push");
    });

    // Spy on sync by checking order after
    const origSync = directorySync.sync.bind(directorySync);
    directorySync.sync = async () => {
      order.push("sync");
      return origSync();
    };

    await directorySync.fullSync(gitSync as unknown as GitSync);

    expect(order).toEqual([
      "pull",
      "sync",
      "hasLocalChanges",
      "commit",
      "push",
    ]);
  });
});
