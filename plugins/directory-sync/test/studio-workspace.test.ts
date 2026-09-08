import { describe, expect, it, mock } from "bun:test";
import {
  createServicePluginContext,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  directorySyncConfigSchema,
  type IDirectorySync,
  type IGitSync,
} from "../src/types";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";
import { DirectorySyncWorkspaceProvider } from "../src/lib/studio-workspace";
import { createMockDirectorySync, createMockGitSync } from "./fixtures";

const publicActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "visitor",
  actor: { kind: "user", userId: "visitor" },
  userPermissionLevel: "public",
  visibilityScope: "public",
  isAnchor: false,
};

const adminActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "operator-1",
  actor: { kind: "user", userId: "operator-1" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

function createProviderContext(): {
  context: ServicePluginContext;
  getRegistration: () => StudioWorkspaceRegistration | undefined;
  enqueue: ReturnType<typeof mock>;
} {
  let registration: StudioWorkspaceRegistration | undefined;
  const enqueue = mock(async () => "sync-job-1");
  const context = createServicePluginContext(
    createMockShell(),
    "directory-sync",
  );
  context.jobs.enqueue = enqueue;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/sync" },
    };
  });
  return { context, getRegistration: () => registration, enqueue };
}

describe("directory-sync Studio workspace", () => {
  it("registers a safe provider snapshot and resolved management URL", async () => {
    const { context, getRegistration } = createProviderContext();
    const operationStatus = new DirectorySyncOperationStatusService(
      context.runtimeState,
      context.jobs,
      context.logger,
      "/private/runtime/brain-data",
    );
    await operationStatus.initialize();
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
    const config = directorySyncConfigSchema.parse({
      autoSync: true,
      initialSync: false,
      git: {
        gitUrl: "https://operator:secret@example.com/org/repo.git",
      },
    });
    const provider = new DirectorySyncWorkspaceProvider({
      context,
      config,
      getDirectorySync: (): IDirectorySync => directorySync,
      getGitSync: (): IGitSync => gitSync,
      operationStatus,
    });

    expect(await provider.registerStudioWorkspace()).toBe(
      "/studio/workspaces/sync",
    );
    const registration = getRegistration();
    expect(registration).toMatchObject({
      id: "directory-sync:sync",
      label: "Content sync",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 50,
    });
    if (!registration) throw new Error("Workspace was not registered");

    expect(await Promise.resolve(registration.accessHandler(publicActor))).toBe(
      false,
    );
    expect(await Promise.resolve(registration.accessHandler(adminActor))).toBe(
      true,
    );
    expect(registration.dataProvider(publicActor)).rejects.toThrow(
      "admission policy",
    );
    const snapshot = await provider.getSnapshot();
    expect(snapshot).toMatchObject({
      health: "attention",
      directory: {
        displayPath: "brain-data",
        watching: true,
        totalFiles: 3,
      },
      git: {
        branch: "main",
        remoteLabel: "example.com/org/repo",
        changedFiles: [{ path: "note/one.md", status: "M" }],
      },
    });
    const rendered = await registration.dataProvider(adminActor);
    expect(rendered).toMatchObject({
      view: {
        title: "Content sync",
        kicker: "Durability operations",
        primaryAction: { actionId: "sync-now", label: "Sync now", input: {} },
      },
    });
    expect(JSON.stringify(rendered)).not.toContain('"id":"sync-now"');
    expect(JSON.stringify(rendered)).toContain('"type":"columns"');
    expect(JSON.stringify(rendered)).not.toContain('"type":"flow"');
    expect(JSON.stringify(rendered)).toContain('"label":"Connection"');
    expect(JSON.stringify(rendered)).toContain('"label":"Recent runs"');
    expect(JSON.stringify(rendered)).toContain('"presentation":"disclosure"');
    expect(JSON.stringify(rendered)).toContain('"presentation":"editorial"');
    expect(JSON.stringify(rendered)).toContain('"details":[');
    expect(JSON.stringify(rendered)).toContain('"id":"sync-repository-facts"');
    expect(
      JSON.stringify(rendered).match(/"label":"Content files"/g),
    ).toHaveLength(1);
    expect(JSON.stringify(rendered).match(/"label":"Issues"/g)).toHaveLength(1);
    expect(JSON.stringify(rendered)).toContain(
      `"label":"Commit debounce","value":"${config.commitDebounce} ms"`,
    );
    expect(JSON.stringify(rendered)).toContain('"description":"Modified"');
    expect(JSON.stringify(rendered)).toContain("Git status: M · working tree");
    expect(JSON.stringify(rendered)).toContain(
      '"label":"Branch","value":"main"',
    );
    expect(
      JSON.stringify(rendered).indexOf('"id":"sync-issues-import"'),
    ).toBeLessThan(JSON.stringify(rendered).indexOf('"id":"recent-runs"'));
    expect(JSON.stringify(rendered)).not.toContain('"type":"meters"');
    expect(JSON.stringify(rendered)).not.toContain('"type":"stats"');
    const issue = snapshot.issues[0];
    if (!issue) throw new Error("Expected a rendered sync issue");
    expect(JSON.stringify(rendered)).toContain(`Path: ${issue.path}`);
    expect(JSON.stringify(rendered)).toContain(`Occurred: ${issue.occurredAt}`);
    expect(
      JSON.stringify(rendered).match(/Content import needs attention/g),
    ).toHaveLength(1);
    expect(JSON.stringify(rendered)).toContain("2 recorded issues");
    expect(JSON.stringify(rendered)).toContain("Frontmatter is invalid");
    expect(JSON.stringify(rendered)).toContain("Required title is missing");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("/private/runtime");

    const runId = await operationStatus.startRun("manual", "pulling");
    if (!runId) throw new Error("Run did not start");
    expect(await registration.dataProvider(adminActor)).toMatchObject({
      view: { primaryAction: { actionId: "sync-now", disabled: true } },
    });
    await operationStatus.clearRun(runId);
    expect(await registration.dataProvider(adminActor)).not.toHaveProperty(
      "view.primaryAction.disabled",
    );
  });

  for (const count of [0, 20, 21]) {
    it(`reports ${count} working-tree files without implying a partial list is complete`, async () => {
      const { context, getRegistration } = createProviderContext();
      const operationStatus = new DirectorySyncOperationStatusService(
        context.runtimeState,
        context.jobs,
        context.logger,
        "/tmp/brain-data",
      );
      await operationStatus.initialize();
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
        context,
        config: directorySyncConfigSchema.parse({ initialSync: false }),
        operationStatus,
        getDirectorySync: (): IDirectorySync => createMockDirectorySync(),
        getGitSync: (): IGitSync => git,
      });
      await provider.registerStudioWorkspace();
      const registration = getRegistration();
      if (!registration) throw new Error("Missing sync workspace");
      const rendered = await registration.dataProvider(adminActor);
      const serialized = JSON.stringify(rendered);
      expect(rendered).toMatchObject({
        view: {
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
        },
      });
      expect(serialized).toContain('"label":"Remote","value":"Not supplied"');
      expect(serialized.includes('"id":"changed-files-remainder"')).toBe(
        count > 20,
      );
      expect(serialized).not.toContain('"title":"note/20.md"');
    });
  }

  it("routes Sync now through the shared queued request and enforces admin permission", async () => {
    const { context, getRegistration, enqueue } = createProviderContext();
    const operationStatus = new DirectorySyncOperationStatusService(
      context.runtimeState,
      context.jobs,
      context.logger,
      "/tmp/brain-data",
    );
    await operationStatus.initialize();
    const provider = new DirectorySyncWorkspaceProvider({
      context,
      config: directorySyncConfigSchema.parse({
        autoSync: false,
        initialSync: false,
        git: { repo: "org/repo" },
      }),
      getDirectorySync: (): IDirectorySync => createMockDirectorySync(),
      getGitSync: (): IGitSync => createMockGitSync(),
      operationStatus,
    });
    await provider.registerStudioWorkspace();
    const registration = getRegistration();
    if (!registration?.actionHandler) {
      throw new Error("Workspace action handler was not registered");
    }

    expect(
      registration.actionHandler(
        { actionId: "sync-now", input: {} },
        publicActor,
      ),
    ).rejects.toThrow("admission policy");

    const result = await registration.actionHandler(
      { actionId: "sync-now", input: {} },
      adminActor,
    );
    expect(result).toMatchObject({
      accepted: true,
      status: "queued",
      jobId: "sync-job-1",
    });
    expect(enqueue).toHaveBeenCalledWith({
      type: "sync-request",
      data: {
        source: "studio:operator-1",
        runId: expect.any(String),
        interfaceType: "studio",
        channelId: undefined,
      },
      toolContext: {
        interfaceType: "studio",
        actor: { kind: "user", userId: "operator-1" },
        userPermissionLevel: "admin",
      },
    });
  });
});
