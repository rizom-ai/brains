import type { DirectorySyncHost } from "../host";
import type { Logger } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import type { CleanupResult, IDirectorySync } from "../types";
import type { DirectoryCleanupJobData } from "../jobs";
import {
  runDirectoryProjectionBatchChild,
  settleDirectoryProjectionBatchChild,
} from "../lib/projection-batch-job";

export class DirectoryCleanupJobHandler {
  protected readonly logger: Logger;
  private readonly context: DirectorySyncHost;
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: DirectorySyncHost,
    directorySync: IDirectorySync,
  ) {
    this.logger = logger;
    this.context = context;
    this.directorySync = directorySync;
  }

  async process(
    data: DirectoryCleanupJobData,
    jobId: string,
    progressReporter: ProgressContract,
  ): Promise<CleanupResult> {
    return runDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      async (): Promise<CleanupResult> => {
        await progressReporter.report({
          progress: 0,
          message: "Removing orphaned entities",
        });

        const result = await this.directorySync.removeOrphanedEntities();

        await progressReporter.report({
          progress: 100,
          message: `Cleanup complete: ${result.deleted} orphans removed`,
        });

        return result;
      },
    );
  }

  public async onTerminalSuccess(
    data: DirectoryCleanupJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "completed",
    );
  }

  public async onTerminalError(
    _error: Error,
    data: DirectoryCleanupJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "failed",
    );
  }
}
