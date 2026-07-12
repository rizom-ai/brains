import { describe, it, expect } from "bun:test";
import { registerMessageHandlers } from "../src/lib/message-handlers";
import type {
  GitStatusSource,
  SyncHandlerSource,
} from "../src/lib/message-handlers";
import { createPluginHarness } from "@brains/plugins/test";
import type { DirectorySyncStatus, GitSyncStatus } from "../src/types";

/**
 * sync:status:request is the cross-plugin status surface consumed by the
 * CMS editor's save-pipeline strip. It must report when the directory last
 * synced and, when git is enabled, whether the working tree has pending
 * changes and what the latest commit is — degrading to git: null when git
 * is unavailable rather than failing the whole status.
 */

interface SyncStatusResponse {
  syncPath: string;
  isInitialized: boolean;
  watchEnabled: boolean;
  lastSync: string | null;
  git: {
    branch: string;
    hasChanges: boolean;
    ahead: number;
    behind: number;
    lastCommit: string | null;
    remote: string | null;
  } | null;
}

function fakeDirectorySync(
  overrides: Partial<DirectorySyncStatus> = {},
): SyncHandlerSource {
  const status: DirectorySyncStatus = {
    syncPath: "/tmp/sync",
    exists: true,
    watching: false,
    files: [],
    stats: { totalFiles: 0, byEntityType: {} },
    ...overrides,
  };
  return {
    getStatus: async () => status,
    exportEntities: async () => ({ exported: 0, failed: 0, errors: [] }),
    importEntities: async () => ({
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    }),
    removeOrphanedEntities: async () => ({ deleted: 0, errors: [] }),
  };
}

function setup(options: {
  directorySync: SyncHandlerSource;
  gitSync?: GitStatusSource;
}): ReturnType<typeof createPluginHarness> {
  const harness = createPluginHarness({ dataDir: "/tmp/test-sync-status" });
  const context = harness.getServiceContext("directory-sync");

  registerMessageHandlers(
    context,
    () => options.directorySync,
    async () => {},
    context.logger,
    undefined,
    () => options.gitSync,
  );

  return harness;
}

describe("sync:status:request message handler", () => {
  it("reports lastSync and the git state when git sync is enabled", async () => {
    const gitStatus: GitSyncStatus = {
      isRepo: true,
      hasChanges: true,
      ahead: 1,
      behind: 0,
      branch: "main",
      lastCommit: "abc1234def5678",
      remote: "origin/main",
      files: [{ path: "post/hello.md", status: "M" }],
    };
    const harness = setup({
      directorySync: fakeDirectorySync({
        lastSync: new Date("2026-07-09T10:00:00.000Z"),
        watching: true,
      }),
      gitSync: { getStatus: async () => gitStatus },
    });

    const result = await harness.sendMessage<
      Record<string, never>,
      SyncStatusResponse
    >("sync:status:request", {});

    expect(result).toBeDefined();
    expect(result?.syncPath).toBe("/tmp/sync");
    expect(result?.isInitialized).toBe(true);
    expect(result?.watchEnabled).toBe(true);
    expect(result?.lastSync).toBe("2026-07-09T10:00:00.000Z");
    expect(result?.git).toEqual({
      branch: "main",
      hasChanges: true,
      ahead: 1,
      behind: 0,
      lastCommit: "abc1234def5678",
      remote: "origin/main",
    });

    harness.reset();
  });

  it("reports git: null when git sync is not enabled", async () => {
    const harness = setup({ directorySync: fakeDirectorySync() });

    const result = await harness.sendMessage<
      Record<string, never>,
      SyncStatusResponse
    >("sync:status:request", {});

    expect(result).toBeDefined();
    expect(result?.git).toBeNull();
    expect(result?.lastSync).toBeNull();

    harness.reset();
  });

  it("degrades git to null when the git status query fails", async () => {
    const harness = setup({
      directorySync: fakeDirectorySync(),
      gitSync: {
        getStatus: async () => {
          throw new Error("git unavailable");
        },
      },
    });

    const result = await harness.sendMessage<
      Record<string, never>,
      SyncStatusResponse
    >("sync:status:request", {});

    expect(result).toBeDefined();
    expect(result?.git).toBeNull();

    harness.reset();
  });

  it("normalises absent commit and remote to null", async () => {
    const gitStatus: GitSyncStatus = {
      isRepo: true,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch: "main",
      files: [],
    };
    const harness = setup({
      directorySync: fakeDirectorySync(),
      gitSync: { getStatus: async () => gitStatus },
    });

    const result = await harness.sendMessage<
      Record<string, never>,
      SyncStatusResponse
    >("sync:status:request", {});

    expect(result?.git).toEqual({
      branch: "main",
      hasChanges: false,
      ahead: 0,
      behind: 0,
      lastCommit: null,
      remote: null,
    });

    harness.reset();
  });
});
