import { getErrorMessage } from "@brains/utils";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExportResult } from "../types";
import type { FileOperations } from "./file-operations";
import {
  createExportResult,
  logExportSummary,
  recordEntityExportResult,
  type EntityExportResult,
} from "./export-result";

export interface ExportPipelineDeps {
  entityService: IEntityService;
  logger: Logger;
  fileOperations: FileOperations;
  deleteOnFileRemoval: boolean;
  entityTypes?: string[] | undefined;
}

export async function exportEntities(
  deps: ExportPipelineDeps,
  entityTypes?: string[],
): Promise<ExportResult> {
  const typesToExport =
    entityTypes ?? deps.entityTypes ?? deps.entityService.getEntityTypes();

  deps.logger.debug("Exporting entities to directory", {
    entityTypes: typesToExport,
  });

  const result = createExportResult();

  for (const entityType of typesToExport) {
    const entities = await deps.entityService.listEntities({
      entityType: entityType,
      options: {
        limit: 1000,
      },
    });

    deps.logger.debug("Processing entity type for export", {
      entityType,
      count: entities.length,
    });

    for (const entity of entities) {
      const exportResult = await processEntityExport(deps, entity);
      recordEntityExportResult(deps.logger, result, entity, exportResult);
    }
  }

  logExportSummary(deps.logger, result);
  return result;
}

export async function processEntityExport(
  deps: ExportPipelineDeps,
  entity: BaseEntity,
): Promise<EntityExportResult> {
  try {
    const filePath = deps.fileOperations.getEntityFilePath(entity);
    if (!(await deps.fileOperations.fileExists(filePath))) {
      if (deps.deleteOnFileRemoval) {
        deps.logger.debug("File missing, deleting entity from DB", {
          entityId: entity.id,
          entityType: entity.entityType,
        });
        await deps.entityService.deleteEntity({
          entityType: entity.entityType,
          id: entity.id,
        });
        return { success: true, deleted: true };
      }
    }

    await deps.fileOperations.writeEntity(entity);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}
