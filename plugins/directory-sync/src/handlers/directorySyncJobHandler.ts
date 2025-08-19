import { z } from "zod";
import type { JobHandler } from "@brains/plugins";
import type {
  Logger,
  ProgressReporter,
  ServicePluginContext,
} from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type {
  DirectorySyncJobData,
  SyncResult,
  ImportResult,
  ExportResult,
} from "../types";

/**
 * Schema for directory sync job data
 */
const directorySyncJobSchema = z.object({
  operation: z.enum(["initial", "scheduled", "manual"]),
  paths: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  syncDirection: z.enum(["import", "export", "both"]).optional(),
});

/**
 * Job handler for full directory sync operations
 * Handles both import and export phases with progress reporting
 */
export class DirectorySyncJobHandler
  implements JobHandler<"directory-sync", DirectorySyncJobData, SyncResult>
{
  private logger: Logger;
  private directorySync: DirectorySync;

  constructor(
    logger: Logger,
    _context: ServicePluginContext,
    directorySync: DirectorySync,
  ) {
    this.logger = logger;
    this.directorySync = directorySync;
  }

  async process(
    data: DirectorySyncJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const syncDirection = data.syncDirection || "both";

    this.logger.info("Starting directory sync job", {
      jobId,
      operation: data.operation,
      syncDirection,
    });

    let importResult: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
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
        // Import only - report 100% after import
        await progressReporter.report({
          progress: 100,
          message: `Import complete: ${importResult.imported} imported`,
        });
      } else {
        // Both directions - report 50% after import
        await progressReporter.report({
          progress: 50,
          message: `Imported ${importResult.imported} entities`,
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

  validateAndParse(data: unknown): DirectorySyncJobData | null {
    try {
      const parsed = directorySyncJobSchema.parse(data);
      // Clean up undefined optional properties for exactOptionalPropertyTypes
      const result: DirectorySyncJobData = {
        operation: parsed.operation,
      };
      if (parsed.paths !== undefined) {
        result.paths = parsed.paths;
      }
      if (parsed.entityTypes !== undefined) {
        result.entityTypes = parsed.entityTypes;
      }
      if (parsed.syncDirection !== undefined) {
        result.syncDirection = parsed.syncDirection;
      }
      return result;
    } catch (error) {
      this.logger.error("Invalid sync job data", { error });
      return null;
    }
  }
}
