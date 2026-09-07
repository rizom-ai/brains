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
import {
  activeDirectorySyncRunSchema,
  directorySyncIssueSchema,
  recentDirectorySyncRunSchema,
  type ActiveDirectorySyncRun,
  type DirectorySyncOperationStatusService,
} from "./directory-sync-operation-status";
import { requestDirectorySync } from "./request-directory-sync";

export interface DirectorySyncWorkspaceAction {
  type: "sync-now";
}

const directorySyncWorkspaceSnapshotSchema: z.ZodObject<{
  health: z.ZodEnum<{
    healthy: "healthy";
    active: "active";
    attention: "attention";
  }>;
  directory: z.ZodObject<{
    displayPath: z.ZodString;
    exists: z.ZodBoolean;
    watching: z.ZodBoolean;
    totalFiles: z.ZodNumber;
    byEntityType: z.ZodRecord<z.ZodString, z.ZodNumber>;
    lastSettledAt: z.ZodOptional<z.ZodString>;
  }>;
  git: z.ZodNullable<
    z.ZodObject<{
      branch: z.ZodString;
      remoteLabel: z.ZodOptional<z.ZodString>;
      hasChanges: z.ZodBoolean;
      ahead: z.ZodNumber;
      behind: z.ZodNumber;
      lastCommit: z.ZodOptional<z.ZodString>;
      changedFiles: z.ZodArray<
        z.ZodObject<{ path: z.ZodString; status: z.ZodString }>
      >;
      changedFilesTruncated: z.ZodBoolean;
    }>
  >;
  automation: z.ZodObject<{
    autoSync: z.ZodBoolean;
    watchIntervalMs: z.ZodNumber;
    remoteIntervalMinutes: z.ZodOptional<z.ZodNumber>;
    commitDebounceMs: z.ZodOptional<z.ZodNumber>;
    deleteOnFileRemoval: z.ZodBoolean;
  }>;
  activeRun: z.ZodOptional<typeof activeDirectorySyncRunSchema>;
  recentRuns: z.ZodArray<typeof recentDirectorySyncRunSchema>;
  issues: z.ZodArray<typeof directorySyncIssueSchema>;
}> = z.object({
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
  activeRun: activeDirectorySyncRunSchema.optional(),
  recentRuns: z.array(recentDirectorySyncRunSchema),
  issues: z.array(directorySyncIssueSchema),
});

export type DirectorySyncWorkspaceSnapshot = z.output<
  typeof directorySyncWorkspaceSnapshotSchema
>;

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
    const issueGroups = new Map<string, (typeof data.issues)[number][]>();
    for (const issue of data.issues) {
      const group = issueGroups.get(issue.kind);
      if (group) group.push(issue);
      else issueGroups.set(issue.kind, [issue]);
    }
    const activeBlocks: SyncRegionBlock[] = data.activeRun
      ? [activeProgress(data.activeRun)]
      : [];
    const changedFileBlocks: SyncRegionBlock[] = data.git?.changedFiles.length
      ? [
          {
            type: "list",
            id: "changed-files",
            presentation: "editorial",
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
        presentation: "editorial",
        empty: "No directory sync runs have completed yet.",
        items: data.recentRuns.map((run) => ({
          id: run.id,
          title: `${{ manual: "Manual sync", periodic: "Periodic sync", watcher: "Watch sync", save: "Save sync" }[run.source]} · ${run.outcome}`,
          description: run.summary,
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
    // One visible exception per operation; every recorded diagnostic remains available.
    const blockers: SyncRegionBlock[] = [...issueGroups.entries()].flatMap(
      ([kind, issues]) => {
        const ordered = [...issues].sort(
          (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
        );
        const latest = ordered[0];
        if (!latest) return [];
        const operation =
          kind === "git"
            ? "Repository sync"
            : kind === "export"
              ? "Content export"
              : kind === "import"
                ? "Content import"
                : kind === "source"
                  ? "Content folder"
                  : kind;
        return [
          {
            type: "notice" as const,
            id: `sync-issues-${kind}`,
            title: `${operation} needs attention`,
            text: [
              `${ordered.length} recorded ${ordered.length === 1 ? "issue" : "issues"}`,
              latest.path,
            ]
              .filter(Boolean)
              .join(" · "),
            tone: "warn" as const,
            details: ordered.map((issue) =>
              [
                `Occurred: ${issue.occurredAt}`,
                issue.path ? `Path: ${issue.path}` : undefined,
                issue.message,
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          },
        ];
      },
    );
    const blocks: SyncViewBlock[] = [
      ...blockers,
      {
        type: "columns",
        id: "sync-body",
        primary: work.map((block) =>
          block.type === "list"
            ? {
                type: "card" as const,
                id: `${block.id}-section`,
                label:
                  block.id === "recent-runs" ? "Recent runs" : "Changed files",
                metadata: [
                  block.id === "recent-runs"
                    ? `${block.items.length} retained`
                    : `${block.items.length} in working tree`,
                ],
                blocks: [block],
              }
            : block,
        ),
        aside: [
          {
            type: "card",
            id: "sync-source-card",
            label: "Connection",
            blocks: [
              {
                type: "key-values",
                id: "sync-source",
                items: [
                  { label: "Folder", value: data.directory.displayPath },
                  { label: "Available", value: data.directory.exists },
                  {
                    label: "Watcher",
                    value: data.directory.watching ? "Watching" : "Stopped",
                  },
                  ...(data.directory.lastSettledAt
                    ? [
                        {
                          label: "Last settled",
                          value: data.directory.lastSettledAt,
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
          {
            type: "card",
            id: "sync-repository-card",
            label: "Repository details",
            presentation: "disclosure",
            blocks: [
              {
                type: "key-values",
                id: "sync-health",
                items: [{ label: "Health", value: data.health }],
              },
              {
                type: "key-values",
                id: "sync-git-source",
                items: data.git
                  ? [
                      { label: "Branch", value: data.git.branch },
                      {
                        label: "Remote",
                        value: data.git.remoteLabel ?? data.git.branch,
                      },
                      ...(data.git.lastCommit
                        ? [{ label: "Last commit", value: data.git.lastCommit }]
                        : []),
                    ]
                  : [{ label: "Remote", value: "files only" }],
              },
              totals,
              automation,
              repository,
            ],
          },
        ],
      },
    ];
    return {
      kicker: "Durability operations",
      title: "Content sync",
      primaryAction: { action: syncNowAction, input: {} },
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
