import { getErrorMessage } from "@brains/utils";
import type { BaseEntity, ContentVisibility } from "@brains/plugins";
import { internalFullScope } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExportResult } from "../types";

import {
  createExportResult,
  logExportSummary,
  recordEntityExportResult,
  type EntityExportResult,
} from "./export-result";

export interface ExportPipelineDeps {
  entityService: {
    getEntityTypes(): string[];
    listEntities(request: {
      entityType: string;
      options?: {
        limit?: number;
        filter?: { visibilityScope?: ContentVisibility };
      };
    }): Promise<BaseEntity[]>;
    deleteEntity(request: { entityType: string; id: string }): Promise<boolean>;
  };
  logger: Logger;
  fileOperations: {
    getEntityFilePath(entity: BaseEntity): string;
    fileExists(filePath: string): Promise<boolean>;
    writeEntity(entity: BaseEntity): Promise<void>;
  };
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
        filter: {
          visibilityScope: internalFullScope(
            "directory sync exports entities across all visibility tiers",
          ),
        },
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
