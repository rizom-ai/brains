import { createHash } from "node:crypto";
import {
  describeImageBytes,
  IMAGE_HEADER_BYTES,
  tryParseDataUrl,
} from "@brains/image";
import {
  assetRefSchema,
  base64AssetSource,
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

  const storedDigest = storedImageDigest(snapshot?.entity.content);
  if (
    storedDigest !== undefined &&
    storedDigest === (await fileDigest(file.fullPath))
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

/**
 * The digest of the bytes a row stores: its asset reference's, or for a row
 * not yet migrated, its inline data URL's decoded bytes. Matching an inline
 * row leaves it inline for the offline migration instead of rewriting it on
 * import. Undefined when the row stores neither.
 */
function storedImageDigest(content: string | undefined): string | undefined {
  const ref = assetRefSchema.safeParse(content);
  if (ref.success) return getAssetDigest(ref.data);
  const inline = content === undefined ? undefined : tryParseDataUrl(content);
  if (!inline) return undefined;
  const hash = createHash("sha256");
  try {
    for (const slice of base64AssetSource(inline.base64)) hash.update(slice);
  } catch {
    // A malformed inline payload stores no bytes this file could match.
    return undefined;
  }
  return hash.digest("hex");
}
