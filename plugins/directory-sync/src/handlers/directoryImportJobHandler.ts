import type { DirectorySyncHost } from "../host";
import type { Logger } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import {
  type ImportResult,
  type DirectoryImportJobData,
  type IDirectorySync,
} from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import { getErrorMessage } from "@brains/utils/error";
import {
  runDirectoryProjectionBatchChild,
  settleDirectoryProjectionBatchChild,
} from "../lib/projection-batch-job";

export class DirectoryImportJobHandler {
  protected readonly logger: Logger;
  private directorySync: IDirectorySync;
  private readonly context: DirectorySyncHost;
  private readonly operationStatus:
    DirectorySyncOperationStatusService | undefined;

  constructor(
    logger: Logger,
    context: DirectorySyncHost,
    directorySync: IDirectorySync,
    operationStatus?: DirectorySyncOperationStatusService,
  ) {
    this.logger = logger;
    this.context = context;
    this.directorySync = directorySync;
    this.operationStatus = operationStatus;
  }

  public async process(
    data: DirectoryImportJobData,
    jobId: string,
    progressReporter: ProgressContract,
  ): Promise<ImportResult> {
    this.logger.debug("Processing directory import job", { jobId, data });

    return runDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      async (): Promise<ImportResult> => {
        const startTime = Date.now();

        try {
          const result = await this.directorySync.importEntitiesWithProgress(
            data.paths,
            progressReporter,
            data.batchSize ?? 100,
          );

          this.logger.debug("Directory import job completed", {
            jobId,
            imported: result.imported,
            skipped: result.skipped,
            failed: result.failed,
            quarantined: result.quarantined,
            duration: Date.now() - startTime,
          });
          await this.operationStatus?.addImportResult(result);

          return result;
        } catch (error) {
          this.logger.error("Directory import job failed", { jobId, error });
          await this.operationStatus?.recordIssue({
            kind: "import",
            message: getErrorMessage(error, "Directory import failed"),
          });
          throw error;
        }
      },
    );
  }

  public async onTerminalSuccess(
    data: DirectoryImportJobData,
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
    data: DirectoryImportJobData,
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
