import type { BaseEntity, IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import type { ImportResult, RawEntity } from "../types";
import type { ImageJobQueueDeps } from "./image-job-queue";
import type { Quarantine } from "./quarantine";
import { resolveInSyncPath } from "./path-utils";

export interface ImportDeserializationDeps {
  entityService: IEntityService;
  logger: Logger;
  quarantine: Quarantine;
  imageJobQueue: ImageJobQueueDeps;
}

export async function deserializeImportEntity(
  deps: ImportDeserializationDeps,
  rawEntity: RawEntity,
  filePath: string,
  result: ImportResult,
): Promise<Partial<BaseEntity> | undefined> {
  try {
    return deps.entityService.deserializeEntity(
      rawEntity.content,
      rawEntity.entityType,
    );
  } catch (error) {
    if (deps.quarantine.isValidationError(error)) {
      await deps.quarantine.quarantineInvalidFile(
        filePath,
        error,
        result,
        (fp) => resolveInSyncPath(deps.imageJobQueue.syncPath, fp),
      );
      return undefined;
    }

    // Non-validation errors (e.g., "No adapter registered") are transient —
    // don't quarantine the file, just record the failure
    result.failed++;
    result.errors.push({
      path: filePath,
      error:
        error instanceof Error
          ? `Deserialization error (file not quarantined): ${error.message}`
          : String(error),
    });
    deps.logger.warn(
      "Failed to deserialize entity (transient error, not quarantined)",
      {
        path: filePath,
        entityType: rawEntity.entityType,
        id: rawEntity.id,
        error: getErrorMessage(error),
      },
    );
    return undefined;
  }
}
