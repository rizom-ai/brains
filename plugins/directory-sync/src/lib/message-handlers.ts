import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type {
  CleanupResult,
  DirectorySyncStatus,
  ExportResult,
  GitSyncStatus,
  ImportResult,
} from "../types";

interface ConfigureOptions {
  syncPath: string;
}

/**
 * Register message-bus handlers for cross-plugin communication:
 *   - entity:export:request
 *   - entity:import:request
 *   - sync:status:request
 *   - sync:configure:request
 */
interface GitConfig {
  repo?: string | undefined;
  branch?: string | undefined;
}

/** The slice of DirectorySync the message handlers consume. */
export interface SyncHandlerSource {
  getStatus(): Promise<DirectorySyncStatus>;
  exportEntities(entityTypes?: string[]): Promise<ExportResult>;
  importEntities(paths?: string[]): Promise<ImportResult>;
  removeOrphanedEntities(): Promise<CleanupResult>;
}

/** The slice of GitSync the status handler consumes. */
export interface GitStatusSource {
  getStatus(): Promise<GitSyncStatus>;
}

export function registerMessageHandlers(
  context: ServicePluginContext,
  getDirectorySync: () => SyncHandlerSource,
  configure: (options: ConfigureOptions) => Promise<void>,
  logger: Logger,
  gitConfig?: GitConfig,
  getGitSync?: () => GitStatusSource | undefined,
): void {
  const { subscribe } = context.messaging;

  subscribe<{ entityTypes?: string[] }>(
    "entity:export:request",
    async (message) => {
      try {
        const ds = getDirectorySync();
        const result = await ds.exportEntities(message.payload.entityTypes);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Export failed",
        };
      }
    },
  );

  subscribe<{ paths?: string[] }>("entity:import:request", async (message) => {
    try {
      const ds = getDirectorySync();
      const paths = message.payload.paths;
      const result = await ds.importEntities(paths);

      // When specific paths are provided (e.g., from git-sync after a pull),
      // some of those paths may be deletions. Run orphan cleanup to remove
      // DB entities whose files no longer exist on disk.
      if (paths && paths.length > 0) {
        await ds.removeOrphanedEntities();
      }

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  });

  subscribe("sync:status:request", async () => {
    try {
      const ds = getDirectorySync();
      const status = await ds.getStatus();
      return {
        success: true,
        data: {
          syncPath: status.syncPath,
          isInitialized: status.exists,
          watchEnabled: status.watching,
          lastSync: status.lastSync?.toISOString() ?? null,
          git: await queryGitStatus(getGitSync?.(), logger),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Status check failed",
      };
    }
  });

  subscribe<{ syncPath: string }>("sync:configure:request", async (message) => {
    try {
      await configure({ syncPath: message.payload.syncPath });
      return {
        success: true,
        data: {
          syncPath: message.payload.syncPath,
          configured: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Configuration failed",
      };
    }
  });

  subscribe("git-sync:get-repo-info", async () => {
    if (!gitConfig?.repo) {
      return { success: false, error: "Git not configured" };
    }
    return {
      success: true,
      data: { repo: gitConfig.repo, branch: gitConfig.branch ?? "main" },
    };
  });

  logger.debug("Registered message handlers");
}

/**
 * Git state for the status payload. A git failure degrades to null —
 * consumers (e.g. the CMS save-pipeline strip) still get the directory
 * status rather than an error for the whole request.
 */
async function queryGitStatus(
  gitSync: GitStatusSource | undefined,
  logger: Logger,
): Promise<{
  branch: string;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  lastCommit: string | null;
  remote: string | null;
} | null> {
  if (!gitSync) return null;
  try {
    const status = await gitSync.getStatus();
    return {
      branch: status.branch,
      hasChanges: status.hasChanges,
      ahead: status.ahead,
      behind: status.behind,
      lastCommit: status.lastCommit ?? null,
      remote: status.remote ?? null,
    };
  } catch (error) {
    logger.debug("Git status unavailable for sync:status:request", { error });
    return null;
  }
}
