import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import { getErrorMessage, computeContentHash } from "@brains/utils";
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
  private context: ServicePluginContext;
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryImportJobSchema,
      jobTypeName: "directory-import",
    });
    this.context = context;
    this.directorySync = directorySync;
  }

  public async process(
    data: DirectoryImportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImportResult> {
    this.logger.debug("Processing directory import job", { jobId, data });

    const startTime = Date.now();
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    };

    try {
      const filesToImport =
        data.paths ?? this.directorySync.getAllMarkdownFiles();

      this.logger.debug("Starting import", {
        jobId,
        totalFiles: filesToImport.length,
      });

      await progressReporter.report({
        message: `Starting import of ${filesToImport.length} files`,
        progress: 0,
        total: filesToImport.length,
      });

      const batchSize = data.batchSize ?? 100;
      for (let i = 0; i < filesToImport.length; i += batchSize) {
        const batch = filesToImport.slice(i, i + batchSize);
        await this.importBatch(batch, jobId, result, i, filesToImport.length);

        const processed = Math.min(i + batchSize, filesToImport.length);
        await progressReporter.report({
          message: `Imported ${processed}/${filesToImport.length} files (${result.imported} successful, ${result.failed} failed)`,
          progress: processed,
          total: filesToImport.length,
        });
      }

      this.logger.debug("Directory import job completed", {
        jobId,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      this.logger.error("Directory import job failed", { jobId, error });
      throw error;
    }
  }

  private async importBatch(
    batch: string[],
    jobId: string,
    result: ImportResult,
    startIndex: number,
    totalFiles: number,
  ): Promise<void> {
    const batchPromises = batch.map(async (filePath) => {
      try {
        const rawEntity = await this.directorySync.fileOps.readEntity(filePath);

        const entityTypes = this.context.entityService.getEntityTypes();
        if (!entityTypes.includes(rawEntity.entityType)) {
          result.skipped++;
          return { success: false, skipped: true };
        }

        try {
          const parsedEntity = this.context.entityService.deserializeEntity(
            rawEntity.content,
            rawEntity.entityType,
          );

          const existing = await this.context.entityService.getEntity(
            rawEntity.entityType,
            rawEntity.id,
          );

          if (existing) {
            const existingTime = new Date(existing.updated).getTime();
            const newTime = rawEntity.updated.getTime();
            const fileContentHash = computeContentHash(rawEntity.content);
            const contentDiffers = existing.contentHash !== fileContentHash;

            if (existingTime < newTime || contentDiffers) {
              const entityUpdate = {
                ...existing,
                content: rawEntity.content,
                ...parsedEntity,
                id: rawEntity.id,
                entityType: rawEntity.entityType,
                updated: rawEntity.updated.toISOString(),
              };
              await this.context.entityService.updateEntity(entityUpdate);
              result.imported++;
            } else {
              result.skipped++;
            }
          } else {
            const entityCreate = {
              id: rawEntity.id,
              entityType: rawEntity.entityType,
              content: rawEntity.content,
              ...parsedEntity,
              metadata: parsedEntity.metadata ?? {},
              created: rawEntity.created.toISOString(),
              updated: rawEntity.updated.toISOString(),
            };
            await this.context.entityService.createEntity(entityCreate);
            result.imported++;
          }
          return { success: true };
        } catch {
          result.skipped++;
          return { success: false, skipped: true };
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: filePath,
          error: getErrorMessage(error),
        });
        return { success: false, error };
      }
    });

    await Promise.all(batchPromises);

    // Log progress
    this.logger.debug("Import progress", {
      jobId,
      processed: startIndex + batch.length,
      total: totalFiles,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });
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
