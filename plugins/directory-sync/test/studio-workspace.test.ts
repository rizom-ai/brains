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
    await operationStatus.recordIssue({
      kind: "import",
      path: "note/another.md",
      message: "Required title is missing",
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
    expect(snapshot.issues).toHaveLength(2);
    const rendered = directorySyncWorkspace.view({ data: snapshot });
    expect(rendered).toMatchObject({
      title: "Content sync",
      kicker: "Durability operations",
      primaryAction: { action: syncNowAction, input: {} },
    });
    const serialized = JSON.stringify(rendered);
    expect(serialized).not.toContain('"id":"sync-now"');
    expect(serialized).toContain('"type":"columns"');
    expect(serialized).not.toContain('"type":"flow"');
    expect(serialized).toContain('"label":"Connection"');
    expect(serialized).toContain('"label":"Recent runs"');
    expect(serialized).toContain('"presentation":"disclosure"');
    expect(serialized).toContain('"presentation":"editorial"');
    expect(serialized).toContain('"details":[');
    expect(serialized).toContain('"id":"sync-repository-facts"');
    expect(serialized.match(/"label":"Content files"/g)).toHaveLength(1);
    expect(serialized.match(/"label":"Issues"/g)).toHaveLength(1);
    expect(serialized).toContain('"description":"Modified"');
    expect(serialized).toContain("Git status: M · working tree");
    expect(serialized).toContain('"label":"Branch","value":"main"');
    expect(serialized.indexOf('"id":"sync-issues-import"')).toBeLessThan(
      serialized.indexOf('"id":"recent-runs"'),
    );
    expect(serialized).not.toContain('"type":"meters"');
    expect(serialized).not.toContain('"type":"stats"');
    const issue = snapshot.issues[0];
    if (!issue) throw new Error("Expected a rendered sync issue");
    expect(serialized).toContain(`Path: ${issue.path}`);
    expect(serialized).toContain(`Occurred: ${issue.occurredAt}`);
    expect(serialized.match(/Content import needs attention/g)).toHaveLength(1);
    expect(serialized).toContain("2 recorded issues");
    expect(serialized).toContain("Frontmatter is invalid");
    expect(serialized).toContain("Required title is missing");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("/private/runtime");

    const runId = await operationStatus.startRun("manual", "pulling");
    if (!runId) throw new Error("Run did not start");
    expect(
      directorySyncWorkspace.view({ data: await provider.getSnapshot() }),
    ).toMatchObject({
      primaryAction: { action: syncNowAction, disabled: true },
    });
    await operationStatus.clearRun(runId);
    expect(
      directorySyncWorkspace.view({ data: await provider.getSnapshot() }),
    ).toMatchObject({
      primaryAction: { disabled: false },
    });
  });

  for (const count of [0, 20, 21]) {
    it(`reports ${count} working-tree files without implying a partial list is complete`, async () => {
      const host = await hostFor(createMockShell());
      const git = createMockGitSync({
        getStatus: async () => ({
          isRepo: true,
          hasChanges: count > 0,
          branch: "main",
          ahead: 0,
          behind: 0,
          files: Array.from({ length: count }, (_, index) => ({
            path: `note/${index}.md`,
            status: index === 0 ? "??" : "AM",
          })),
        }),
      });
      const provider = new DirectorySyncWorkspaceProvider({
        host,
        config: directorySyncConfigSchema.parse({ initialSync: false }),
        operationStatus: await statusFor(host, "/tmp/brain-data"),
        getDirectorySync: (): IDirectorySync => createMockDirectorySync(),
        getGitSync: (): IGitSync => git,
      });
      const view = directorySyncWorkspace.view({
        data: await provider.getSnapshot(),
      });
      expect(view).toMatchObject({
        blocks: [
          {
            type: "columns",
            primary: [
              { id: "recent-runs-section" },
              {
                id: "changed-files-section",
                metadata: [
                  `${Math.min(count, 20)} ${count > 20 ? "shown" : "in working tree"}`,
                ],
                blocks: [
                  {
                    id: "changed-files",
                    empty: "No changed files.",
                    items: Array.from(
                      { length: Math.min(count, 20) },
                      (_, index) => ({
                        title: `note/${index}.md`,
                        description:
                          index === 0 ? "Untracked" : "Working-tree change",
                        metadata: [
                          `Git status: ${index === 0 ? "??" : "AM"} · working tree`,
                        ],
                      }),
                    ),
                  },
                  ...(count > 20
                    ? [
                        {
                          id: "changed-files-remainder",
                          text: "Showing the first 20 changed files. Additional working-tree changes are not shown.",
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
        ],
      });
      const serialized = JSON.stringify(view);
      expect(serialized).toContain('"label":"Remote","value":"Not supplied"');
      expect(serialized.includes('"id":"changed-files-remainder"')).toBe(
        count > 20,
      );
      expect(serialized).not.toContain('"title":"note/20.md"');
    });
  }

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
