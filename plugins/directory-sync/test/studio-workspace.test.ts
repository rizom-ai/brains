import { describe, expect, it, mock } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import {
  directorySyncConfigSchema,
  type IDirectorySync,
  type IGitSync,
} from "../src/types";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";
import {
  DirectorySyncWorkspaceProvider,
  directorySyncWorkspace,
  syncNowAction,
} from "../src/lib/studio-workspace";
import type { DirectorySyncHost } from "../src/host";
import { createMockDirectorySync, createMockGitSync } from "./fixtures";
import { hostFor } from "./helpers/install";

async function statusFor(
  host: DirectorySyncHost,
  syncPath: string,
): Promise<DirectorySyncOperationStatusService> {
  const status = new DirectorySyncOperationStatusService(
    { scoped: host.state },
    host.jobs,
    host.logger,
    syncPath,
  );
  await status.initialize();
  return status;
}

/**
 * The sync workspace: directory-sync owns the data and the one action, and
 * declares both for Studio to host. The runtime registers the declaration
 * and gates it on the admin permission it names.
 */
describe("directory-sync Studio workspace", () => {
  it("is declared for admins, with one action", () => {
    expect(directorySyncWorkspace).toMatchObject({
      id: "sync",
      label: "Content sync",
      permission: "admin",
    });
    expect(directorySyncWorkspace.actions.map((action) => action.name)).toEqual(
      ["sync-now"],
    );
    expect(syncNowAction).toMatchObject({
      name: "sync-now",
      permission: "admin",
    });
  });

  it("builds a safe snapshot: no secrets, no private paths", async () => {
    const host = await hostFor(createMockShell());
    const operationStatus = await statusFor(
      host,
      "/private/runtime/brain-data",
    );
    await operationStatus.recordIssue({
      kind: "import",
      path: "note/broken.md",
      message: "Frontmatter is invalid",
    });
    const directorySync = createMockDirectorySync({
      getStatus: mock(async () => ({
        syncPath: "/private/runtime/brain-data",
        exists: true,
        watching: true,
        lastSync: new Date("2026-07-16T10:00:00.000Z"),
        files: [],
        stats: { totalFiles: 3, byEntityType: { note: 2, post: 1 } },
      })),
    });
    const gitSync = createMockGitSync({
      getStatus: mock(async () => ({
        isRepo: true,
        hasChanges: true,
        ahead: 1,
        behind: 0,
        branch: "main",
        lastCommit: "abcdef123456",
        remote: "https://operator:secret@example.com/org/repo.git",
        files: [{ path: "note/one.md", status: " M" }],
      })),
    });
    const provider = new DirectorySyncWorkspaceProvider({
      host,
      config: directorySyncConfigSchema.parse({
        autoSync: true,
        initialSync: false,
        git: { gitUrl: "https://operator:secret@example.com/org/repo.git" },
      }),
      getDirectorySync: (): IDirectorySync => directorySync,
      getGitSync: (): IGitSync => gitSync,
      operationStatus,
    });

    const snapshot = await provider.getSnapshot();

    expect(snapshot).toMatchObject({
      health: "attention",
      directory: { displayPath: "brain-data", watching: true, totalFiles: 3 },
      git: {
        branch: "main",
        remoteLabel: "example.com/org/repo",
        changedFiles: [{ path: "note/one.md", status: "M" }],
      },
    });
    expect(snapshot.issues).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("/private/runtime");
  });

  it("files Sync now as the person who asked, through the shared request", async () => {
    const enqueue = mock(async () => ({
      id: "sync-job-1",
      status: async (): Promise<null> => null,
    }));
    const base = await hostFor(createMockShell());
    const host = { ...base, jobs: { ...base.jobs, enqueue } };
    const operationStatus = await statusFor(host, "/tmp/brain-data");
    const provider = new DirectorySyncWorkspaceProvider({
      host,
      config: directorySyncConfigSchema.parse({
        autoSync: false,
        initialSync: false,
        git: { repo: "org/repo" },
      }),
      getDirectorySync: (): IDirectorySync => createMockDirectorySync(),
      getGitSync: (): IGitSync => createMockGitSync(),
      operationStatus,
    });

    const result = await provider.syncNow({ actor: { id: "operator-1" } });

    expect(result).toMatchObject({
      accepted: true,
      status: "queued",
      jobId: "sync-job-1",
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sync-request" }),
      expect.objectContaining({
        source: "studio:operator-1",
        interfaceType: "studio",
      }),
    );
  });

  it("refuses a sync nobody is signed in for", async () => {
    const host = await hostFor(createMockShell());
    const provider = new DirectorySyncWorkspaceProvider({
      host,
      config: directorySyncConfigSchema.parse({
        autoSync: false,
        initialSync: false,
      }),
      getDirectorySync: (): IDirectorySync => createMockDirectorySync(),
      getGitSync: (): IGitSync | undefined => undefined,
      operationStatus: await statusFor(host, "/tmp/brain-data"),
    });

    expect(provider.syncNow(null)).rejects.toThrow(
      "Directory sync requires an authenticated caller",
    );
  });
});
