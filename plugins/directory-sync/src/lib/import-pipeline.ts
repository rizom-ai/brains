import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { computeContentHash } from "@brains/utils";
import type { ImportResult, RawEntity } from "../types";
import type { FileOperations } from "./file-operations";
import type { Quarantine } from "./quarantine";
import type { ImageJobQueueDeps } from "./image-job-queue";
import {
  queueCoverImageConversionIfNeeded,
  queueInlineImageConversionIfNeeded,
} from "./image-job-queue";

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

  const filesToProcess = paths ?? deps.fileOperations.getAllSyncFiles();

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
  if (filePath.endsWith(".invalid")) {
    return;
  }

  try {
    const rawEntity = await deps.fileOperations.readEntity(filePath);

    if (deps.entityTypes && !deps.entityTypes.includes(rawEntity.entityType)) {
      result.skipped++;
      return;
    }

    await processEntityImport(deps, rawEntity, filePath, result);
  } catch {
    const importError = new Error("Failed to import entity from file");
    result.failed++;
    result.errors.push({
      path: filePath,
      error: importError.message,
    });
    deps.logger.error("Failed to import entity", {
      path: filePath,
      error: importError,
    });
  }
}

async function processEntityImport(
  deps: ImportPipelineDeps,
  rawEntity: RawEntity,
  filePath: string,
  result: ImportResult,
): Promise<void> {
  // Queue non-blocking image conversions
  queueCoverImageConversionIfNeeded(
    deps.imageJobQueue,
    rawEntity.content,
    filePath,
  );
  queueInlineImageConversionIfNeeded(
    deps.imageJobQueue,
    rawEntity.content,
    filePath,
    rawEntity.id,
  );

  // Deserialize -- validation errors quarantine the file
  let parsedEntity;
  try {
    parsedEntity = deps.entityService.deserializeEntity(
      rawEntity.content,
      rawEntity.entityType,
    );
  } catch (error) {
    deps.quarantine.quarantineInvalidFile(filePath, error, result, (fp) =>
      fp.startsWith(deps.imageJobQueue.syncPath)
        ? fp
        : `${deps.imageJobQueue.syncPath}/${fp}`,
    );
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

    const entity = {
      id: rawEntity.id,
      entityType: rawEntity.entityType,
      content: rawEntity.content,
      contentHash: computeContentHash(rawEntity.content),
      ...parsedEntity,
      metadata: parsedEntity.metadata ?? {},
      created: existing?.created ?? rawEntity.created.toISOString(),
      updated: rawEntity.updated.toISOString(),
    };

    const upsertResult = await deps.entityService.upsertEntity(entity);
    result.imported++;
    result.jobIds.push(upsertResult.jobId);
    deps.logger.debug("Imported entity from directory", {
      path: filePath,
      entityType: rawEntity.entityType,
      id: rawEntity.id,
      jobId: upsertResult.jobId,
    });

    deps.quarantine.markAsRecoveredIfNeeded(filePath);
  } catch (error) {
    if (deps.quarantine.isValidationError(error)) {
      deps.quarantine.quarantineInvalidFile(filePath, error, result, (fp) =>
        fp.startsWith(deps.imageJobQueue.syncPath)
          ? fp
          : `${deps.imageJobQueue.syncPath}/${fp}`,
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
        error: error instanceof Error ? error.message : String(error),
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
