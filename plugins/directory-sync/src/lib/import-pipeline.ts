import type { ImportLimits } from "./directory-options";
import type { BaseEntity, EntityServiceClient } from "@brains/plugins";
import type { DirectoryImportPlan } from "../types/jobs";
import { captureImportPlan } from "./import-plan";
import { internalFullScope } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
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
import { OversizedFileError } from "./oversized-file-error";
import {
  createImportResult,
  logImportSummary,
  recordImportIssue,
  recordImportReadError,
  recordSkippedImport,
} from "./import-result";

export interface ImportPipelineDeps extends ImportLimits {
  entityService: EntityServiceClient;
  logger: Logger;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  imageJobQueue: ImageJobQueueDeps;
  entityTypes?: string[] | undefined;
}

export async function importEntities(
  deps: ImportPipelineDeps,
  paths?: string[],
  plan?: DirectoryImportPlan,
): Promise<ImportResult> {
  deps.logger.debug("Importing entities from directory");

  const result = createImportResult();

  const filesToProcess = paths ?? (await deps.fileOperations.getAllSyncFiles());

  const admitted =
    plan ??
    (await captureImportPlan(
      deps.entityService,
      deps.fileOperations,
      filesToProcess.filter((path) => !getImportPathDecision(deps, path).skip),
    ));
  for (const filePath of filesToProcess) {
    await importFile(deps, filePath, result, admitted);
  }

  logImportSummary(deps.logger, filesToProcess.length, result);
  return result;
}

async function importFile(
  deps: ImportPipelineDeps,
  filePath: string,
  result: ImportResult,
  plan: DirectoryImportPlan,
): Promise<void> {
  const pathDecision = getImportPathDecision(deps, filePath);
  if (pathDecision.skip) {
    if (pathDecision.countSkipped) {
      recordSkippedImport(result);
    }
    return;
  }

  try {
    const admission = plan.find((entry) => entry.path === filePath);
    if (!admission) throw new Error("Missing directory import precondition");
    const snapshot = await deps.entityService.getEntityWriteSnapshot({
      entityType: admission.entityType,
      id: admission.id,
      visibilityScope: internalFullScope(
        "check directory import write preconditions",
      ),
    });
    if ((snapshot?.revision ?? null) !== admission.expectedRevision) {
      recordSkippedImport(result);
      recordImportIssue(
        result,
        filePath,
        "Skipped stale import: entity changed after this sync was queued.",
      );
      return;
    }
    // Asset-backed types store raw bytes, so they carry their own limit.
    const assetBacked =
      deps.entityService.getEntityTypeConfig(admission.entityType)
        .binaryStorage === "asset";
    const rawEntity = await deps.fileOperations.readEntity(
      filePath,
      assetBacked ? deps.maxAssetImportBytes : deps.maxImportFileBytes,
    );

    if (
      rawEntity.entityType !== admission.entityType ||
      rawEntity.id !== admission.id
    )
      throw new Error("Directory import destination changed after admission");
    await processEntityImport(deps, rawEntity, filePath, result, snapshot);
  } catch (error) {
    if (error instanceof OversizedFileError) {
      recordSkippedImport(result);
      recordImportIssue(result, filePath, error.message);
      return;
    }
    recordImportReadError(deps.logger, filePath, error, result);
  }
}

async function processEntityImport(
  deps: ImportPipelineDeps,
  rawEntity: RawEntity,
  filePath: string,
  result: ImportResult,
  snapshot: Awaited<ReturnType<EntityServiceClient["getEntityWriteSnapshot"]>>,
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

  const existing = snapshot?.entity ?? null;
  if (existing && canSkipBeforeDeserialization(deps, existing, rawEntity)) {
    recordSkippedImport(result);
    return;
  }

  const parsedEntity = await deserializeImportEntity(
    deps,
    rawEntity,
    filePath,
    result,
  );
  if (!parsedEntity) {
    return;
  }

  const imported = result.imported;
  await persistImportEntity(
    deps,
    rawEntity,
    parsedEntity,
    filePath,
    result,
    snapshot,
  );
  if (result.imported > imported)
    queueImportImageConversions(
      deps.imageJobQueue,
      rawEntity,
      filePath,
      deps.entityService.getEntityTypeConfig(rawEntity.entityType),
    );
}

function canSkipBeforeDeserialization(
  deps: ImportPipelineDeps,
  existing: BaseEntity,
  rawEntity: RawEntity,
): boolean {
  if (deps.fileOperations.shouldUpdateEntity(existing, rawEntity)) {
    return false;
  }

  return (
    rawEntity.entityType !== "document" ||
    Bun.deepEquals(existing.metadata, rawEntity.metadata ?? {})
  );
}
