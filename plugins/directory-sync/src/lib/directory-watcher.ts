import type { Logger } from "@brains/utils";
import type { ImportResult, JobRequest } from "../types";
import { EventHandler } from "./event-handler";
import type { FileOperations } from "./file-operations";
import { FileWatcher } from "./file-watcher";

export interface DirectoryWatcherOptions {
  logger: Logger;
  syncPath: string;
  watchInterval: number;
  importEntities: (paths?: string[]) => Promise<ImportResult>;
  jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;
  fileOperations: FileOperations;
  deleteOnFileRemoval: boolean;
}

export async function startDirectoryWatcher(
  options: DirectoryWatcherOptions,
): Promise<FileWatcher> {
  const {
    logger,
    syncPath,
    watchInterval,
    importEntities,
    jobQueueCallback,
    fileOperations,
    deleteOnFileRemoval,
  } = options;

  const eventHandler = new EventHandler(
    logger,
    importEntities,
    jobQueueCallback,
    fileOperations,
    deleteOnFileRemoval,
  );

  const fileWatcher = new FileWatcher({
    syncPath,
    watchInterval,
    logger,
    onFileChange: async (event: string, path: string): Promise<void> => {
      await eventHandler.handleFileChange(event, path);
    },
  });

  await fileWatcher.start();
  return fileWatcher;
}
