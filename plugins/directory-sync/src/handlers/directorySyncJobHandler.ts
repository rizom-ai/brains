import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  directorySyncJobSchema,
  type DirectorySyncJobData,
  type SyncResult,
  type ImportResult,
  type ExportResult,
  type IDirectorySync,
} from "../types";
import { waitForImportJobs } from "../lib/import-job-polling";

export class DirectorySyncJobHandler extends BaseJobHandler<
  "directory-sync",
  DirectorySyncJobData,
  SyncResult
> {
  private directorySync: IDirectorySync;
  private context: ServicePluginContext;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directorySyncJobSchema,
      jobTypeName: "directory-sync",
    });
    this.context = context;
    this.directorySync = directorySync;
  }

  async process(
    data: DirectorySyncJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const syncDirection = data.syncDirection ?? "both";

    this.logger.info("Starting directory sync job", {
      jobId,
      operation: data.operation,
      syncDirection,
    });

    let importResult: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    };

    let exportResult: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    if (syncDirection !== "export") {
      await progressReporter.report({
        progress: 10,
        message: "Scanning directory for changes",
      });

      importResult = await this.importWithProgress(
        data.paths,
        progressReporter,
      );

      if (syncDirection === "import") {
        await this.waitForImportJobs(importResult.jobIds, progressReporter);
        await progressReporter.report({
          progress: 100,
          message: `Import complete: ${importResult.imported} imported`,
        });
      } else {
        await progressReporter.report({
          progress: 50,
          message: `Imported ${importResult.imported} entities`,
        });
        await this.waitForImportJobs(importResult.jobIds, progressReporter);
        await progressReporter.report({
          progress: 56,
          message: `Processing complete, starting export`,
        });
      }
    }

    if (syncDirection !== "import") {
      const startProgress = syncDirection === "export" ? 10 : 60;
      await progressReporter.report({
        progress: startProgress,
        message: "Exporting entities to directory",
      });

      exportResult = await this.exportWithProgress(
        data.entityTypes,
        progressReporter,
      );

      await progressReporter.report({
        progress: 100,
        message:
          syncDirection === "export"
            ? `Export complete: ${exportResult.exported} exported`
            : `Sync complete: ${importResult.imported} imported, ${exportResult.exported} exported`,
      });
    }

    const duration = Date.now() - startTime;

    this.logger.info("Directory sync job completed", {
      jobId,
      duration,
      imported: importResult.imported,
      exported: exportResult.exported,
    });

    return {
      import: importResult,
      export: exportResult,
      duration,
    };
  }

  private async importWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
  ): Promise<ImportResult> {
    try {
      return await this.directorySync.importEntitiesWithProgress(
        paths,
        reporter,
        10, // Default batch size
      );
    } catch (error) {
      this.logger.error("Import phase failed", { error });
      throw error;
    }
  }

  private async exportWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
  ): Promise<ExportResult> {
    try {
      return await this.directorySync.exportEntitiesWithProgress(
        entityTypes,
        reporter,
        10, // Default batch size
      );
    } catch (error) {
      this.logger.error("Export phase failed", { error });
      throw error;
    }
  }

  /** Wait for import jobs to complete before export to prevent stale reads */
  private waitForImportJobs(
    jobIds: string[],
    reporter: ProgressReporter,
  ): Promise<void> {
    return waitForImportJobs({
      jobIds,
      entityService: this.context.entityService,
      reporter,
      logger: this.logger,
    });
  }

  protected override summarizeDataForLog(
    data: DirectorySyncJobData,
  ): Record<string, unknown> {
    return {
      operation: data.operation,
      syncDirection: data.syncDirection,
    };
  }
}
