import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import {
  directoryExportJobSchema,
  type ExportResult,
  type DirectoryExportJobData,
  type IDirectorySync,
} from "../types";

export class DirectoryExportJobHandler extends BaseJobHandler<
  "directory-export",
  DirectoryExportJobData,
  ExportResult
> {
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    _context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryExportJobSchema,
      jobTypeName: "directory-export",
    });
    this.directorySync = directorySync;
  }

  public async process(
    data: DirectoryExportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
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

      return result;
    } catch (error) {
      this.logger.error("Directory export job failed", { jobId, error });
      throw error;
    }
  }

  protected override summarizeDataForLog(
    data: DirectoryExportJobData,
  ): Record<string, unknown> {
    return {
      entityTypes: data.entityTypes ?? "all",
      batchSize: data.batchSize,
    };
  }
}
