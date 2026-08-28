import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  registerBuiltInStudioWorkspace,
  type OperatorRegionBlock,
  type OperatorViewBlock,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { basename } from "path";
import type {
  DirectorySyncConfig,
  GitSyncStatus,
  IDirectorySync,
  IGitSync,
} from "../types";
import type {
  ActiveDirectorySyncRun,
  DirectorySyncIssue,
  DirectorySyncOperationStatusService,
  RecentDirectorySyncRun,
} from "./directory-sync-operation-status";
import { requestDirectorySync } from "./request-directory-sync";

export interface DirectorySyncWorkspaceAction {
  type: "sync-now";
}

export interface DirectorySyncWorkspaceSnapshot {
  health: "healthy" | "active" | "attention";
  directory: {
    displayPath: string;
    exists: boolean;
    watching: boolean;
    totalFiles: number;
    byEntityType: Record<string, number>;
    lastSettledAt?: string | undefined;
  };
  git: {
    branch: string;
    remoteLabel?: string | undefined;
    hasChanges: boolean;
    ahead: number;
    behind: number;
    lastCommit?: string | undefined;
    changedFiles: Array<{ path: string; status: string }>;
    changedFilesTruncated: boolean;
  } | null;
  automation: {
    autoSync: boolean;
    watchIntervalMs: number;
    remoteIntervalMinutes?: number | undefined;
    commitDebounceMs?: number | undefined;
    deleteOnFileRemoval: boolean;
  };
  activeRun?: ActiveDirectorySyncRun | undefined;
  recentRuns: RecentDirectorySyncRun[];
  issues: DirectorySyncIssue[];
}

const directorySyncRunMetricsSchema = {
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  exported: z.number().int().nonnegative(),
};

const directorySyncWorkspaceSnapshotSchema: z.ZodType<DirectorySyncWorkspaceSnapshot> =
  z.object({
    health: z.enum(["healthy", "active", "attention"]),
    directory: z.object({
      displayPath: z.string().min(1),
      exists: z.boolean(),
      watching: z.boolean(),
      totalFiles: z.number().int().nonnegative(),
      byEntityType: z.record(z.string(), z.number().int().nonnegative()),
      lastSettledAt: z.string().datetime().optional(),
    }),
    git: z
      .object({
        branch: z.string().min(1),
        remoteLabel: z.string().min(1).optional(),
        hasChanges: z.boolean(),
        ahead: z.number().int().nonnegative(),
        behind: z.number().int().nonnegative(),
        lastCommit: z.string().min(1).optional(),
        changedFiles: z.array(
          z.object({ path: z.string().min(1), status: z.string().min(1) }),
        ),
        changedFilesTruncated: z.boolean(),
      })
      .nullable(),
    automation: z.object({
      autoSync: z.boolean(),
      watchIntervalMs: z.number().int().nonnegative(),
      remoteIntervalMinutes: z.number().nonnegative().optional(),
      commitDebounceMs: z.number().int().nonnegative().optional(),
      deleteOnFileRemoval: z.boolean(),
    }),
    activeRun: z
      .object({
        id: z.string().min(1),
        source: z.enum(["manual", "periodic", "watcher", "save"]),
        state: z.enum(["pulling", "scanning", "importing", "settling"]),
        startedAt: z.string().datetime(),
        lastProgressAt: z.string().datetime(),
        jobId: z.string().min(1).optional(),
        batchId: z.string().min(1).optional(),
        ...directorySyncRunMetricsSchema,
      })
      .optional(),
    recentRuns: z.array(
      z.object({
        id: z.string().min(1),
        source: z.enum(["manual", "periodic", "watcher", "save"]),
        outcome: z.enum(["succeeded", "attention", "failed"]),
        startedAt: z.string().datetime(),
        completedAt: z.string().datetime(),
        summary: z.string().min(1),
        ...directorySyncRunMetricsSchema,
      }),
    ),
    issues: z.array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["quarantined", "import", "export", "git", "source"]),
        path: z.string().min(1).optional(),
        message: z.string().min(1),
        occurredAt: z.string().datetime(),
      }),
    ),
  });

const syncNowAction = defineWorkspaceAction({
  name: "sync-now",
  label: "Sync now",
  permission: "admin",
  input: z.object({}),
  output: z.object({
    accepted: z.boolean(),
    status: z.string().min(1),
    runId: z.string().min(1).optional(),
    jobId: z.string().min(1).optional(),
    batchId: z.string().min(1).optional(),
  }),
});

