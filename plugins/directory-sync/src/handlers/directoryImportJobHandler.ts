import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import {
  directoryImportJobSchema,
  type ImportResult,
  type DirectoryImportJobData,
  type IDirectorySync,
} from "../types";

export class DirectoryImportJobHandler extends BaseJobHandler<
  "directory-import",
  DirectoryImportJobData,
  ImportResult
> {
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    _context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryImportJobSchema,
      jobTypeName: "directory-import",
    });
    this.directorySync = directorySync;
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

      return result;
    } catch (error) {
      this.logger.error("Directory import job failed", { jobId, error });
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
