import { getErrorMessage } from "@brains/utils";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExportResult } from "../types";
import type { FileOperations } from "./file-operations";

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

  const result: ExportResult = {
    exported: 0,
    failed: 0,
    errors: [],
  };

  for (const entityType of typesToExport) {
    const entities = await deps.entityService.listEntities(entityType, {
      limit: 1000,
    });

    deps.logger.debug("Processing entity type for export", {
      entityType,
      count: entities.length,
    });

    for (const entity of entities) {
      const exportResult = await processEntityExport(deps, entity);

      if (exportResult.success) {
        result.exported++;
        if (exportResult.deleted) {
          deps.logger.debug("Deleted entity from DB (file missing)", {
            entityType,
            id: entity.id,
          });
        }
      } else {
        result.failed++;
        result.errors.push({
          entityId: entity.id,
          entityType,
          error: exportResult.error ?? "Unknown error",
        });
        deps.logger.error("Failed to export entity", {
          entityType,
          id: entity.id,
          error: exportResult.error,
        });
      }
    }
  }

  deps.logger.debug("Export completed", result);
  return result;
}

export async function processEntityExport(
  deps: ExportPipelineDeps,
  entity: BaseEntity,
): Promise<{
  success: boolean;
  deleted?: boolean;
  error?: string;
}> {
  try {
    const filePath = deps.fileOperations.getEntityFilePath(entity);
    if (!deps.fileOperations.fileExists(filePath)) {
      if (deps.deleteOnFileRemoval) {
        deps.logger.debug("File missing, deleting entity from DB", {
          entityId: entity.id,
          entityType: entity.entityType,
        });
        await deps.entityService.deleteEntity(entity.entityType, entity.id);
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
