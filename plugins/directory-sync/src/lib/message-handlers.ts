import { DIRECTORY_SYNC_CHANNELS } from "@brains/contracts";
import {
  defineSubscription,
  type AnySubscriptionDefinition,
} from "@brains/sdk/services";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
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

export interface DirectorySyncSubscriptionOptions {
  readonly getDirectorySync: () => SyncHandlerSource;
  readonly configure: (options: ConfigureOptions) => Promise<void>;
  readonly logger: Logger;
  readonly gitConfig?: GitConfig | undefined;
  readonly getGitSync?: (() => GitStatusSource | undefined) | undefined;
  readonly getManagementUrl?: (() => string | undefined) | undefined;
}

const entityExportRequestSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
});
const entityImportRequestSchema = z.object({
  paths: z.array(z.string()).optional(),
});
const configureRequestSchema = z.object({ syncPath: z.string().min(1) });

/**
 * What other packages ask directory-sync over the bus, declared:
 *   - entity:export:request
 *   - entity:import:request
 *   - sync:status:request
 *   - sync:configure:request
 *   - the repository it mirrors
 *
 * A handler answers with what it has to say and throws a refusal; the
 * runtime wraps either for the sender.
 */
export function directorySyncSubscriptions(
  options: DirectorySyncSubscriptionOptions,
): readonly AnySubscriptionDefinition[] {
  const { getDirectorySync, configure, logger, gitConfig } = options;
  return [
    defineSubscription({
      topic: DIRECTORY_SYNC_CHANNELS.entityExportRequest,
      payload: entityExportRequestSchema,
      handle: ({ payload }) =>
        getDirectorySync().exportEntities(payload.entityTypes),
    }),
    defineSubscription({
      topic: DIRECTORY_SYNC_CHANNELS.entityImportRequest,
      payload: entityImportRequestSchema,
      handle: async ({ payload }) => {
        const ds = getDirectorySync();
        const result = await ds.importEntities(payload.paths);
        // When specific paths are provided (e.g., from git-sync after a
        // pull), some of those paths may be deletions. Run orphan cleanup
        // to remove DB entities whose files no longer exist on disk.
        if (payload.paths && payload.paths.length > 0) {
          await ds.removeOrphanedEntities();
        }
        return result;
      },
    }),
    defineSubscription({
      topic: DIRECTORY_SYNC_CHANNELS.statusRequest,
      payload: z.unknown(),
      handle: async () => {
        const status = await getDirectorySync().getStatus();
        const managementUrl = options.getManagementUrl?.();
        return {
          syncPath: status.syncPath,
          isInitialized: status.exists,
          watchEnabled: status.watching,
          lastSync: status.lastSync?.toISOString() ?? null,
          totalFiles: status.stats.totalFiles,
          byEntityType: status.stats.byEntityType,
          git: await queryGitStatus(options.getGitSync?.(), logger),
          ...(managementUrl ? { managementUrl } : {}),
        };
      },
    }),
    defineSubscription({
      topic: DIRECTORY_SYNC_CHANNELS.configureRequest,
      payload: configureRequestSchema,
      handle: async ({ payload }) => {
        await configure({ syncPath: payload.syncPath });
        return { syncPath: payload.syncPath, configured: true };
      },
    }),
    defineSubscription({
      topic: DIRECTORY_SYNC_CHANNELS.getRepoInfo,
      payload: z.unknown(),
      handle: () => {
        if (!gitConfig?.repo) throw new Error("Git not configured");
        return { repo: gitConfig.repo, branch: gitConfig.branch ?? "main" };
      },
    }),
  ];
}

/**
 * Git state for the status payload. A git failure degrades to null —
 * consumers (e.g. the Studio save-pipeline strip) still get the directory
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
    // Git status is diagnostic detail on a status response. A repo we cannot
    // read reports no git section rather than failing the whole request.
    logger.debug("Git status unavailable for sync:status:request", { error });
    return null;
  }
}
