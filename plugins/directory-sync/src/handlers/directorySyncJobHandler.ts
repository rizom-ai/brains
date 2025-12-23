import { BaseJobHandler } from "@brains/job-queue";
import type {
  Logger,
  ProgressReporter,
  ServicePluginContext,
} from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import {
  directorySyncJobSchema,
  type DirectorySyncJobData,
  type SyncResult,
  type ImportResult,
  type ExportResult,
} from "../types";

/**
 * Job handler for full directory sync operations
 * Handles both import and export phases with progress reporting
 */
export class DirectorySyncJobHandler extends BaseJobHandler<
  "directory-sync",
  DirectorySyncJobData,
  SyncResult
> {
  private directorySync: DirectorySync;
  private context: ServicePluginContext;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: DirectorySync,
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

    // Import phase
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
        // Import only - wait for jobs and report 100%
        await this.waitForImportJobs(importResult.jobIds, progressReporter);
        await progressReporter.report({
          progress: 100,
          message: `Import complete: ${importResult.imported} imported`,
        });
      } else {
        // Both directions - wait for import jobs before export
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

    // Export phase
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

      // Always report 100% after export phase
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

  /**
   * Wait for import jobs to complete before export
   * This prevents race condition where export reads stale data from DB
   */
  private async waitForImportJobs(
    jobIds: string[],
    reporter: ProgressReporter,
  ): Promise<void> {
    if (jobIds.length === 0) {
      return;
    }

    this.logger.debug(`Waiting for ${jobIds.length} import jobs to complete`);

    const { entityService } = this.context;
    const maxWaitTime = 60000; // 60 seconds max
    const pollInterval = 200; // Poll every 200ms
    const startTime = Date.now();

    const pollJobs = async (): Promise<void> => {
      // Check all jobs
      const statuses = await Promise.all(
        jobIds.map((id) => entityService.getAsyncJobStatus(id)),
      );

      // Count completed/failed jobs
      const completed = statuses.filter(
        (s) => s && (s.status === "completed" || s.status === "failed"),
      ).length;

      // All done!
      if (completed === jobIds.length) {
        this.logger.debug("All import jobs completed");
        return;
      }

      // Timeout check
      if (Date.now() - startTime > maxWaitTime) {
        this.logger.warn(
          `Timeout waiting for import jobs (${completed}/${jobIds.length} completed)`,
        );
        return;
      }

      // Report progress
      const percentage = Math.round((completed / jobIds.length) * 100);
      await reporter.report({
        progress: 50 + Math.round(percentage * 0.05), // 50-55% range
        message: `Processing ${completed}/${jobIds.length} entities`,
      });

      // Wait and poll again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      return pollJobs();
    };

    return pollJobs();
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
