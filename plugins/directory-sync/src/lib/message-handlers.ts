import type { DirectorySyncContext } from "./sync-context";
import { decodeEntityIdPath } from "@brains/sdk/internal/entity-runtime";
import {
  directorySyncPathContract,
  directorySyncStatusContract,
  type DirectorySyncStatusResponse,
} from "@brains/contracts";
import {
  containmentOf,
  resolveEntityPlacement,
  getEntityFileExtension,
} from "./entity-paths";
import type { Logger } from "@brains/utils/logger";
import type { DirectorySyncStatus, GitSyncStatus } from "../types";

/** The slice of DirectorySync the status answer consumes. */
export interface SyncHandlerSource {
  getStatus(): Promise<DirectorySyncStatus>;
}

/** The slice of GitSync the status handler consumes. */
export interface GitStatusSource {
  getStatus(): Promise<GitSyncStatus>;
}

/**
 * Answer the directory-sync contracts other plugins ask:
 *   - sync:path:request
 *   - sync:status:request
 */
export function registerMessageHandlers(
  context: DirectorySyncContext,
  getDirectorySync: () => SyncHandlerSource,
  logger: Logger,
  getGitSync?: () => GitStatusSource | undefined,
  getManagementUrl?: () => string | undefined,
): void {
  context.runtime.answer(directorySyncPathContract, ({ request: input }) => {
    const extension = getEntityFileExtension(input);
    const { relativePath, owner, writable } = resolveEntityPlacement(
      ".",
      input.entityType,
      input.entityId,
      extension,
      containmentOf(context.entityService),
    );
    const [first, ...rest] = decodeEntityIdPath(input.entityId);
    const segment = rest.at(-1) ?? first;
    const end = relativePath.length - extension.length;
    // Placement owns the highlight too: a segment may itself equal an extension.
    const leaf =
      segment && relativePath.endsWith(`${segment}${extension}`)
        ? { start: end - segment.length, end }
        : null;
    return { relativePath, leaf, owner, writable };
  });

  context.runtime.answer(directorySyncStatusContract, async () => {
    const status = await getDirectorySync().getStatus();
    const managementUrl = getManagementUrl?.();
    return {
      syncPath: status.syncPath,
      isInitialized: status.exists,
      watchEnabled: status.watching,
      lastSync: status.lastSync?.toISOString() ?? null,
      totalFiles: status.stats.totalFiles,
      byEntityType: status.stats.byEntityType,
      git: await queryGitStatus(getGitSync?.(), logger),
      ...(managementUrl ? { managementUrl } : {}),
    };
  });

  logger.debug("Registered message handlers");
}

/**
 * Git state for the status payload. A git failure degrades to null —
 * consumers (e.g. the Studio save-pipeline strip) still get the directory
 * status rather than an error for the whole request.
 */
async function queryGitStatus(
  gitSync: GitStatusSource | undefined,
  logger: Logger,
): Promise<DirectorySyncStatusResponse["git"]> {
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
