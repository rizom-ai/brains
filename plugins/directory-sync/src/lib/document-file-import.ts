import { isLegacyPendingDocumentBytes } from "@brains/document";
import {
  assetRefSchema,
  type ServiceEntityMirrorClient,
} from "@brains/sdk/internal/service-runtime";
import type { ImportResult, RawEntity } from "../types";
import {
  fileDigest,
  storedBytesDigest,
  type FileOperations,
} from "./file-operations";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "./import-persistence";
import {
  recordImportIssue,
  recordLegacyPlaceholderSkip,
  recordSkippedImport,
} from "./import-result";

/** What importing a document file needs: persistence plus file reads. */
export interface DocumentFileImportDeps extends ImportPersistenceDeps {
  fileOperations: Pick<
    FileOperations,
    "statEntityFile" | "readDocumentSidecar"
  >;
}

type WriteSnapshot = Awaited<
  ReturnType<ServiceEntityMirrorClient["getEntityWriteSnapshot"]>
>;

/** Every PDF starts with this signature. */
const PDF_SIGNATURE = "%PDF-";

/**
 * Import a PDF file of an asset-backed document type without ever holding it
 * whole: its digest is streamed and its bytes staged from a file stream. Its
 * sidecar is the document's metadata; the file's size is recorded beside it.
 * A file holding the stored bytes keeps them, so only a changed sidecar is
 * written, and an unchanged pair is skipped in place.
 */
export async function importDocumentFile(
  deps: DocumentFileImportDeps,
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

  const signature = await Bun.file(file.fullPath)
    .slice(0, PDF_SIGNATURE.length)
    .text();
  if (signature !== PDF_SIGNATURE) {
    recordSkippedImport(result);
    recordImportIssue(result, filePath, "Skipped: the file is not a PDF.");
    return;
  }

  const digest = await fileDigest(file.fullPath);
  if (isLegacyPendingDocumentBytes(digest)) {
    recordLegacyPlaceholderSkip(result, filePath);
    return;
  }

  const sidecar = await deps.fileOperations.readDocumentSidecar(
    file.fullPath,
    filePath,
  );
  const existing = snapshot?.entity;
  const storedDigest =
    existing === undefined ? undefined : storedBytesDigest(existing.content);
  const sameBytes = storedDigest !== undefined && storedDigest === digest;
  if (sameBytes && existing && sameMetadata(existing.metadata, sidecar)) {
    recordSkippedImport(result);
    return;
  }

  // The stored asset already holds these bytes: only the metadata changes.
  const kept =
    sameBytes && assetRefSchema.safeParse(existing?.content).success
      ? existing?.content
      : undefined;
  const stagedAsset = kept
    ? undefined
    : await deps.entityService.stageAsset(Bun.file(file.fullPath).stream(), {
        maxBytes: deps.maxAssetImportBytes,
        expectedSize: file.sizeBytes,
      });
  const content = stagedAsset?.ref ?? kept ?? "";
  const metadata = { ...sidecar, sizeBytes: file.sizeBytes };
  const rawEntity: RawEntity = {
    entityType: file.entityType,
    id: file.id,
    content,
    metadata,
    created: file.created,
    updated: file.updated,
  };
  await persistImportEntity(
    deps,
    rawEntity,
    { entityType: file.entityType, id: file.id, content, metadata },
    filePath,
    result,
    snapshot,
    stagedAsset,
  );
}

/** The stored metadata against the sidecar's, the recorded size aside. */
function sameMetadata(
  stored: Record<string, unknown>,
  sidecar: Record<string, unknown>,
): boolean {
  const { sizeBytes: _size, ...rest } = stored;
  return Bun.deepEquals(rest, sidecar);
}
