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
import {
  createImportResult,
  logImportSummary,
  recordImportReadError,
  recordSkippedImport,
} from "./import-result";

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

  const result = createImportResult();

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
      recordSkippedImport(result);
    }
    return;
  }

  try {
    const rawEntity = await deps.fileOperations.readEntity(filePath);

    await processEntityImport(deps, rawEntity, filePath, result);
  } catch (error) {
    recordImportReadError(deps.logger, filePath, error, result);
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
    recordSkippedImport(result);
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
