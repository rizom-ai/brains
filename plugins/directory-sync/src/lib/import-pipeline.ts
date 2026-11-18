import { computeContentHash } from "@brains/utils/hash";
import {
  CONFLICT_ENTITY_TYPE,
  CONFLICT_IMAGE_ENTITY_TYPE,
} from "@brains/contracts";
import type { SyncConflicts } from "./sync-base";
import type { ImportLimits } from "./directory-options";
import {
  type ServiceEntityMirrorClient,
  internalFullScope,
} from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type { DirectoryImportPlan } from "../types/jobs";
import { captureImportPlan } from "./import-plan";
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
import { importDocumentFile } from "./document-file-import";
import { isDocumentFile } from "./document-file-utils";
import { importImageFile } from "./image-file-import";
import { isImageFile } from "./image-file-utils";
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
  entityService: ServiceEntityMirrorClient;
  logger: Logger;
  fileOperations: FileOperations;
  quarantine: Quarantine;
  imageJobQueue: ImageJobQueueDeps;
  entityTypes?: string[] | undefined;
  conflicts?: SyncConflicts | undefined;
  restoreEntityFile?: ((entity: BaseEntity) => Promise<void>) | undefined;
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
    if (admission.entityType === CONFLICT_ENTITY_TYPE) {
      await restoreConflictFile(deps, filePath, admission, result);
      return;
    }
    if (admission.entityType === CONFLICT_IMAGE_ENTITY_TYPE) {
      // Image conflicts have no files: none is ever read as one.
      recordSkippedImport(result);
      recordImportIssue(
        result,
        filePath,
        "Not imported: image conflicts are kept only by the brain.",
      );
      return;
    }
    const snapshot = await deps.entityService.getEntityWriteSnapshot({
      entityType: admission.entityType,
      id: admission.id,
      visibilityScope: internalFullScope(
        "check directory import write preconditions",
      ),
    });
    // With a recorded base, the base decides what a file over a changed
    // entity is: stale, or a conflict. Without one, a change since the sync
    // was queued still stops the import, as before bases existed.
    const base = await deps.conflicts?.base.get(
      admission.entityType,
      admission.id,
    );
    if (
      base === undefined &&
      (snapshot?.revision ?? null) !== admission.expectedRevision
    ) {
      recordSkippedImport(result);
      recordImportIssue(
        result,
        filePath,
        "Skipped stale import: entity changed after this sync was queued.",
      );
      return;
    }
    const placedPath = await placeContainedFile(deps, filePath, result);
    if (placedPath === undefined) return;
    // Asset-backed types store raw bytes, so they carry their own limit.
    const assetBacked =
      deps.entityService.getEntityTypeConfig(admission.entityType)
        .binaryStorage === "asset";
    if (assetBacked && isImageFile(placedPath)) {
      await importImageFile(deps, placedPath, admission, snapshot, result);
      return;
    }
    if (assetBacked && isDocumentFile(placedPath)) {
      await importDocumentFile(deps, placedPath, admission, snapshot, result);
      return;
    }
    const rawEntity = await deps.fileOperations.readEntity(
      placedPath,
      assetBacked ? deps.maxAssetImportBytes : deps.maxImportFileBytes,
    );

    if (
      rawEntity.entityType !== admission.entityType ||
      rawEntity.id !== admission.id
    )
      throw new Error("Directory import destination changed after admission");
    await processEntityImport(deps, rawEntity, placedPath, result, snapshot);
  } catch (error) {
    if (error instanceof OversizedFileError) {
      recordSkippedImport(result);
      recordImportIssue(result, filePath, error.message);
      return;
    }
    recordImportReadError(deps.logger, filePath, error, result);
  }
}

/**
 * The path to import a file from. A contained type's file outside its
 * container's folder moves to the path export and cleanup look for it at, so
 * the entity keeps a file. A file already at that path stays the entity's:
 * the misplaced one is left where it is, unimported (undefined).
 */
async function placeContainedFile(
  deps: ImportPipelineDeps,
  filePath: string,
  result: ImportResult,
): Promise<string | undefined> {
  const canonicalPath = deps.fileOperations.getMisplacedContainedPath(filePath);
  if (canonicalPath === undefined) return filePath;
  if (await deps.fileOperations.moveEntityFile(filePath, canonicalPath)) {
    deps.logger.info("Moved a contained entity's file into its container", {
      path: filePath,
      canonicalPath,
    });
    return canonicalPath;
  }
  deps.logger.warn("Kept a misplaced file: its placement already holds one", {
    path: filePath,
    canonicalPath,
  });
  recordSkippedImport(result);
  recordImportIssue(
    result,
    filePath,
    `Not imported: this file belongs at ${canonicalPath}, which already holds one.`,
  );
  return undefined;
}

async function processEntityImport(
  deps: ImportPipelineDeps,
  rawEntity: RawEntity,
  filePath: string,
  result: ImportResult,
  snapshot: Awaited<
    ReturnType<ServiceEntityMirrorClient["getEntityWriteSnapshot"]>
  >,
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
    // The file is the entity's stored form: that is their base.
    await deps.conflicts?.base.set(
      existing.entityType,
      existing.id,
      existing.contentHash,
      computeContentHash(rawEntity.content),
    );
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

/**
 * A conflict is fixed once written: its file is never imported. A file that
 * was edited is put back as the brain wrote it; one no conflict stands
 * behind is left for a person to look at.
 */
async function restoreConflictFile(
  deps: ImportPipelineDeps,
  filePath: string,
  admission: { entityType: string; id: string },
  result: ImportResult,
): Promise<void> {
  recordSkippedImport(result);
  const conflict = await deps.entityService.getEntityRaw({
    entityType: admission.entityType,
    id: admission.id,
    visibilityScope: internalFullScope("restore a conflict's file"),
    source: true,
  });
  if (!conflict) {
    recordImportIssue(
      result,
      filePath,
      "Not imported: conflicts are written only by the brain, and this file belongs to none.",
    );
    return;
  }
  await deps.fileOperations.writeEntity(conflict);
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
