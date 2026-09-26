import { createMockShell } from "@brains/plugins/test";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { defineServicePlugin, z } from "@brains/sdk/services";
import {
  registerFixtureWorkspace,
  refuseFixtureAction,
} from "./studio-fixture-workspace";
import {
  directorySyncWorkspace,
  type DirectorySyncWorkspaceSnapshot,
} from "../../plugins/directory-sync/src/lib/studio-workspace";

import type { StudioStudyState } from "./studio-study-state";

/** Seed status records, never a parallel implementation of the workspace view. */
export async function createSyncViewFixture(
  state?: StudioStudyState,
): Promise<() => Promise<unknown>> {
  const shell = createMockShell();
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "visual-admin",
    actor: { kind: "user", userId: "visual-admin" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  async function syncData(): Promise<DirectorySyncWorkspaceSnapshot> {
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
  const registration = await registerFixtureWorkspace(
    shell,
    defineServicePlugin(
      { id: "directory-sync", config: z.strictObject({}) },
      {
        studioWorkspaces: (context) => [
          directorySyncWorkspace.bind(context, {
            load: syncData,
            actions: directorySyncWorkspace.actions.map((action) =>
              action.bind(context, refuseFixtureAction, refuseFixtureAction),
            ),
          }),
        ],
      },
    ),
  );
  return () => registration.dataProvider(actor);
}
