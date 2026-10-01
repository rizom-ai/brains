import { describeImageBytes, IMAGE_HEADER_BYTES } from "@brains/image";
import {
  assetRefSchema,
  getAssetDigest,
  type EntityServiceClient,
} from "@brains/plugins";
import type { ImportResult, RawEntity } from "../types";
import { fileDigest, type FileOperations } from "./file-operations";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "./import-persistence";
import { recordImportIssue, recordSkippedImport } from "./import-result";

/** What importing an image file needs: persistence plus file stats. */
export interface ImageFileImportDeps extends ImportPersistenceDeps {
  fileOperations: Pick<FileOperations, "statEntityFile">;
}

type WriteSnapshot = Awaited<
  ReturnType<EntityServiceClient["getEntityWriteSnapshot"]>
>;

/**
 * Import a binary image file of an asset-backed type without ever holding it
 * whole: hash it as a stream, describe it from its header and stage it from a
 * file stream. Unchanged and unsupported files are skipped in place.
 */
export async function importImageFile(
  deps: ImageFileImportDeps,
  filePath: string,
  admission: { entityType: string; id: string },
  snapshot: WriteSnapshot,
  result: ImportResult,
): Promise<void> {
  const file = await deps.fileOperations.statEntityFile(
    filePath,
    deps.maxAssetImportBytes,
  );
  if (file.entityType !== admission.entityType || file.id !== admission.id)
    throw new Error("Directory import destination changed after admission");

  const stored = assetRefSchema.safeParse(snapshot?.entity.content);
  if (
    stored.success &&
    getAssetDigest(stored.data) === (await fileDigest(file.fullPath))
  ) {
    recordSkippedImport(result);
    return;
  }

  const described = describeImageBytes(
    await Bun.file(file.fullPath).slice(0, IMAGE_HEADER_BYTES).bytes(),
  );
  if (!described) {
    recordSkippedImport(result);
    recordImportIssue(
      result,
      filePath,
      "Skipped: the file is not a PNG, JPEG, GIF or WebP image.",
    );
    return;
  }

  const stagedAsset = await deps.entityService.stageAsset(
    Bun.file(file.fullPath).stream(),
    { maxBytes: deps.maxAssetImportBytes, expectedSize: file.sizeBytes },
  );
  const rawEntity: RawEntity = {
    entityType: file.entityType,
    id: file.id,
    content: stagedAsset.ref,
    created: file.created,
    updated: file.updated,
  };
  await persistImportEntity(
    deps,
    rawEntity,
    {
      entityType: file.entityType,
      id: file.id,
      content: stagedAsset.ref,
      metadata: { ...described, sizeBytes: stagedAsset.sizeBytes },
    },
    filePath,
    result,
    snapshot,
    stagedAsset,
  );
}
