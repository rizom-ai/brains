import { describe, expect, it, mock } from "bun:test";
import {
  createServicePluginContext,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  directorySyncConfigSchema,
  type IDirectorySync,
  type IGitSync,
} from "../src/types";
import { DirectorySyncOperationStatusService } from "../src/lib/directory-sync-operation-status";
import { DirectorySyncWorkspaceProvider } from "../src/lib/cms-workspace";
import { createMockDirectorySync, createMockGitSync } from "./fixtures";

const publicActor: CmsWorkspaceActor = {
  interfaceType: "cms",
  userId: "visitor",
  actor: { kind: "user", userId: "visitor" },
  userPermissionLevel: "public",
  visibilityScope: "public",
  isAnchor: false,
};

const adminActor: CmsWorkspaceActor = {
  interfaceType: "cms",
  userId: "operator-1",
  actor: { kind: "user", userId: "operator-1" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

function createProviderContext(): {
  context: ServicePluginContext;
  getRegistration: () => CmsWorkspaceRegistration | undefined;
  enqueue: ReturnType<typeof mock>;
} {
  let registration: CmsWorkspaceRegistration | undefined;
  const enqueue = mock(async () => "sync-job-1");
  const context = createServicePluginContext(
    createMockShell(),
    "directory-sync",
  );
  context.jobs.enqueue = enqueue;
  context.messaging.subscribe<
    CmsWorkspaceRegistration,
    { workspaceUrl: string }
  >("cms:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/sync" },
    };
  });
  return { context, getRegistration: () => registration, enqueue };
}

describe("directory-sync CMS workspace", () => {
  it("registers a safe provider snapshot and resolved management URL", async () => {
    const { context, getRegistration } = createProviderContext();
    const operationStatus = new DirectorySyncOperationStatusService(
      context.runtimeState,
      context.jobs,
      context.logger,
      "/private/runtime/brain-data",
    );
    await operationStatus.initialize();
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

    expect(await provider.registerCmsWorkspace()).toBe(
      "/studio/workspaces/sync",
    );
    const registration = getRegistration();
    expect(registration).toMatchObject({
      id: "directory-sync:sync",
      label: "Sync",
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
      health: "healthy",
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
      view: { title: "Content sync", kicker: "Durability operations" },
    });
    expect(JSON.stringify(rendered)).toContain('"type":"columns"');
    expect(JSON.stringify(rendered)).toContain('"type":"flow"');
    expect(JSON.stringify(rendered)).toContain('"direction":"bidirectional"');
    expect(JSON.stringify(rendered)).toContain('"type":"meters"');
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("/private/runtime");
  });

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
    await provider.registerCmsWorkspace();
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
        source: "cms:operator-1",
        runId: expect.any(String),
        interfaceType: "cms",
        channelId: undefined,
      },
      toolContext: {
        interfaceType: "cms",
        actor: { kind: "user", userId: "operator-1" },
        userPermissionLevel: "admin",
      },
    });
  });
});
