import { getErrorMessage } from "@brains/utils";
import type { BaseEntity } from "@brains/plugins";

/**
 * Narrow deps interface — only the methods cleanup actually uses.
 */
export interface CleanupPipelineDeps {
  entityService: {
    getEntityTypes(): string[];
    listEntities(
      entityType: string,
      options?: { limit?: number },
    ): Promise<BaseEntity[]>;
    deleteEntity(entityType: string, id: string): Promise<boolean>;
  };
  logger: {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  fileOperations: {
    getEntityFilePath(entity: BaseEntity): string;
    fileExists(filePath: string): boolean;
  };
  deleteOnFileRemoval: boolean;
  entityTypes?: string[] | undefined;
}

export interface CleanupResult {
  deleted: number;
  errors: Array<{ entityId: string; entityType: string; error: string }>;
}

/**
 * Remove DB entities whose files no longer exist on disk.
 *
 * Runs after import to catch files deleted via git pull (before the
 * file watcher started). Only deletes when `deleteOnFileRemoval` is true.
 */
export async function removeOrphanedEntities(
  deps: CleanupPipelineDeps,
): Promise<CleanupResult> {
  if (!deps.deleteOnFileRemoval) {
    return { deleted: 0, errors: [] };
  }

  const typesToCheck = deps.entityTypes ?? deps.entityService.getEntityTypes();

  const result: CleanupResult = { deleted: 0, errors: [] };

  for (const entityType of typesToCheck) {
    const entities = await deps.entityService.listEntities(entityType, {
      limit: 1000,
    });

    for (const entity of entities) {
      const filePath = deps.fileOperations.getEntityFilePath(entity);
      if (!deps.fileOperations.fileExists(filePath)) {
        try {
          await deps.entityService.deleteEntity(entity.entityType, entity.id);
          result.deleted++;
          deps.logger.debug("Deleted orphaned entity (file missing)", {
            entityType,
            id: entity.id,
          });
        } catch (error) {
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: getErrorMessage(error),
          });
          deps.logger.error("Failed to delete orphaned entity", {
            entityType,
            id: entity.id,
            error: getErrorMessage(error),
          });
        }
      }
    }
  }

  return result;
}
