import type { DirectorySyncHost } from "../host";
import type { Logger } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import {
  type ExportResult,
  type DirectoryExportJobData,
  type IDirectorySync,
} from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import { getErrorMessage } from "@brains/utils/error";

export class DirectoryExportJobHandler {
  protected readonly logger: Logger;
  private directorySync: IDirectorySync;
  private readonly operationStatus:
    DirectorySyncOperationStatusService | undefined;

  constructor(
    logger: Logger,
    _context: DirectorySyncHost,
    directorySync: IDirectorySync,
    operationStatus?: DirectorySyncOperationStatusService,
  ) {
    this.logger = logger;
    this.directorySync = directorySync;
    this.operationStatus = operationStatus;
  }

  public async process(
    data: DirectoryExportJobData,
    jobId: string,
    progressReporter: ProgressContract,
  ): Promise<ExportResult> {
    this.logger.debug("Processing directory export job", { jobId, data });

    const startTime = Date.now();

    try {
      const result = await this.directorySync.exportEntitiesWithProgress(
        data.entityTypes,
        progressReporter,
        data.batchSize ?? 100,
      );

      this.logger.debug("Directory export job completed", {
        jobId,
        exported: result.exported,
        failed: result.failed,
        duration: Date.now() - startTime,
      });
      await this.operationStatus?.addExportResult(result);

      return result;
    } catch (error) {
      this.logger.error("Directory export job failed", { jobId, error });
      await this.operationStatus?.recordIssue({
        kind: "export",
        message: getErrorMessage(error, "Directory export failed"),
      });
      throw error;
    }
  }
}
