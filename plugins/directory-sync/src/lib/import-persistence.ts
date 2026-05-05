import type { BaseEntity, IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { ImportResult, RawEntity } from "../types";
import type { FileOperations } from "./file-operations";
import type { ImageJobQueueDeps } from "./image-job-queue";
import { resolveInSyncPath } from "./path-utils";
import type { Quarantine } from "./quarantine";

export interface ImportPersistenceDeps {
  entityService: IEntityService;
  logger: Logger;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  imageJobQueue: ImageJobQueueDeps;
}

export async function persistImportEntity(
  deps: ImportPersistenceDeps,
  rawEntity: RawEntity,
  parsedEntity: Partial<BaseEntity>,
  filePath: string,
  result: ImportResult,
): Promise<void> {
  try {
    const existing = await deps.entityService.getEntity({
      entityType: rawEntity.entityType,
      id: rawEntity.id,
    });

    if (
      existing &&
      !deps.fileOperations.shouldUpdateEntity(existing, rawEntity)
    ) {
      result.skipped++;
      return;
    }

    // Spread parsedEntity first so type-specific fields (e.g., title, status
    // for decks) are preserved, then override with canonical BaseEntity fields.
    const entity: BaseEntity = {
      ...parsedEntity,
      id: parsedEntity.id ?? rawEntity.id,
      entityType: parsedEntity.entityType ?? rawEntity.entityType,
      content: parsedEntity.content ?? rawEntity.content,
      metadata: parsedEntity.metadata ?? {},
      created: existing?.created ?? rawEntity.created.toISOString(),
      updated: rawEntity.updated.toISOString(),
      contentHash: "",
    };
    // Store canonical hash so auto-sync writes don't trigger a re-import:
    // after auto-sync writes serializeEntity(entity) to disk, the file hash
    // matches this hash and shouldUpdateEntity returns false.
    entity.contentHash = computeContentHash(
      deps.entityService.serializeEntity(entity),
    );

    const upsertResult = await deps.entityService.upsertEntity({
      entity: entity,
    });
    result.imported++;
    result.jobIds.push(upsertResult.jobId);
    deps.logger.debug("Imported entity from directory", {
      path: filePath,
      entityType: rawEntity.entityType,
      id: rawEntity.id,
      jobId: upsertResult.jobId,
    });

    await deps.quarantine.markAsRecoveredIfNeeded(filePath);
  } catch (error) {
    if (deps.quarantine.isValidationError(error)) {
      await deps.quarantine.quarantineInvalidFile(
        filePath,
        error,
        result,
        (fp) => resolveInSyncPath(deps.imageJobQueue.syncPath, fp),
      );
      return;
    }

    result.failed++;
    result.errors.push({
      path: filePath,
      error:
        error instanceof Error
          ? `Transient error (file not quarantined): ${error.message}`
          : String(error),
    });
    deps.logger.warn(
      "Failed to import entity (transient error, not quarantined)",
      {
        path: filePath,
        entityType: rawEntity.entityType,
        id: rawEntity.id,
        error: getErrorMessage(error),
      },
    );
  }
}
