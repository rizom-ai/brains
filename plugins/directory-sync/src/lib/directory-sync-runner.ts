import type { Logger } from "@brains/utils";
import type { CleanupResult, ImportResult, SyncResult } from "../types";

export interface DirectorySyncRunnerDeps {
  logger: Logger;
  importEntities: () => Promise<ImportResult>;
  removeOrphanedEntities: () => Promise<CleanupResult>;
  markSynced: (syncedAt: Date) => void;
}

/**
 * Run the import-only directory sync flow.
 *
 * Export is handled by entity event subscribers so this flow only imports files
 * and then cleans up DB entities whose files no longer exist on disk.
 */
export async function runDirectorySync(
  deps: DirectorySyncRunnerDeps,
): Promise<SyncResult> {
  const startTime = Date.now();
  deps.logger.debug("Starting sync (import only)");

  const importResult = await deps.importEntities();
  const cleanupResult = await deps.removeOrphanedEntities();

  const duration = Date.now() - startTime;
  deps.markSynced(new Date());

  deps.logger.debug("Sync completed", {
    duration,
    imported: importResult.imported,
    orphansDeleted: cleanupResult.deleted,
  });

  return {
    export: { exported: 0, failed: 0, errors: [] },
    import: importResult,
    duration,
  };
}
