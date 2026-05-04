import type { BaseEntity } from "@brains/plugins";
import type { CleanupResult } from "../types";
import {
  createCleanupResult,
  recordCleanupDeleted,
  recordCleanupError,
} from "./cleanup-result";

/**
 * Narrow deps interface — only the methods cleanup actually uses.
 */
export interface CleanupPipelineDeps {
  entityService: {
    getEntityTypes(): string[];
    listEntities(request: {
      entityType: string;
      options?: { limit?: number };
    }): Promise<BaseEntity[]>;
    deleteEntity(entityType: string, id: string): Promise<boolean>;
  };
  logger: {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  fileOperations: {
    getEntityFilePath(entity: BaseEntity): string;
    fileExists(filePath: string): Promise<boolean>;
  };
  deleteOnFileRemoval: boolean;
  entityTypes?: string[] | undefined;
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
    return createCleanupResult();
  }

  const typesToCheck = deps.entityTypes ?? deps.entityService.getEntityTypes();

  const result = createCleanupResult();

  for (const entityType of typesToCheck) {
    const entities = await deps.entityService.listEntities({
      entityType,
      options: {
        limit: 1000,
      },
    });

    for (const entity of entities) {
      const filePath = deps.fileOperations.getEntityFilePath(entity);
      if (!(await deps.fileOperations.fileExists(filePath))) {
        try {
          await deps.entityService.deleteEntity(entity.entityType, entity.id);
          recordCleanupDeleted(deps.logger, result, entity);
        } catch (error) {
          recordCleanupError(deps.logger, result, entity, error);
        }
      }
    }
  }

  return result;
}