function activeProgress(
  run: ActiveDirectorySyncRun,
): Extract<OperatorViewBlock, { type: "progress" }> {
  const total = run.imported + run.skipped + run.failed + run.quarantined;
  return {
    type: "progress",
    id: "active-sync",
    label: "Directory sync",
    state: run.state,
    detail: `${total} files handled · ${run.exported} exported`,
    startedAt: run.startedAt,
    updatedAt: run.lastProgressAt,
    tone: run.failed > 0 || run.quarantined > 0 ? "warn" : "neutral",
  };
}

const directorySyncWorkspace = defineStudioWorkspace({
  id: "sync",
  label: "Content sync",
  permission: "admin",
  data: directorySyncWorkspaceSnapshotSchema,
  actions: [syncNowAction],
  refresh: ({ data }) => (data.activeRun ? 1_000 : undefined),
  view: ({ data }) => {
    type SyncViewBlock = OperatorViewBlock<typeof syncNowAction>;
    type SyncRegionBlock = OperatorRegionBlock<typeof syncNowAction>;
    type SyncFlowStep = Extract<
      SyncViewBlock,
      { type: "flow" }
    >["steps"][number];
    const gitFlowSteps: SyncFlowStep[] = [];
    if (data.git) {
      gitFlowSteps.push({
        id: "git",
        label: data.git.remoteLabel ?? data.git.branch,
        status: data.issues.some((issue) => issue.kind === "git")
          ? "failed"
          : data.git.hasChanges || data.git.ahead > 0 || data.git.behind > 0
            ? "active"
            : "complete",
        detail: `${data.git.ahead} ahead · ${data.git.behind} behind`,
      });
    }
    const activeBlocks: SyncRegionBlock[] = data.activeRun
      ? [activeProgress(data.activeRun)]
      : [];
    const changedFileBlocks: SyncRegionBlock[] = data.git?.changedFiles.length
      ? [
          {
            type: "list",
            id: "changed-files",
            empty: "No changed files.",
            items: data.git.changedFiles.map((file, index) => ({
              id: `changed-${index + 1}`,
              title: file.path,
              badges: [{ label: file.status }],
            })),
          },
        ]
      : [];
    const totals: SyncViewBlock = {
      type: "stats",
      id: "sync-summary",
      items: [
        {
          label: "Files",
          value: data.directory.totalFiles,
          caption: "markdown + images",
        },
        {
          label: "Entity types",
          value: Object.keys(data.directory.byEntityType).length,
          caption: "within sync scope",
        },
        {
          label: "Issues",
          value: data.issues.length,
          caption: data.issues.length > 0 ? "needs attention" : "all clear",
          tone: data.issues.length > 0 ? "warn" : "good",
        },
      ],
    };
    const primary: SyncRegionBlock[] = [
      {
        type: "flow",
        id: "sync-flow",
        label: "Content flow",
        direction: data.git ? "bidirectional" : "forward",
        steps: [
          {
            id: "directory",
            label: data.directory.displayPath,
            status: data.directory.exists ? "complete" : "failed",
            detail: data.directory.watching
              ? "Watching for changes"
              : "Watcher stopped",
          },
          {
            id: "scanner",
            label: "Scanner",
            status: data.activeRun ? "active" : "idle",
            detail: data.activeRun?.state,
          },
          {
            id: "entities",
            label: "Entity store",
            status: data.issues.some((issue) => issue.kind === "import")
              ? "failed"
              : data.directory.totalFiles > 0
                ? "complete"
                : "idle",
          },
          ...gitFlowSteps,
        ],
      },
    ];
    const automation: SyncRegionBlock = {
      type: "group",
      id: "sync-automation",
      label: "Automation",
      items: [
        {
          id: "automatic",
          label: "Automatic sync",
          value: data.automation.autoSync,
        },
        {
          id: "watch",
          label: "Watch interval",
          value: `${data.automation.watchIntervalMs} ms`,
        },
        {
          id: "delete",
          label: "Delete removed files",
          value: data.automation.deleteOnFileRemoval,
        },
        ...(data.automation.remoteIntervalMinutes === undefined
          ? []
          : [
              {
                id: "remote",
                label: "Remote interval",
                value: `${data.automation.remoteIntervalMinutes} min`,
              },
            ]),
      ],
    };
    const repository: SyncRegionBlock = {
      type: "meters",
      id: "sync-meters",
      items: [
        {
          id: "files",
          label: "Content files",
          value: data.directory.totalFiles,
        },
        {
          id: "issues",
          label: "Issues",
          value: data.issues.length,
          tone: data.issues.length > 0 ? "warn" : "good",
        },
        ...(data.git
          ? [
              { id: "ahead", label: "Commits ahead", value: data.git.ahead },
              {
                id: "behind",
                label: "Commits behind",
                value: data.git.behind,
              },
            ]
          : []),
      ],
    };
    const work: SyncRegionBlock[] = [
      ...activeBlocks,
      {
        type: "list",
        id: "recent-runs",
        empty: "No directory sync runs have completed yet.",
        items: data.recentRuns.map((run) => ({
          id: run.id,
          title: `${run.source} · ${run.outcome}`,
          description: run.summary,
          badges: [{ label: run.outcome }],
          tone:
            run.outcome === "succeeded"
              ? "good"
              : run.outcome === "failed"
                ? "error"
                : "warn",
          metadata: [
            `Imported: ${run.imported}`,
            `Exported: ${run.exported}`,
            `Completed: ${run.completedAt}`,
          ],
        })),
      },
      ...changedFileBlocks,
    ];
    // Blockers belong beside the work, stated either way: an all-clear is a
    // result worth showing, not an absent block.
    const blockers: SyncRegionBlock =
      data.issues.length === 0
        ? {
            type: "card",
            id: "sync-blockers-card",
            label: "No blockers",
            tone: "good",
            blocks: [
              {
                type: "notice",
                id: "sync-clear",
                text: "Directory exists, configured automation is available, and no unresolved operation failures are recorded.",
                tone: "good",
              },
            ],
          }
        : {
            type: "card",
            id: "sync-blockers-card",
            label: "Needs attention",
            tone: "warn",
            blocks: [
              {
                type: "list",
                id: "sync-issues",
                empty: "No sync issues need attention.",
                items: data.issues.map((issue) => ({
                  id: issue.id,
                  title: issue.kind,
                  description: issue.message,
                  tone: "warn",
                  metadata: [
                    ...(issue.path ? [`Path: ${issue.path}`] : []),
                    `Occurred: ${issue.occurredAt}`,
                  ],
                })),
              },
            ],
          };
    const blocks: SyncViewBlock[] = [
      totals,
      {
        type: "columns",
        id: "sync-body",
        primary: [...primary, ...work],
        aside: [
          blockers,
          {
            type: "card",
            id: "sync-automation-card",
            label: "Automation",
            blocks: [automation],
          },
          {
            type: "card",
            id: "sync-source-card",
            label: "Source",
            blocks: [
              {
                type: "key-values",
                id: "sync-source",
                items: [
                  { label: "Directory", value: data.directory.displayPath },
                  ...(data.git
                    ? [
                        { label: "Branch", value: data.git.branch },
                        {
                          label: "Remote",
                          value: data.git.remoteLabel ?? data.git.branch,
                        },
                      ]
                    : [{ label: "Remote", value: "files only" }]),
                ],
              },
            ],
          },
          {
            type: "card",
            id: "sync-repository-card",
            label: "Repository",
            blocks: [repository],
          },
          {
            type: "action",
            id: "sync-now",
            action: syncNowAction,
            input: {},
          },
        ],
      },
    ];
    return {
      kicker: "Durability operations",
      title: "Content sync",
      description:
        "Keep the entity database, its files, and the configured Git remote converged.",
      status: {
        label: data.health,
        ...(data.directory.lastSettledAt
          ? { detail: `last settled ${data.directory.lastSettledAt}` }
          : {}),
        tone: data.health === "healthy" ? "good" : "warn",
      },
      blocks,
    };
  },
});

