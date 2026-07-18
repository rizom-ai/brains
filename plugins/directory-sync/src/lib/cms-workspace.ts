import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  PermissionService,
  type CmsWorkspaceRegistration,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins";
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

const registrationResultSchema = z.object({ workspaceUrl: z.string() });

export interface DirectorySyncWorkspaceAction {
  type: "sync-now";
}

const directorySyncWorkspaceActionSchema: z.ZodType<DirectorySyncWorkspaceAction> =
  z.object({
    type: z.literal("sync-now"),
  });

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

export interface DirectorySyncWorkspaceProviderOptions {
  context: ServicePluginContext;
  pluginId: string;
  config: DirectorySyncConfig;
  getDirectorySync: () => IDirectorySync;
  getGitSync: () => IGitSync | undefined;
  operationStatus: DirectorySyncOperationStatusService;
}

/** Optional CMS provider. directory-sync owns data and actions; CMS owns rendering. */
export class DirectorySyncWorkspaceProvider {
  private readonly options: DirectorySyncWorkspaceProviderOptions;

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
          message:
            error instanceof Error ? error.message : "Git status unavailable",
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
    const health = operations.activeRun
      ? "active"
      : operations.issues.length > 0
        ? "attention"
        : "healthy";

    return directorySyncWorkspaceSnapshotSchema.parse({
      health,
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

  async registerCmsWorkspace(): Promise<string | undefined> {
    const registration: CmsWorkspaceRegistration = {
      id: "sync",
      pluginId: this.options.pluginId,
      label: "Sync",
      rendererName: "DirectorySyncWorkspace",
      priority: 60,
      dataProvider: () => this.getSnapshot(),
      actionHandler: async (request, actor) => {
        if (
          !PermissionService.hasPermission(actor.userPermissionLevel, "anchor")
        ) {
          throw new Error("Directory sync requires anchor permission");
        }
        const action = directorySyncWorkspaceActionSchema.safeParse(request);
        if (!action.success) {
          throw new Error("Invalid directory sync workspace action");
        }

        const toolContext: ToolContext = {
          interfaceType: "cms",
          actor: { kind: "user", userId: actor.userId },
          userPermissionLevel: actor.userPermissionLevel,
        };
        const result = await requestDirectorySync({
          context: this.options.context,
          directorySync: this.options.getDirectorySync(),
          source: `cms:${actor.userId}`,
          interfaceType: "cms",
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
      },
    };

    const response = await this.options.context.messaging.send({
      type: CMS_WORKSPACE_REGISTER_MESSAGE,
      payload: registration,
    });
    if (!("success" in response) || !response.success) return undefined;

    const parsed = registrationResultSchema.safeParse(response.data);
    return parsed.success ? parsed.data.workspaceUrl : undefined;
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
