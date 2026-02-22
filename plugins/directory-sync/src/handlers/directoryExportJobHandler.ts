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
  private context: ServicePluginContext;
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryExportJobSchema,
      jobTypeName: "directory-export",
    });
    this.context = context;
    this.directorySync = directorySync;
  }

  public async process(
    data: DirectoryExportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ExportResult> {
    this.logger.debug("Processing directory export job", { jobId, data });

    const startTime = Date.now();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    try {
      const typesToExport =
        data.entityTypes ?? this.context.entityService.getEntityTypes();

      this.logger.debug("Starting export", {
        jobId,
        entityTypes: typesToExport,
      });

      await progressReporter.report({
        message: `Starting export of ${typesToExport.length} entity types`,
        progress: 0,
        total: typesToExport.length,
      });

      for (const [index, entityType] of typesToExport.entries()) {
        await this.exportEntityType(
          entityType,
          data.batchSize ?? 100,
          jobId,
          result,
        );

        await progressReporter.report({
          message: `Exported ${index + 1}/${typesToExport.length} entity types (${result.exported} entities)`,
          progress: index + 1,
          total: typesToExport.length,
        });
      }

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

  private async exportEntityType(
    entityType: string,
    batchSize: number,
    jobId: string,
    result: ExportResult,
  ): Promise<void> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const entities = await this.context.entityService.listEntities(
        entityType,
        {
          limit: batchSize,
          offset,
        },
      );

      if (entities.length === 0) {
        hasMore = false;
        break;
      }

      const batchPromises = entities.map(async (entity) => {
        const exportResult =
          await this.directorySync.processEntityExport(entity);

        if (exportResult.success) {
          result.exported++;
        } else {
          result.failed++;
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: exportResult.error ?? "Unknown error",
          });
        }

        return exportResult;
      });

      await Promise.all(batchPromises);

      this.logger.debug("Export progress", {
        jobId,
        entityType,
        processed: offset + entities.length,
        exported: result.exported,
        failed: result.failed,
      });

      offset += batchSize;
      hasMore = entities.length === batchSize;
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
