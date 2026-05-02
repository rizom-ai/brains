import type { DirectorySyncStatus } from "../types";
import type { FileOperations } from "./file-operations";

interface WatchState {
  isWatching(): boolean;
}

export async function getDirectorySyncStatus(
  fileOperations: FileOperations,
  syncPath: string,
  fileWatcher: WatchState | undefined,
  lastSync: Date | undefined,
): Promise<DirectorySyncStatus> {
  const { files, stats } = await fileOperations.gatherFileStatus();

  return {
    syncPath,
    exists: await fileOperations.syncDirectoryExists(),
    watching: fileWatcher?.isWatching() ?? false,
    lastSync,
    files,
    stats,
  };
}
