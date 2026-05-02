import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
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
import { persistImportEntity } from "./import-persistence";

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

  await persistImportEntity(deps, rawEntity, parsedEntity, filePath, result);
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
