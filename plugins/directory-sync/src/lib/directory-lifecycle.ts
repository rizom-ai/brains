import type { Logger } from "@brains/utils";
import { ensureSyncPath } from "./directory-path";

export async function initializeDirectorySync(
  logger: Logger,
  syncPath: string,
  autoSync: boolean,
  startWatching: () => Promise<void>,
): Promise<void> {
  logger.debug("Initializing directory sync", { path: syncPath });
  await ensureSyncPath(syncPath);

  if (autoSync) {
    void startWatching();
  }
}

export async function initializeDirectoryStructure(
  logger: Logger,
  syncPath: string,
): Promise<void> {
  logger.debug("Initializing directory structure", {
    path: syncPath,
  });
  await ensureSyncPath(syncPath);
}