export interface DirectorySyncWorkspaceProviderOptions {
  context: ServicePluginContext;
  config: DirectorySyncConfig;
  getDirectorySync: () => IDirectorySync;
  getGitSync: () => IGitSync | undefined;
  operationStatus: DirectorySyncOperationStatusService;
}

/** Optional Studio provider. directory-sync owns data and actions; Studio owns rendering. */
export class DirectorySyncWorkspaceProvider {
  private readonly options: DirectorySyncWorkspaceProviderOptions;
  private registered = false;

  constructor(options: DirectorySyncWorkspaceProviderOptions) {
    this.options = options;
  }

  async getSnapshot(): Promise<DirectorySyncWorkspaceSnapshot> {
    const directory = await this.options.getDirectorySync().getStatus();
    this.options.operationStatus.setSyncPath(directory.syncPath);
    let gitStatus: GitSyncStatus | undefined;
    const gitSync = this.options.getGitSync();
    if (gitSync) {
      try {
        gitStatus = await gitSync.getStatus();
        if (
          !gitStatus.hasChanges &&
          gitStatus.ahead === 0 &&
          gitStatus.behind === 0
        ) {
          await this.options.operationStatus.clearIssues(["git"]);
        }
      } catch (error) {
        await this.options.operationStatus.recordIssue({
          kind: "git",
          message: getErrorMessage(error, "Git status unavailable"),
        });
      }
    }
    if (!directory.exists) {
      await this.options.operationStatus.recordIssue({
        kind: "source",
        message: "The configured sync directory is unavailable",
      });
    } else {
      await this.options.operationStatus.clearIssues(["source"]);
    }
    const operations = await this.options.operationStatus.getSnapshot();
    const lastSettledAt =
      operations.recentRuns[0]?.completedAt ??
      directory.lastSync?.toISOString();
    return directorySyncWorkspaceSnapshotSchema.parse({
      health: operations.activeRun
        ? "active"
        : operations.issues.length > 0
          ? "attention"
          : "healthy",
      directory: {
        displayPath: basename(directory.syncPath) || "brain-data",
        exists: directory.exists,
        watching: directory.watching,
        totalFiles: directory.stats.totalFiles,
        byEntityType: directory.stats.byEntityType,
        ...(lastSettledAt ? { lastSettledAt } : {}),
      },
      git: gitStatus ? this.toSafeGitStatus(gitStatus) : null,
      automation: {
        autoSync: this.options.config.autoSync,
        watchIntervalMs: this.options.config.watchInterval,
        ...(gitSync
          ? {
              remoteIntervalMinutes: this.options.config.syncInterval,
              commitDebounceMs: this.options.config.commitDebounce,
            }
          : {}),
        deleteOnFileRemoval: this.options.config.deleteOnFileRemoval,
      },
      ...(operations.activeRun ? { activeRun: operations.activeRun } : {}),
      recentRuns: operations.recentRuns,
      issues: operations.issues,
    });
  }

