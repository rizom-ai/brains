import { createMockShell } from "@brains/plugins/test";
import {
  createServicePluginContext,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { directorySyncConfigSchema } from "../../plugins/directory-sync/src/types";
import { DirectorySyncOperationStatusService } from "../../plugins/directory-sync/src/lib/directory-sync-operation-status";
import {
  DirectorySyncWorkspaceProvider,
  type DirectorySyncWorkspaceSnapshot,
} from "../../plugins/directory-sync/src/lib/studio-workspace";

import type { StudioStudyState } from "./studio-study-state";

/** Seed status records, never a parallel implementation of the workspace view. */
export async function createSyncViewFixture(
  state?: StudioStudyState,
): Promise<() => Promise<unknown>> {
  const context = createServicePluginContext(
    createMockShell(),
    "directory-sync",
  );
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "visual-admin",
    actor: { kind: "user", userId: "visual-admin" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  let registration: StudioWorkspaceRegistration | undefined;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/directory-sync:sync" },
    };
  });
  class FixtureSyncProvider extends DirectorySyncWorkspaceProvider {
    override async getSnapshot(): Promise<DirectorySyncWorkspaceSnapshot> {
      const snapshot: DirectorySyncWorkspaceSnapshot = {
        health: "attention",
        directory: {
          displayPath: "brain-data",
          exists: true,
          watching: true,
          totalFiles: 42,
          byEntityType: { note: 30, post: 12 },
          lastSettledAt: "2026-07-11T09:15:00.000Z",
        },
        git: {
          branch: "main",
          remoteLabel: "example.com/rover/brain-data",
          lastCommit: "abcdef123456",
          hasChanges: true,
          ahead: 1,
          behind: 1,
          changedFiles: [{ path: "notes/shared-tools.md", status: "M" }],
          changedFilesTruncated: false,
        },
        automation: {
          autoSync: true,
          watchIntervalMs: 1000,
          remoteIntervalMinutes: 5,
          commitDebounceMs: 2000,
          deleteOnFileRemoval: false,
        },
        recentRuns: [
          {
            id: "manual-run",
            source: "manual",
            outcome: "failed",
            summary: "The remote rejected the push.",
            startedAt: "2026-07-11T09:14:30.000Z",
            completedAt: "2026-07-11T09:15:00.000Z",
            imported: 12,
            exported: 4,
            skipped: 0,
            failed: 1,
            quarantined: 0,
          },
          {
            id: "watch-run",
            source: "watcher",
            outcome: "succeeded",
            summary: "Imported changed files and exported current entities.",
            startedAt: "2026-07-11T09:13:30.000Z",
            completedAt: "2026-07-11T09:14:00.000Z",
            imported: 2,
            exported: 1,
            skipped: 0,
            failed: 0,
            quarantined: 0,
          },
        ],
        issues: [
          {
            id: "push-issue",
            kind: "git",
            occurredAt: "2026-07-11T09:15:00.000Z",
            message:
              "git push origin main exited with 1: the remote rejected the push.",
          },
          {
            id: "pull-issue",
            kind: "git",
            occurredAt: "2026-07-11T09:14:30.000Z",
            message:
              "git pull origin main exited with 1: the remote could not be reached.",
          },
        ],
      };
      if (state === "empty")
        return {
          ...snapshot,
          health: "healthy",
          directory: { ...snapshot.directory, lastSettledAt: undefined },
          recentRuns: [],
          issues: [],
          git: snapshot.git
            ? {
                ...snapshot.git,
                hasChanges: false,
                ahead: 0,
                behind: 0,
                changedFiles: [],
              }
            : null,
        };
      if (state === "dense")
        return {
          ...snapshot,
          issues: [
            ...snapshot.issues,
            {
              id: "dense-path",
              kind: "git",
              occurredAt: "2026-07-11T09:15:01.000Z",
              message:
                "Exact retained diagnostic: " +
                "nested-path/".repeat(28) +
                "document.md",
            },
          ],
          git: snapshot.git
            ? {
                ...snapshot.git,
                changedFiles: Array.from({ length: 36 }, (_, index) => ({
                  path: `notes/${"nested-directory/".repeat(8)}record-${index}.md`,
                  status: index === 35 ? "unexpected-native-status" : "M",
                })),
                changedFilesTruncated: true,
              }
            : null,
        };
      return snapshot;
    }
  }
  await new FixtureSyncProvider({
    context,
    config: directorySyncConfigSchema.parse({ initialSync: false }),
    getDirectorySync: (): never => {
      throw new Error("Visual fixtures do not execute directory sync");
    },
    getGitSync: (): undefined => undefined,
    operationStatus: new DirectorySyncOperationStatusService(
      context.runtimeState,
      context.jobs,
      context.logger,
      "brain-data",
    ),
  }).registerStudioWorkspace();
  return async () => {
    if (!registration)
      throw new Error("Missing Content sync fixture workspace");
    return registration.dataProvider(actor);
  };
}
