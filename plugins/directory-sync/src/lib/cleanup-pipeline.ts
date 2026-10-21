import type { BaseEntity, ContentVisibility } from "@brains/plugins";
import { internalFullScope } from "@brains/plugins";
import type { CleanupResult } from "../types";
import { EntityPlacementError } from "./entity-placement-error";
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
      options?: {
        limit?: number;
        offset?: number;
        filter?: { visibilityScope?: ContentVisibility };
      };
    }): Promise<BaseEntity[]>;
    deleteEntity(request: {
      entityType: string;
      id: string;
      options: { persistenceOrigin: "directory-sync" };
    }): Promise<boolean>;
  };
  logger: {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
  fileOperations: {
    assertEntityPlacement(entity: BaseEntity): void;
    getEntityFilePath(entity: BaseEntity): string;
    fileExists(filePath: string): Promise<boolean>;
  };
  deleteOnFileRemoval: boolean;
  entityTypes?: string[] | undefined;
  onEntityDeleted?: ((entity: BaseEntity) => void) | undefined;
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
    // Every page is read before anything is deleted: deleting while paging
    // by offset would shift the later pages and skip entities.
    const orphans = await findOrphans(deps, entityType, 0);
    for (const entity of orphans) {
      try {
        await deps.entityService.deleteEntity({
          entityType: entity.entityType,
          id: entity.id,
          options: { persistenceOrigin: "directory-sync" },
        });
        deps.onEntityDeleted?.(entity);
        recordCleanupDeleted(deps.logger, result, entity);
      } catch (error) {
        recordCleanupError(deps.logger, result, entity, error);
      }
    }
  }

  return result;
}

/** Entities read per page while looking for orphans. */
const ORPHAN_SCAN_PAGE = 1000;

/**
 * The entities of a type whose files are gone, from `offset` on, a page at a
 * time. A refused placement or a quarantined file keeps its entity.
 */
async function findOrphans(
  deps: CleanupPipelineDeps,
  entityType: string,
  offset: number,
): Promise<BaseEntity[]> {
  const page = await deps.entityService.listEntities({
    entityType,
    options: {
      limit: ORPHAN_SCAN_PAGE,
      offset,
      filter: {
        visibilityScope: internalFullScope(
          "directory sync cleanup spans all visibility tiers",
        ),
      },
    },
  });
  const orphans = await page.reduce<Promise<BaseEntity[]>>(
    async (found, entity) => {
      const kept = await found;
      return (await isOrphan(deps, entityType, entity))
        ? [...kept, entity]
        : kept;
    },
    Promise.resolve([]),
  );
  if (page.length < ORPHAN_SCAN_PAGE) return orphans;
  return [
    ...orphans,
    ...(await findOrphans(deps, entityType, offset + ORPHAN_SCAN_PAGE)),
  ];
}

async function isOrphan(
  deps: CleanupPipelineDeps,
  entityType: string,
  entity: BaseEntity,
): Promise<boolean> {
  try {
    deps.fileOperations.assertEntityPlacement(entity);
  } catch (error) {
    if (!(error instanceof EntityPlacementError)) throw error;
    deps.logger.info("Keeping entity with refused placement", {
      entityType,
      entityId: entity.id,
    });
    return false;
  }
  const filePath = deps.fileOperations.getEntityFilePath(entity);
  if (await deps.fileOperations.fileExists(filePath)) return false;
  // A quarantined file (renamed to .invalid) is not a user deletion; the
  // entity must survive until the file is repaired or removed.
  if (await deps.fileOperations.fileExists(`${filePath}.invalid`)) {
    deps.logger.info("Entity file is quarantined, keeping entity", {
      entityType: entity.entityType,
      entityId: entity.id,
    });
    return false;
  }
  return true;
}
