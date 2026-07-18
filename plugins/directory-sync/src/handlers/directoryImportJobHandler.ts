import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  directoryImportJobSchema,
  type ImportResult,
  type DirectoryImportJobData,
  type IDirectorySync,
} from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";

export class DirectoryImportJobHandler extends BaseJobHandler<
  "directory-import",
  DirectoryImportJobData,
  ImportResult
> {
  private directorySync: IDirectorySync;
  private readonly operationStatus:
    DirectorySyncOperationStatusService | undefined;

  constructor(
    logger: Logger,
    _context: ServicePluginContext,
    directorySync: IDirectorySync,
    operationStatus?: DirectorySyncOperationStatusService,
  ) {
    super(logger, {
      schema: directoryImportJobSchema,
      jobTypeName: "directory-import",
    });
    this.directorySync = directorySync;
    this.operationStatus = operationStatus;
  }

  public async process(
    data: DirectoryImportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImportResult> {
    this.logger.debug("Processing directory import job", { jobId, data });

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
        message:
          error instanceof Error ? error.message : "Directory import failed",
      });
      throw error;
    }
  }

  protected override summarizeDataForLog(
    data: DirectoryImportJobData,
  ): Record<string, unknown> {
    return {
      pathCount: data.paths?.length ?? "all",
      batchSize: data.batchSize,
    };
  }
}
