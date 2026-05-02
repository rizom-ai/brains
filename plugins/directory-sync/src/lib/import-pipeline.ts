import type { IEntityService, BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { ImportResult, RawEntity } from "../types";
import type { FileOperations } from "./file-operations";
import type { Quarantine } from "./quarantine";
import type { ImageJobQueueDeps } from "./image-job-queue";
import {
  getImportContentSkipMessage,
  getImportContentSkipReason,
} from "./import-content-filter";
import { deserializeImportEntity } from "./import-deserialization";
import { queueImportImageConversions } from "./import-image-conversions";
import { getImportPathDecision } from "./import-path-filter";
import { resolveInSyncPath } from "./path-utils";

export interface ImportPipelineDeps {
  entityService: IEntityService;
  logger: Logger;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  imageJobQueue: ImageJobQueueDeps;
  entityTypes?: string[] | undefined;
}

export async function importEntities(
  deps: ImportPipelineDeps,
  paths?: string[],
): Promise<ImportResult> {
  deps.logger.debug("Importing entities from directory");

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    quarantinedFiles: [],
    errors: [],
    jobIds: [],
  };

  const filesToProcess = paths ?? (await deps.fileOperations.getAllSyncFiles());

  for (const filePath of filesToProcess) {
    await importFile(deps, filePath, result);
  }

  logImportSummary(deps.logger, filesToProcess.length, result);
  return result;
}

async function importFile(
  deps: ImportPipelineDeps,
  filePath: string,
  result: ImportResult,
): Promise<void> {
  const pathDecision = getImportPathDecision(deps, filePath);
  if (pathDecision.skip) {
    if (pathDecision.countSkipped) {
      result.skipped++;
    }
    return;
  }

  try {
    const rawEntity = await deps.fileOperations.readEntity(filePath);

    await processEntityImport(deps, rawEntity, filePath, result);
  } catch (error) {
    // File disappeared between scan and read (e.g., git-sync pull race)
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      deps.logger.debug("File disappeared before import, skipping", {
        path: filePath,
      });
      result.skipped++;
      return;
    }

    result.failed++;
    result.errors.push({
      path: filePath,
      error: error instanceof Error ? error.message : "Failed to import entity",
    });
    deps.logger.error("Failed to import entity", {
      path: filePath,
      error,
    });
  }
}

async function processEntityImport(
  deps: ImportPipelineDeps,
  rawEntity: RawEntity,
  filePath: string,
  result: ImportResult,
): Promise<void> {
  const contentSkipReason = getImportContentSkipReason(rawEntity);
  if (contentSkipReason) {
    deps.logger.debug(getImportContentSkipMessage(contentSkipReason), {
      path: filePath,
      entityType: rawEntity.entityType,
    });
    result.skipped++;
    return;
  }

  queueImportImageConversions(deps.imageJobQueue, rawEntity, filePath);

  const parsedEntity = await deserializeImportEntity(
    deps,
    rawEntity,
    filePath,
    result,
  );
  if (!parsedEntity) {
    return;
  }

  // Database operations -- transient errors fail without quarantining
  try {
    const existing = await deps.entityService.getEntity(
      rawEntity.entityType,
      rawEntity.id,
    );

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

    const upsertResult = await deps.entityService.upsertEntity(entity);
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

function logImportSummary(
  logger: Logger,
  fileCount: number,
  result: ImportResult,
): void {
  if (fileCount > 1) {
    logger.debug("Import completed", {
      filesProcessed: fileCount,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      quarantined: result.quarantined,
    });
  } else {
    logger.debug("Import completed", result);
  }
}
