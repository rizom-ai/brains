import { describe, it, expect } from "bun:test";
import { directorySyncPathResponseSchema } from "@brains/contracts";
import { registerMessageHandlers } from "../src/lib/message-handlers";
import type {
  GitStatusSource,
  SyncHandlerSource,
} from "../src/lib/message-handlers";
import { createPluginHarness } from "@brains/plugins/test";
import type { DirectorySyncStatus, GitSyncStatus } from "../src/types";

/**
 * sync:status:request is the cross-plugin status surface consumed by the
 * Studio editor's save-pipeline strip. It must report when the directory last
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

describe("sync:path:request placement preview", () => {
  it("accepts an older placement response without an admission verdict", () => {
    expect(
      directorySyncPathResponseSchema.parse({
        relativePath: "intro.md",
        leaf: null,
      }),
    ).toEqual({ relativePath: "intro.md", leaf: null });
  });
  it.each([
    ["note", "book:intro", { entityType: "book", id: "intro" }, false],
    ["note", "intro", { entityType: "note", id: "intro" }, true],
    [
      "site-content",
      "site-content:home:hero",
      { entityType: "site-content", id: "site-content:home:hero" },
      true,
    ],
    [
      "section",
      "home::hero",
      { entityType: "section", id: "home:hero" },
      false,
    ],
  ])(
    "returns a pure verdict for %s/%s without registered types",
    async (entityType, entityId, owner, writable) => {
      const harness = setup({ directorySync: fakeDirectorySync() });
      try {
        expect(
          await harness.sendMessage("sync:path:request", {
            entityType,
            entityId,
            metadata: {},
            content: "",
          }),
        ).toMatchObject({ owner, writable });
      } finally {
        await harness.reset();
      }
    },
  );
  it("identifies the new filename segment without confusing it with the extension", async () => {
    const harness = setup({ directorySync: fakeDirectorySync() });
    try {
      const result = await harness.sendMessage("sync:path:request", {
        entityType: "note",
        entityId: "book:.md",
        metadata: {},
        content: "",
      });
      expect(result).toEqual({
        relativePath: "book/.md.md",
        leaf: { start: 5, end: 8 },
        owner: { entityType: "book", id: ".md" },
        writable: false,
      });
    } finally {
      await harness.reset();
    }
  });
  it.each([
    ["note", "intro", {}, "intro.md"],
    ["note", "book:intro", {}, "book/intro.md"],
    [
      "book-section",
      "book-1:part-1:chapter-2",
      {},
      "book-section/book-1/part-1/chapter-2.md",
    ],
    [
      "book-section",
      "book-section:intro",
      {},
      "book-section/book-section/intro.md",
    ],
    ["document", "book:chapter", {}, "document/book/chapter.pdf"],
    ["image", "book:cover", { format: "png" }, "image/book/cover.png"],
  ])(
    "previews %s/%s through directory-sync's existing placement rules",
    async (entityType, entityId, metadata, relativePath) => {
      const harness = setup({ directorySync: fakeDirectorySync() });
      try {
        const result = await harness.sendMessage<
          unknown,
          { relativePath: string }
        >("sync:path:request", { entityType, entityId, metadata, content: "" });
        expect(result).toMatchObject({ relativePath });
      } finally {
        await harness.reset();
      }
    },
  );
});

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

    await harness.reset();
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

    await harness.reset();
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

    await harness.reset();
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

    await harness.reset();
  });
});