  async registerStudioWorkspace(): Promise<string | undefined> {
    const result = await registerBuiltInStudioWorkspace({
      context: this.options.context,
      definition: directorySyncWorkspace,
      bind: (context) =>
        directorySyncWorkspace.bind(context, {
          load: () => this.getSnapshot(),
          actions: [
            syncNowAction.bind(context, async ({ caller }) => {
              if (!caller) {
                throw new Error(
                  "Directory sync requires an authenticated caller",
                );
              }
              const toolContext: ToolContext = {
                interfaceType: "studio",
                actor: { kind: "user", userId: caller.actor.id },
                userPermissionLevel: caller.permission,
              };
              const result = await requestDirectorySync({
                context: this.options.context,
                directorySync: this.options.getDirectorySync(),
                source: `studio:${caller.actor.id}`,
                interfaceType: "studio",
                toolContext,
                gitSync: this.options.getGitSync(),
                operationStatus: this.options.operationStatus,
              });
              return {
                accepted: result.status === "queued",
                status: result.status,
                ...(result.runId ? { runId: result.runId } : {}),
                ...(result.gitPulled ? { jobId: result.jobId } : {}),
                ...(!result.gitPulled && result.status === "queued"
                  ? { batchId: result.batchId }
                  : {}),
              };
            }),
          ],
        }),
    });
    this.registered = result !== false;
    return result === false ? undefined : result.workspaceUrl;
  }

  async unregisterStudioWorkspace(): Promise<void> {
    if (!this.registered) return;
    await this.options.context.studio.unregisterWorkspace(
      `${this.options.context.pluginId}:sync`,
    );
    this.registered = false;
  }

  private toSafeGitStatus(
    status: GitSyncStatus,
  ): NonNullable<DirectorySyncWorkspaceSnapshot["git"]> {
    const changedFiles = status.files.slice(0, 20).map((file) => ({
      path: normalizeGitPath(file.path),
      status: file.status.trim() || "changed",
    }));
    const remoteLabel = safeRemoteLabel(this.options.config);
    return {
      branch: status.branch,
      ...(remoteLabel ? { remoteLabel } : {}),
      hasChanges: status.hasChanges,
      ahead: status.ahead,
      behind: status.behind,
      ...(status.lastCommit ? { lastCommit: status.lastCommit } : {}),
      changedFiles,
      changedFilesTruncated: status.files.length > changedFiles.length,
    };
  }
}

function normalizeGitPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("../") || normalized.startsWith("/")) {
    return "content file";
  }
  return normalized.slice(0, 300) || "content file";
}

function safeRemoteLabel(config: DirectorySyncConfig): string | undefined {
  if (config.git?.repo) return config.git.repo;
  const value = config.git?.gitUrl;
  if (!value) return undefined;
  if (value.startsWith("file:")) return "local remote";
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return path ? `${url.hostname}/${path}` : url.hostname;
  } catch {
    const scp = /^(?:[^@]+@)?([^:]+):(.+?)(?:\.git)?$/.exec(value);
    if (!scp?.[1] || !scp[2]) return "configured remote";
    return `${scp[1]}/${scp[2].replace(/\.git$/, "")}`;
  }
}
